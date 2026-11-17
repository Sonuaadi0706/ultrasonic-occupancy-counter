// ESP32 cloud gateway for the Ultrasonic Occupancy Counter.
//
// UNO --UART 9600--> ESP32 --MQTT--> broker --> dashboard (live)
//                          \--HTTPS POST /api/ingest/event--> Turso (history)
//
// Implements the contract in docs/CLOUD_DASHBOARD_HANDOFF.md, behaving like
// occupancy-dashboard/scripts/mock-device.ts:
//   counter/<id>/status  retained, Last Will "offline"
//   counter/<id>/state   retained, every 700 ms
//   counter/<id>/event   one per UNO "E," line (also POSTed to the ingest API)
//   counter/<id>/cmd     subscribed; forwarded to the UNO
//   counter/<id>/ack     published when the UNO answers "A,verb,OK|ERR"
//
// Board: "ESP32 Dev Module". Libraries (Library Manager):
//   - PubSubClient by Nick O'Leary
//   - ArduinoJson by Benoit Blanchon (v7)
//
// Wiring: UNO TX -> ESP32 GPIO16 (RX2) through a voltage divider (5 V -> 3.3 V,
//         e.g. 1 kΩ / 2 kΩ). ESP32 GPIO17 (TX2) -> UNO RX. Common GND.
//
// LINK_USB 1 (set in secrets.h): no Wi-Fi. The same JSON goes out over the USB
// cable as lines "@state {...}", "@event {...}", "@ack {...}", and
// occupancy-dashboard/scripts/serial-bridge.ts relays them to MQTT + the ingest
// API. The bridge sends back "@time <epochMs>" (clock) and "@cmd {...}" lines.
// Any other line on USB is plain debug output.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include "secrets.h"   // copy secrets.example.h -> secrets.h

#ifndef LINK_USB
#define LINK_USB 0
#endif

// ── Pins / timing ────────────────────────────────────────────────────────────
static const int UNO_RX_PIN = 16;
static const int UNO_TX_PIN = 17;
static const uint32_t UNO_BAUD = 9600;
static const uint32_t STATE_PERIOD_MS = 700;
static const uint32_t UNO_TIMEOUT_MS = 3000;   // no "S," line for this long -> unoOnline=false
static const uint32_t CMD_ACK_TIMEOUT_MS = 3000;

// ── Topics ───────────────────────────────────────────────────────────────────
static const String T_STATUS = String("counter/") + DEVICE_ID + "/status";
static const String T_STATE  = String("counter/") + DEVICE_ID + "/state";
static const String T_EVENT  = String("counter/") + DEVICE_ID + "/event";
static const String T_CMD    = String("counter/") + DEVICE_ID + "/cmd";
static const String T_ACK    = String("counter/") + DEVICE_ID + "/ack";
static const String WILL_PAYLOAD = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"status\":\"offline\"}";

// ── Network clients ──────────────────────────────────────────────────────────
#if MQTT_USE_TLS
WiFiClientSecure netMqtt;
#else
WiFiClient netMqtt;
#endif
PubSubClient mqtt(netMqtt);

// ── Latest UNO state ─────────────────────────────────────────────────────────
struct UnoState {
  int count = 0, capacity = 10, in = 0, out = 0;
  int distA = 0, distB = 0, threshold = 80;
  uint32_t flags = 0;
  long seq = 0;
  bool queueMode = false;
  bool received = false;
  uint32_t lastRxMs = 0;
} uno;

// ── Events waiting to be published (held until NTP time is valid) ────────────
struct PendingEvent {
  long seq;
  char type[12];
  int delta, count, capacity;
  bool queueMode;
  uint32_t rxMs;   // millis() when the UNO reported it; converted to epoch at send time
};
static const int OUTBOX_SIZE = 32;
PendingEvent outbox[OUTBOX_SIZE];
int outHead = 0, outCount = 0;

// ── Commands waiting for the UNO's "A," reply ────────────────────────────────
struct PendingCmd {
  bool used = false;
  char verb[12];
  char cmdId[64];
  uint32_t sentMs;
};
PendingCmd pendingCmds[8];

// ── HTTPS ingest runs on its own task so it never blocks UART / MQTT ─────────
static const int INGEST_JSON_MAX = 384;
QueueHandle_t ingestQueue;

char bootId[9];

// ═════════════════════════════════════════════════════════════════════════════
// Time helpers
// ═════════════════════════════════════════════════════════════════════════════
bool timeValid() { return time(nullptr) > 1700000000; }

uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

// ═════════════════════════════════════════════════════════════════════════════
// UNO commands
// ═════════════════════════════════════════════════════════════════════════════
// Format parsed by code/uno/room_counter: "C,<VERB>[,<value>]\n",
// e.g. "C,CAP,15", "C,MODE,QUEUE", "C,RESET". The UNO uppercases the mode value.
void sendUnoCommand(const char* verb, const String& value) {
  String line = String("C,") + verb;
  if (value.length()) line += "," + value;
  Serial2.print(line + "\n");
  Serial.printf("-> UNO %s\n", line.c_str());
}

const char* verbFor(const char* cmd) {
  if (!strcmp(cmd, "mode")) return "MODE";
  if (!strcmp(cmd, "capacity")) return "CAP";
  if (!strcmp(cmd, "threshold")) return "THRESH";
  if (!strcmp(cmd, "correct")) return "CORRECT";
  if (!strcmp(cmd, "reset")) return "RESET";
  if (!strcmp(cmd, "beep")) return "BEEP";
  if (!strcmp(cmd, "status")) return "STATUS";
  return nullptr;
}

// Send one message: over MQTT (Wi-Fi mode) or as an "@kind {json}" USB line.
void emit(const char* kind, const char* json, size_t n, bool retained) {
  if (LINK_USB) {
    Serial.print('@');
    Serial.print(kind);
    Serial.print(' ');
    Serial.write((const uint8_t*)json, n);
    Serial.print('\n');
    return;
  }
  if (!mqtt.connected()) return;
  String topic = String("counter/") + DEVICE_ID + "/" + kind;
  mqtt.publish(topic.c_str(), (const uint8_t*)json, n, retained);
}

void publishAck(const char* cmdId, const char* verb, bool ok) {
  JsonDocument d;
  d["cmdId"] = cmdId;
  d["verb"] = verb;
  d["ok"] = ok;
  d["ts"] = epochMs();
  char buf[192];
  size_t n = serializeJson(d, buf);
  emit("ack", buf, n, false);
  Serial.printf("ack %s %s %s\n", verb, ok ? "OK" : "ERR", cmdId);
}

void handleCommand(const byte* payload, unsigned int len);

void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  if (T_CMD != topic) return;
  handleCommand(payload, len);
}

void handleCommand(const byte* payload, unsigned int len) {
  JsonDocument d;
  if (deserializeJson(d, payload, len)) { Serial.println("bad cmd JSON"); return; }

  const char* cmdId = d["cmdId"] | "";
  const char* cmd = d["cmd"] | "";
  const char* verb = verbFor(cmd);
  if (!verb) { publishAck(cmdId, "UNKNOWN", false); return; }

  String value;
  if (d["value"].is<const char*>()) value = d["value"].as<const char*>();
  else if (d["value"].is<int>()) value = String(d["value"].as<int>());

  // Remember cmdId so the UNO's "A,<verb>,OK" can be matched back to it.
  int slot = -1;
  for (int i = 0; i < 8 && slot < 0; i++) if (pendingCmds[i].used && !strcmp(pendingCmds[i].verb, verb)) slot = i;
  for (int i = 0; i < 8 && slot < 0; i++) if (!pendingCmds[i].used) slot = i;
  if (slot < 0) slot = 0;
  pendingCmds[slot].used = true;
  strlcpy(pendingCmds[slot].verb, verb, sizeof(pendingCmds[slot].verb));
  strlcpy(pendingCmds[slot].cmdId, cmdId, sizeof(pendingCmds[slot].cmdId));
  pendingCmds[slot].sentMs = millis();

  sendUnoCommand(verb, value);
}

void checkCmdTimeouts() {
  for (auto& p : pendingCmds) {
    if (p.used && millis() - p.sentMs > CMD_ACK_TIMEOUT_MS) {
      publishAck(p.cmdId, p.verb, false);
      p.used = false;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UART parsing
// ═════════════════════════════════════════════════════════════════════════════
int split(char* line, char** out, int max) {
  int n = 0;
  char* p = line;
  out[n++] = p;
  while (*p && n < max) {
    if (*p == ',') { *p = 0; out[n++] = p + 1; }
    p++;
  }
  return n;
}

// The UNO sends 0 = room, 1 = queue; "room"/"queue" text is accepted too.
bool parseQueueMode(const char* s) {
  return s[0] == 'q' || s[0] == 'Q' || s[0] == '1';
}

void handleUnoLine(char* line) {
  char* f[14];
  int n = split(line, f, 14);

  // S,count,mode,capacity,in,out,distA,distB,threshold,flags,seq,millis
  if (!strcmp(f[0], "S") && n >= 12) {
    uno.count = atoi(f[1]);
    uno.queueMode = parseQueueMode(f[2]);
    uno.capacity = atoi(f[3]);
    uno.in = atoi(f[4]);
    uno.out = atoi(f[5]);
    uno.distA = atoi(f[6]);
    uno.distB = atoi(f[7]);
    uno.threshold = atoi(f[8]);
    uno.flags = strtoul(f[9], nullptr, 0);   // decimal or 0x.. hex
    uno.seq = atol(f[10]);
    uno.received = true;
    uno.lastRxMs = millis();
    return;
  }

  // E,seq,type,delta,count,millis
  if (!strcmp(f[0], "E") && n >= 6) {
    if (outCount == OUTBOX_SIZE) { outHead = (outHead + 1) % OUTBOX_SIZE; outCount--; }  // drop oldest
    PendingEvent& e = outbox[(outHead + outCount) % OUTBOX_SIZE];
    e.seq = atol(f[1]);
    strlcpy(e.type, f[2], sizeof(e.type));
    e.delta = atoi(f[3]);
    e.count = atoi(f[4]);
    e.capacity = uno.capacity;
    e.queueMode = uno.queueMode;
    e.rxMs = millis();
    outCount++;
    uno.count = e.count;
    return;
  }

  // A,verb,OK|ERR
  if (!strcmp(f[0], "A") && n >= 3) {
    bool ok = !strcmp(f[2], "OK");
    for (auto& p : pendingCmds) {
      if (p.used && !strcmp(p.verb, f[1])) {
        publishAck(p.cmdId, p.verb, ok);
        p.used = false;
        return;
      }
    }
    Serial.printf("unmatched UNO ack %s\n", f[1]);
  }
}

void readUno() {
  static char buf[128];
  static int len = 0;
  while (Serial2.available()) {
    char c = Serial2.read();
    if (c == '\r') continue;
    if (c == '\n') {
      buf[len] = 0;
      if (len) handleUnoLine(buf);
      len = 0;
    } else if (len < (int)sizeof(buf) - 1) {
      buf[len++] = c;
    } else {
      len = 0;  // overlong line: discard
    }
  }
}

// USB link: "@time <epochMs>" sets the clock, "@cmd {json}" is a dashboard command.
void readUsb() {
  static char buf[512];
  static int len = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (len < (int)sizeof(buf) - 1) buf[len++] = c; else len = 0;
      continue;
    }
    buf[len] = 0;
    if (!strncmp(buf, "@time ", 6)) {
      uint64_t ms = strtoull(buf + 6, nullptr, 10);
      struct timeval tv = { (time_t)(ms / 1000), (suseconds_t)((ms % 1000) * 1000) };
      settimeofday(&tv, nullptr);
    } else if (!strncmp(buf, "@cmd ", 5)) {
      handleCommand((const byte*)(buf + 5), len - 5);
    }
    len = 0;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Publishing
// ═════════════════════════════════════════════════════════════════════════════
void flushOutbox() {
  while (outCount && timeValid()) {
    PendingEvent& e = outbox[outHead];
    uint64_t ts = epochMs() - (millis() - e.rxMs);

    JsonDocument d;
    char eventId[64];
    snprintf(eventId, sizeof(eventId), "%s-%s-%ld", DEVICE_ID, bootId, e.seq);
    d["eventId"] = eventId;
    d["deviceId"] = DEVICE_ID;
    d["seq"] = e.seq;
    d["type"] = e.type;
    d["delta"] = e.delta;
    d["count"] = e.count;
    d["mode"] = e.queueMode ? "queue" : "room";
    d["capacity"] = e.capacity;
    d["ts"] = ts;

    char buf[INGEST_JSON_MAX];
    size_t n = serializeJson(d, buf, sizeof(buf));
    emit("event", buf, n, false);   // over USB the bridge also POSTs it to the ingest API
    if (!LINK_USB && xQueueSend(ingestQueue, buf, 0) != pdTRUE) Serial.println("ingest queue full, event dropped from history");
    Serial.printf("event %s count=%d\n", e.type, e.count);

    outHead = (outHead + 1) % OUTBOX_SIZE;
    outCount--;
  }
}

void publishState() {
  bool unoOnline = uno.received && millis() - uno.lastRxMs < UNO_TIMEOUT_MS;

  JsonDocument d;
  d["deviceId"] = DEVICE_ID;
  d["ts"] = epochMs();
  d["unoOnline"] = unoOnline;
  d["count"] = uno.count;
  d["mode"] = uno.queueMode ? "queue" : "room";
  d["capacity"] = uno.capacity;
  d["in"] = uno.in;
  d["out"] = uno.out;
  d["distanceA"] = uno.distA;
  d["distanceB"] = uno.distB;
  d["threshold"] = uno.threshold;
  // Bit order from sendState() in code/uno/room_counter.
  JsonObject fl = d["flags"].to<JsonObject>();
  fl["activeA"] = (bool)(uno.flags & 0x01);
  fl["activeB"] = (bool)(uno.flags & 0x02);
  fl["full"]    = (bool)(uno.flags & 0x04);
  fl["faultA"]  = (bool)(uno.flags & 0x08);
  fl["faultB"]  = (bool)(uno.flags & 0x10);
  d["sequence"] = uno.seq;
  JsonObject esp = d["esp"].to<JsonObject>();
  esp["rssi"] = WiFi.RSSI();
  esp["uptimeMs"] = millis();
  esp["freeHeap"] = ESP.getFreeHeap();
  esp["ip"] = LINK_USB ? String("usb") : WiFi.localIP().toString();

  char buf[640];
  size_t n = serializeJson(d, buf, sizeof(buf));
  emit("state", buf, n, true);  // retained
}

// ═════════════════════════════════════════════════════════════════════════════
// Ingest task (core 0)
// ═════════════════════════════════════════════════════════════════════════════
void ingestTask(void*) {
  char body[INGEST_JSON_MAX];
  bool https = strncmp(INGEST_URL, "https", 5) == 0;
  WiFiClientSecure secure;
  WiFiClient plain;
  if (https) {
    if (strlen(ROOT_CA)) secure.setCACert(ROOT_CA); else secure.setInsecure();
  }

  for (;;) {
    if (xQueueReceive(ingestQueue, body, portMAX_DELAY) != pdTRUE) continue;
    for (int attempt = 1; attempt <= 3; attempt++) {
      while (WiFi.status() != WL_CONNECTED) vTaskDelay(pdMS_TO_TICKS(1000));
      HTTPClient http;
      http.setTimeout(5000);
      bool began = https ? http.begin(secure, INGEST_URL) : http.begin(plain, INGEST_URL);
      if (!began) { vTaskDelay(pdMS_TO_TICKS(500 * attempt)); continue; }
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + INGEST_TOKEN);
      int code = http.POST((uint8_t*)body, strlen(body));
      http.end();
      Serial.printf("  ingest %d\n", code);
      if (code == 200 || code == 201) break;                    // stored / duplicate
      if (code >= 400 && code < 500) {                          // bad token / bad data: retry won't help
        Serial.println("  ingest rejected (check INGEST_TOKEN, deviceId, clock)");
        break;
      }
      vTaskDelay(pdMS_TO_TICKS(500 * attempt));                 // network error or 5xx
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Connections
// ═════════════════════════════════════════════════════════════════════════════
void ensureMqtt() {
  static uint32_t nextTry = 0, backoff = 1000;
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED || millis() < nextTry) return;
#if MQTT_USE_TLS
  if (!timeValid()) return;  // TLS cert validation needs the clock
#endif

  String clientId = String("device-") + DEVICE_ID + "-" + bootId;
  const char* user = strlen(MQTT_USERNAME) ? MQTT_USERNAME : nullptr;
  const char* pass = strlen(MQTT_PASSWORD) ? MQTT_PASSWORD : nullptr;
  Serial.printf("MQTT connecting to %s:%d ...\n", MQTT_HOST, MQTT_PORT);

  if (mqtt.connect(clientId.c_str(), user, pass, T_STATUS.c_str(), 1, true, WILL_PAYLOAD.c_str())) {
    Serial.println("MQTT connected");
    backoff = 1000;
    char online[128];
    snprintf(online, sizeof(online), "{\"deviceId\":\"%s\",\"status\":\"online\",\"ts\":%llu}", DEVICE_ID, epochMs());
    mqtt.publish(T_STATUS.c_str(), online, true);
    mqtt.subscribe(T_CMD.c_str(), 1);
  } else {
    Serial.printf("MQTT failed, rc=%d (4/5 = bad username/password or ACL)\n", mqtt.state());
    nextTry = millis() + backoff;
    backoff = min<uint32_t>(backoff * 2, 30000);
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.setRxBufferSize(1024);
  Serial2.begin(UNO_BAUD, SERIAL_8N1, UNO_RX_PIN, UNO_TX_PIN);

  snprintf(bootId, sizeof(bootId), "%08x", (unsigned)esp_random());

  if (LINK_USB) {
    WiFi.mode(WIFI_OFF);
    Serial.println("Cloud gateway: USB link mode (run `npm run bridge` on the Mac)");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Wi-Fi connecting to %s\n", WIFI_SSID);

  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC

#if MQTT_USE_TLS
  if (strlen(ROOT_CA)) netMqtt.setCACert(ROOT_CA); else netMqtt.setInsecure();
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(1024);   // state JSON is ~500 bytes; default 256 is too small
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(5);

  ingestQueue = xQueueCreate(16, INGEST_JSON_MAX);
  xTaskCreatePinnedToCore(ingestTask, "ingest", 10240, nullptr, 1, nullptr, 0);
}

void loop() {
  if (LINK_USB) {
    readUno();
    readUsb();
    flushOutbox();
    checkCmdTimeouts();
    static uint32_t lastUsbState = 0;
    if (timeValid() && millis() - lastUsbState >= STATE_PERIOD_MS) {
      lastUsbState = millis();
      publishState();
    }
    return;
  }

  static bool wasWifi = false;
  bool wifi = WiFi.status() == WL_CONNECTED;
  if (wifi && !wasWifi) Serial.printf("Wi-Fi connected, IP %s\n", WiFi.localIP().toString().c_str());
  wasWifi = wifi;

  readUno();
  ensureMqtt();
  mqtt.loop();
  flushOutbox();
  checkCmdTimeouts();

  static uint32_t lastState = 0;
  if (mqtt.connected() && timeValid() && millis() - lastState >= STATE_PERIOD_MS) {
    lastState = millis();
    publishState();
  }
}

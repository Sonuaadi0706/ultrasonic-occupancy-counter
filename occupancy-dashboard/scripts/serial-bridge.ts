// USB serial bridge: lets the real ESP32 talk to the dashboard over its USB cable,
// with no Wi-Fi. Flash the gateway with LINK_USB 1 in secrets.h, then `npm run bridge`.
//
// ESP32 -> Mac lines:  "@state {json}"  "@event {json}"  "@ack {json}"   (anything else = debug)
// Mac -> ESP32 lines:  "@time <epochMs>" (clock sync)   "@cmd {json}"  (dashboard command)
//
// Relays to MQTT exactly like the Wi-Fi gateway would (status/state/event/ack, cmd)
// and POSTs every event to /api/ingest/event with the Bearer token.
import mqtt from "mqtt";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID || "room-01";
const MQTT_URL = process.env.DEVICE_MQTT_URL || process.env.MQTT_URL || "mqtt://localhost:1883";
const INGEST_URL = process.env.INGEST_URL || "http://localhost:3000/api/ingest/event";
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";
const STALE_MS = 3000;
const T = (s: string) => `counter/${DEVICE_ID}/${s}`;
const OFFLINE = JSON.stringify({ deviceId: DEVICE_ID, status: "offline" });

async function findPort(): Promise<string> {
  if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT;
  const ports = await SerialPort.list();
  const p = ports.find((x) => /usbserial|usbmodem|SLAB|wchusbserial/i.test(x.path));
  if (!p) throw new Error("No ESP32 serial port found. Plug it in or set SERIAL_PORT.");
  return p.path.replace("/dev/tty.", "/dev/cu.");
}

const client = mqtt.connect(MQTT_URL, {
  clientId: `bridge-${DEVICE_ID}-${Math.random().toString(16).slice(2, 6)}`,
  username: process.env.DEVICE_MQTT_USERNAME,
  password: process.env.DEVICE_MQTT_PASSWORD,
  will: { topic: T("status"), payload: Buffer.from(OFFLINE), qos: 1, retain: true },
  reconnectPeriod: 2000,
});
client.on("connect", () => {
  console.log(`MQTT connected ${MQTT_URL}`);
  client.subscribe(T("cmd"), { qos: 1 });
});
client.on("error", (e) => console.warn("MQTT error:", e.message));

async function ingest(body: string, attempt = 1): Promise<void> {
  try {
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_TOKEN}`, "Content-Type": "application/json" },
      body,
    });
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (r.status >= 400) console.warn(`  ingest ${r.status}: ${await r.text()}`);
    else console.log(`  ingest ${r.status}`);
  } catch (e) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 500 * attempt));
      return ingest(body, attempt + 1);
    }
    console.warn(`  ingest failed: ${(e as Error).message}`);
  }
}

let online = false;
let lastStateAt = 0;
function setOnline(v: boolean) {
  if (v === online) return;
  online = v;
  const payload = v ? JSON.stringify({ deviceId: DEVICE_ID, status: "online", ts: Date.now() }) : OFFLINE;
  client.publish(T("status"), payload, { qos: 1, retain: true });
  console.log(`device ${v ? "ONLINE" : "OFFLINE"}`);
}

const path = await findPort();
const port = new SerialPort({ path, baudRate: 115200 });
const lines = port.pipe(new ReadlineParser({ delimiter: "\n" }));
const sendTime = () => port.write(`@time ${Date.now()}\n`);

let openedAt = Date.now();
port.on("open", () => {
  openedAt = Date.now();
  console.log(`serial open ${path}`);
  // The ESP32 may reset when the port opens; keep its clock synced.
  setTimeout(sendTime, 1500);
});
port.on("error", (e) => console.warn("serial error:", e.message));
port.on("close", () => {
  console.warn("serial closed");
  setOnline(false);
  process.exit(1);
});
setInterval(sendTime, 10_000);

lines.on("data", (raw: string) => {
  const line = raw.replace(/\r$/, "");
  const m = /^@(state|event|ack) (\{.*\})$/.exec(line);
  if (!m) {
    // Skip half-lines left in the USB buffer from before the port opened.
    if (line.trim() && Date.now() - openedAt > 2000) console.log(`esp | ${line}`);
    return;
  }
  const [, kind, json] = m;
  try {
    JSON.parse(json);
  } catch {
    console.warn(`bad JSON from ESP32: ${line.slice(0, 120)}`);
    return;
  }
  if (kind === "state") {
    lastStateAt = Date.now();
    setOnline(true);
    client.publish(T("state"), json, { qos: 0, retain: true });
  } else if (kind === "event") {
    console.log(`event ${json}`);
    client.publish(T("event"), json, { qos: 1 });
    void ingest(json);
  } else {
    console.log(`ack   ${json}`);
    client.publish(T("ack"), json, { qos: 1 });
  }
});

client.on("message", (topic, payload) => {
  if (topic !== T("cmd")) return;
  const json = payload.toString().replace(/\n/g, " ");
  console.log(`cmd   ${json}`);
  port.write(`@cmd ${json}\n`);
});

// No state for a while (ESP32 unplugged/crashed) -> mark offline.
setInterval(() => {
  if (online && Date.now() - lastStateAt > STALE_MS) setOnline(false);
}, 1000);

process.on("SIGINT", () => {
  client.publish(T("status"), OFFLINE, { qos: 1, retain: true }, () => process.exit(0));
});

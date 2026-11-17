// Mock ESP32 cloud gateway: behaves like the real device on the MQTT + HTTPS contract.
//  - status (retained, with Last Will), state every 700 ms (retained), events (QoS 1)
//  - POSTs every event to /api/ingest/event with the Bearer token (3 retries)
//  - subscribes to cmd, applies it to the simulated UNO, publishes ack with cmdId
import mqtt from "mqtt";
import { topicPrefix } from "../src/lib/mqtt-config.ts";
import { CounterSimulator } from "../src/lib/simulator.ts";

const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID || "room-01";
const URL = process.env.DEVICE_MQTT_URL || "mqtt://localhost:1883";
const INGEST_URL = process.env.INGEST_URL || "http://localhost:3000/api/ingest/event";
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";
const T = (s: string) => `${topicPrefix(URL, process.env.NEXT_PUBLIC_MQTT_TOPIC_PREFIX)}/${DEVICE_ID}/${s}`;

const sim = new CounterSimulator({ deviceId: DEVICE_ID, count: 2, meanGapMs: Number(process.env.MOCK_GAP_MS ?? 4500) });

const client = mqtt.connect(URL, {
  clientId: `device-${DEVICE_ID}-${Math.random().toString(16).slice(2, 6)}`,
  username: process.env.DEVICE_MQTT_USERNAME,
  password: process.env.DEVICE_MQTT_PASSWORD,
  will: { topic: T("status"), payload: Buffer.from(JSON.stringify({ deviceId: DEVICE_ID, status: "offline" })), qos: 1, retain: true },
  reconnectPeriod: 2000,
});

async function ingest(event: unknown, attempt = 1): Promise<void> {
  try {
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (r.status >= 500 && attempt < 3) throw new Error(`HTTP ${r.status}`);
    console.log(`  ingest ${r.status}`);
  } catch (e) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 400 * attempt));
      return ingest(event, attempt + 1);
    }
    console.warn(`  ingest failed: ${(e as Error).message}`);
  }
}

function publishEvents(events: ReturnType<CounterSimulator["tick"]>) {
  for (const e of events) {
    console.log(`event ${e.type.padEnd(8)} count=${e.count}`);
    client.publish(T("event"), JSON.stringify(e), { qos: 1 });
    void ingest(e);
  }
}

let unoLinkLost = false;
client.on("connect", () => {
  console.log(`connected ${URL} as ${DEVICE_ID}`);
  client.publish(T("status"), JSON.stringify({ deviceId: DEVICE_ID, status: "online", ts: Date.now() }), { qos: 1, retain: true });
  client.subscribe(T("cmd"), { qos: 1 });
});
client.on("error", (e) => console.warn("mqtt error", e.message));

client.on("message", (topic, payload) => {
  if (topic !== T("cmd")) return;
  try {
    const cmd = JSON.parse(payload.toString());
    console.log(`cmd   ${cmd.cmd} ${cmd.value ?? ""} (${cmd.cmdId})`);
    const { ack, events } = sim.command(cmd);
    publishEvents(events);
    setTimeout(() => client.publish(T("ack"), JSON.stringify({ ...ack, ts: Date.now() }), { qos: 1 }), 150 + Math.random() * 250);
  } catch (e) {
    console.warn("bad cmd", (e as Error).message);
  }
});

setInterval(() => publishEvents(sim.tick()), 60);
setInterval(() => {
  if (!client.connected) return;
  sim.state.unoOnline = !unoLinkLost;
  client.publish(T("state"), JSON.stringify(sim.state), { qos: 0, retain: true });
}, 700);

// Keyboard: u = toggle UNO link, p = pause traffic, q = quit (graceful offline)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on("data", (b) => {
    const k = b.toString();
    if (k === "u") {
      unoLinkLost = !unoLinkLost;
      console.log(`UNO link ${unoLinkLost ? "LOST" : "restored"}`);
    } else if (k === "p") {
      sim.traffic = !sim.traffic;
      console.log(`traffic ${sim.traffic ? "on" : "paused"}`);
    } else if (k === "q" || k === "\u0003") {
      client.publish(T("status"), JSON.stringify({ deviceId: DEVICE_ID, status: "offline" }), { qos: 1, retain: true }, () => process.exit(0));
    } else if (k === "k") {
      console.log("simulating crash (Last Will fires)");
      (client as unknown as { stream: { destroy(): void } }).stream.destroy();
      process.exit(0);
    }
  });
  console.log("keys: u=toggle UNO link  p=pause traffic  k=crash (LWT)  q=quit");
}

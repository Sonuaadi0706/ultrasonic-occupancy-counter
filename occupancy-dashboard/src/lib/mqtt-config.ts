// Shared MQTT defaults for the dashboard, server routes and Node scripts.
// No runtime imports, so scripts can load it with plain Node.
//
// With no broker configured, everything falls back to the free public EMQX broker.
// Topics on that broker live under a random prefix so other users of the shared
// broker don't collide with this device. Set your own broker (e.g. EMQX Cloud)
// with NEXT_PUBLIC_MQTT_URL / MQTT_URL to use plain "counter/<id>/..." topics.

export const PUBLIC_BROKER_HOST = "broker.emqx.io";
export const PUBLIC_BROKER = {
  /** Browser: MQTT over secure WebSockets */
  wss: `wss://${PUBLIC_BROKER_HOST}:8084/mqtt`,
  /** Server (Vercel): MQTT over TLS */
  mqtts: `mqtts://${PUBLIC_BROKER_HOST}:8883`,
  /** Devices / bridge: plain MQTT */
  tcp: `mqtt://${PUBLIC_BROKER_HOST}:1883`,
};
export const PUBLIC_TOPIC_PREFIX = "echo-occ-40474638/counter";

/** Topic root for a broker URL: random prefix on the public broker, "counter" elsewhere. */
export function topicPrefix(brokerUrl: string, override?: string): string {
  if (override && override.trim()) return override.trim().replace(/\/+$/, "");
  return brokerUrl.includes(PUBLIC_BROKER_HOST) ? PUBLIC_TOPIC_PREFIX : "counter";
}

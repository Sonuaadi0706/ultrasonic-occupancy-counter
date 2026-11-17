import "server-only";
import mqtt from "mqtt";
import { PUBLIC_BROKER, topicPrefix } from "./mqtt-config";
import type { DeviceCommand } from "./types";

/**
 * Connect → publish QoS 1 → disconnect. No long-lived connection (serverless-safe).
 * Uses MQTT_URL if set, otherwise the public EMQX broker (same one the browser uses).
 */
export async function publishCommand(deviceId: string, command: DeviceCommand): Promise<boolean> {
  const url = process.env.MQTT_URL || PUBLIC_BROKER.mqtts;
  const prefix = topicPrefix(url, process.env.NEXT_PUBLIC_MQTT_TOPIC_PREFIX);

  const client = await mqtt.connectAsync(url, {
    username: process.env.MQTT_WRITE_USERNAME || undefined,
    password: process.env.MQTT_WRITE_PASSWORD || undefined,
    clientId: `server-write-${Math.random().toString(16).slice(2, 10)}`,
    connectTimeout: 5000,
    reconnectPeriod: 0,
    clean: true,
  });
  try {
    await client.publishAsync(`${prefix}/${deviceId}/cmd`, JSON.stringify(command), { qos: 1 });
  } finally {
    await client.endAsync();
  }
  return true;
}

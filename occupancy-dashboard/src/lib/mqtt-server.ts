import "server-only";
import mqtt from "mqtt";
import type { DeviceCommand } from "./types";

/**
 * Connect → publish QoS 1 → disconnect. No long-lived connection (serverless-safe).
 * Returns false when MQTT_URL is not configured (simulator / demo mode).
 */
export async function publishCommand(deviceId: string, command: DeviceCommand): Promise<boolean> {
  const url = process.env.MQTT_URL;
  if (!url) return false;

  const client = await mqtt.connectAsync(url, {
    username: process.env.MQTT_WRITE_USERNAME,
    password: process.env.MQTT_WRITE_PASSWORD,
    clientId: `server-write-${Math.random().toString(16).slice(2, 10)}`,
    connectTimeout: 5000,
    reconnectPeriod: 0,
    clean: true,
  });
  try {
    await client.publishAsync(`counter/${deviceId}/cmd`, JSON.stringify(command), { qos: 1 });
  } finally {
    await client.endAsync();
  }
  return true;
}

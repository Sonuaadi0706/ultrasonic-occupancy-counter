import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { publishCommand } from "@/lib/mqtt-server";
import type { DeviceCommand } from "@/lib/types";
import { validateCommand } from "@/lib/validate";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const deviceId = typeof body.deviceId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(body.deviceId) ? body.deviceId : null;
  if (!deviceId) return Response.json({ error: "deviceId is invalid" }, { status: 400 });

  const v = validateCommand(body.cmd, body.value);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const now = Date.now();
  const command: DeviceCommand = {
    cmdId: `cmd-${Math.floor(now / 1000)}-${randomBytes(3).toString("hex")}`,
    cmd: v.cmd,
    ...(v.value !== undefined ? { value: v.value } : {}),
    ts: now,
  };

  let delivered: boolean;
  try {
    delivered = await publishCommand(deviceId, command);
  } catch (e) {
    return Response.json(
      { error: "Could not reach MQTT broker", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  try {
    const c = await db();
    await c.execute({
      sql: `INSERT OR IGNORE INTO command_audit (cmd_id, device_id, cmd, value, requested_by) VALUES (?, ?, ?, ?, ?)`,
      args: [command.cmdId, deviceId, command.cmd, command.value === undefined ? null : String(command.value), "dashboard"],
    });
  } catch (e) {
    console.error("command_audit insert failed", e);
  }

  // delivered=false means the server has no MQTT_URL, so nothing reached the device.
  return Response.json({ cmdId: command.cmdId, command, delivered, simulated: !delivered }, { status: 202 });
}

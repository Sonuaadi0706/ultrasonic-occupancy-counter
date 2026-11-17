import { COMMANDS, EVENT_TYPES, type CommandName, type DeviceEvent, type EventType } from "./types";

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Accept events up to 30 days old (ESP32 retry queue / backfill) and 10 min in the future. */
const MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 10 * 60 * 1000;

export function validateEvent(body: unknown, now = Date.now()): { ok: true; event: DeviceEvent } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (typeof b.eventId !== "string" || !b.eventId.trim() || b.eventId.length > 128)
    return { ok: false, error: "eventId must be a non-empty string" };
  if (typeof b.deviceId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(b.deviceId))
    return { ok: false, error: "deviceId is invalid" };
  if (!isInt(b.seq) || b.seq < 0) return { ok: false, error: "seq must be a non-negative integer" };
  if (typeof b.type !== "string" || !(EVENT_TYPES as readonly string[]).includes(b.type))
    return { ok: false, error: `type must be one of ${EVENT_TYPES.join(", ")}` };
  if (!isInt(b.delta) || Math.abs(b.delta) > 999) return { ok: false, error: "delta must be an integer in -999..999" };
  if (!isInt(b.count) || b.count < 0 || b.count > 999) return { ok: false, error: "count must be an integer in 0..999" };
  if (b.mode !== "room" && b.mode !== "queue") return { ok: false, error: "mode must be room or queue" };
  if (!isInt(b.capacity) || b.capacity < 1 || b.capacity > 99) return { ok: false, error: "capacity must be 1..99" };
  if (!isInt(b.ts)) return { ok: false, error: "ts must be epoch milliseconds" };
  if (b.ts < now - MAX_PAST_MS || b.ts > now + MAX_FUTURE_MS) return { ok: false, error: "ts outside allowed clock-skew window" };

  return {
    ok: true,
    event: {
      eventId: b.eventId.trim(),
      deviceId: b.deviceId,
      seq: b.seq,
      type: b.type as EventType,
      delta: b.delta,
      count: b.count,
      mode: b.mode,
      capacity: b.capacity,
      ts: b.ts,
    },
  };
}

export function validateCommand(
  cmd: unknown,
  value: unknown,
): { ok: true; cmd: CommandName; value?: string | number } | { ok: false; error: string } {
  if (typeof cmd !== "string" || !(COMMANDS as readonly string[]).includes(cmd))
    return { ok: false, error: `cmd must be one of ${COMMANDS.join(", ")}` };

  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  switch (cmd as CommandName) {
    case "mode":
      if (value !== "room" && value !== "queue") return { ok: false, error: 'mode value must be "room" or "queue"' };
      return { ok: true, cmd: "mode", value };
    case "capacity":
      if (!isInt(num) || num < 1 || num > 99) return { ok: false, error: "capacity must be 1..99" };
      return { ok: true, cmd: "capacity", value: num };
    case "threshold":
      if (!isInt(num) || num < 10 || num > 300) return { ok: false, error: "threshold must be 10..300" };
      return { ok: true, cmd: "threshold", value: num };
    case "correct":
      if (!isInt(num) || num < 0 || num > 999) return { ok: false, error: "correct must be 0..999" };
      return { ok: true, cmd: "correct", value: num };
    default:
      return { ok: true, cmd: cmd as CommandName };
  }
}

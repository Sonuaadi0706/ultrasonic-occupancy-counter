// Shared contract types — mirror docs/CLOUD_DASHBOARD_HANDOFF.md §4.
// This file has no runtime imports so Node scripts can use it via `import type`.

export type Mode = "room" | "queue";

export const EVENT_TYPES = [
  "IN",
  "OUT",
  "FULL",
  "INVALID",
  "TIMEOUT",
  "MODE",
  "CAP",
  "THRESH",
  "RESET",
  "CORRECT",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface DeviceFlags {
  activeA: boolean;
  activeB: boolean;
  full: boolean;
  faultA: boolean;
  faultB: boolean;
}

export interface DeviceState {
  deviceId: string;
  ts: number;
  unoOnline: boolean;
  count: number;
  mode: Mode;
  capacity: number;
  in: number;
  out: number;
  distanceA: number;
  distanceB: number;
  threshold: number;
  flags: DeviceFlags;
  /** Room-mode sequence: 0 idle, 1 A first, 2 B first, 3 wait clear, 4 ambiguous */
  sequence: number;
  esp?: {
    rssi: number;
    uptimeMs: number;
    freeHeap: number;
    ip: string;
  };
}

export interface DeviceStatus {
  deviceId: string;
  status: "online" | "offline";
  ts?: number;
}

export interface DeviceEvent {
  eventId: string;
  deviceId: string;
  seq: number;
  type: EventType;
  delta: number;
  count: number;
  mode: Mode;
  capacity: number;
  ts: number;
}

export const COMMANDS = [
  "mode",
  "capacity",
  "threshold",
  "correct",
  "reset",
  "beep",
  "status",
] as const;
export type CommandName = (typeof COMMANDS)[number];

export interface DeviceCommand {
  cmdId: string;
  cmd: CommandName;
  value?: string | number;
  ts: number;
}

export interface CommandAck {
  cmdId: string;
  verb: string;
  ok: boolean;
  ts: number;
}

/** Row shape returned by GET /api/events (epoch ms for the UI). */
export interface EventRow {
  id: number;
  eventId: string;
  deviceId: string;
  seq: number;
  type: EventType;
  delta: number;
  count: number;
  mode: Mode;
  capacity: number;
  occurredAt: number;
  receivedAt: number;
}

export type SummaryRange = "1h" | "24h" | "7d" | "30d";

export interface Summary {
  deviceId: string;
  range: SummaryRange;
  from: number;
  to: number;
  bucketMs: number;
  timeline: { t: number; count: number; max: number; capacity: number }[];
  buckets: { t: number; in: number; out: number }[];
  totals: {
    in: number;
    out: number;
    invalid: number;
    timeout: number;
    full: number;
    events: number;
  };
  peak: { count: number; at: number | null };
  timeAtCapacityMs: number;
  invalidRatio: number;
  avgOutPerMin: number;
  /** OUT crossings per minute over the last 15 minutes — used for queue wait estimates */
  recentOutPerMin: number;
  /** [weekday 0=Sun..6][hour 0..23] of IN crossings, in the viewer's local time */
  heatmap: number[][];
  capacity: number;
  lastEventAt: number | null;
}

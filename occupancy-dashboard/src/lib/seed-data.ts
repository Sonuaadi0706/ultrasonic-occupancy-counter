// Generates realistic historical events for a room counter.
// Self-contained (no runtime imports) so `scripts/seed.ts` can run it with plain Node.

export interface SeedEvent {
  event_id: string;
  device_id: string;
  seq: number;
  type: string;
  delta: number;
  count_after: number;
  mode: string;
  capacity: number;
  occurred_at: string;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arrivals per minute by local hour — lunch and evening peaks, closed overnight. */
const HOURLY_RATE = [
  0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.22, 0.3, 0.32, 0.4, 0.62, 0.58, 0.36, 0.3, 0.34, 0.46, 0.66, 0.6, 0.38, 0.2, 0.06, 0.01,
];

export function generateSeedEvents(opts: { deviceId?: string; days?: number; capacity?: number; now?: number } = {}): SeedEvent[] {
  const deviceId = opts.deviceId ?? "room-01";
  const days = opts.days ?? 14;
  const capacity = opts.capacity ?? 10;
  const now = opts.now ?? Date.now();
  const rand = mulberry32(1337);
  const out: SeedEvent[] = [];

  const start = new Date(now - days * 86400000);
  start.setHours(0, 0, 0, 0);

  let count = 0;
  let seq = 0;
  let boot = 0;
  // Each person present has a scheduled leave time.
  let leaves: number[] = [];

  const push = (t: number, type: string, delta: number) => {
    out.push({
      event_id: `${deviceId}-seed${boot.toString(36)}-${seq}`,
      device_id: deviceId,
      seq: seq++,
      type,
      delta,
      count_after: count,
      mode: "room",
      capacity,
      occurred_at: new Date(t).toISOString(),
    });
  };

  for (let t = start.getTime(); t < now; t += 60000) {
    const d = new Date(t);
    const hour = d.getHours();
    const weekend = d.getDay() === 0 || d.getDay() === 6;

    // New boot each day at 06:00 — UNO sequence restarts.
    if (hour === 6 && d.getMinutes() === 0) {
      boot++;
      seq = 0;
      if (count > 0) {
        count = 0;
        leaves = [];
        push(t, "RESET", 0);
      }
    }

    // Collect this minute's actions, then apply them in time order so count_after stays consistent.
    const actions: { at: number; kind: "leave" | "arrive" }[] = [];
    leaves.sort((a, b) => a - b);
    while (leaves.length && leaves[0] <= t + 60000) {
      const due = leaves.shift() as number;
      actions.push({ at: Math.max(t, Math.min(due, t + 59000)), kind: "leave" });
    }

    // Arrivals (Poisson approximation)
    const rate = HOURLY_RATE[hour] * (weekend ? 0.4 : 0.7);
    let arrivals = 0;
    let p = Math.exp(-rate);
    let r = rand();
    while (r > p && arrivals < 4) {
      arrivals++;
      r -= p;
      p *= rate / arrivals;
    }
    for (let i = 0; i < arrivals; i++) actions.push({ at: t + Math.floor(rand() * 58000), kind: "arrive" });
    actions.sort((a, b) => a.at - b.at);

    for (const a of actions) {
      if (a.at > now) continue;
      if (a.kind === "leave") {
        if (count === 0) continue;
        if (rand() < 0.02) push(a.at - 300, "TIMEOUT", 0);
        count--;
        push(a.at, "OUT", -1);
        continue;
      }
      if (rand() < 0.03) {
        push(a.at, "INVALID", 0);
        continue;
      }
      if (count >= capacity) continue; // turned away at the door
      count++;
      push(a.at, "IN", 1);
      if (count === capacity) push(a.at + 50, "FULL", 0);
      const stayMin = 5 + Math.floor(rand() * rand() * 48);
      const closing = new Date(t);
      closing.setHours(22, 0, 0, 0);
      leaves.push(Math.min(a.at + stayMin * 60000, closing.getTime() + rand() * 600000));
    }
  }

  out.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));
  return out;
}

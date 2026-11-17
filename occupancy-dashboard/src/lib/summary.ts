import "server-only";
import type { Client } from "@libsql/client";
import type { Summary, SummaryRange } from "./types";

const RANGE_MS: Record<SummaryRange, number> = {
  "1h": 3600_000,
  "24h": 86400_000,
  "7d": 7 * 86400_000,
  "30d": 30 * 86400_000,
};

/** Bar-chart bucket sizes chosen to give ~12–30 bars per range. */
const BAR_BUCKET_MS: Record<SummaryRange, number> = {
  "1h": 5 * 60_000,
  "24h": 3600_000,
  "7d": 6 * 3600_000,
  "30d": 86400_000,
};

export const isRange = (r: string | null): r is SummaryRange => !!r && r in RANGE_MS;

export async function buildSummary(
  db: Client,
  deviceId: string,
  range: SummaryRange,
  tzOffsetMin: number,
  now = Date.now(),
): Promise<Summary> {
  const to = now;
  const from = now - RANGE_MS[range];
  const fromIso = new Date(from).toISOString();

  const [prev, res, dev] = await Promise.all([
    db.execute({
      sql: `SELECT count_after, capacity FROM occupancy_events
            WHERE device_id = ? AND occurred_at < ? ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      args: [deviceId, fromIso],
    }),
    db.execute({
      sql: `SELECT type, delta, count_after, capacity, occurred_at FROM occupancy_events
            WHERE device_id = ? AND occurred_at >= ? ORDER BY occurred_at ASC, id ASC`,
      args: [deviceId, fromIso],
    }),
    db.execute({ sql: `SELECT capacity FROM devices WHERE device_id = ?`, args: [deviceId] }),
  ]);

  let count = prev.rows.length ? Number(prev.rows[0].count_after) : 0;
  let capacity = prev.rows.length ? Number(prev.rows[0].capacity) : dev.rows.length ? Number(dev.rows[0].capacity) : 10;

  const TIMELINE_POINTS = 180;
  const tlBucket = Math.max(60_000, Math.ceil((to - from) / TIMELINE_POINTS));
  const timeline: Summary["timeline"] = [];
  for (let t = from; t < to; t += tlBucket) timeline.push({ t, count, max: count, capacity });

  const barMs = BAR_BUCKET_MS[range];
  const barStart = Math.floor(from / barMs) * barMs;
  const buckets: Summary["buckets"] = [];
  for (let t = barStart; t < to; t += barMs) buckets.push({ t, in: 0, out: 0 });

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const totals = { in: 0, out: 0, invalid: 0, timeout: 0, full: 0, events: res.rows.length };
  let peak = { count, at: null as number | null };
  let timeAtCapacityMs = 0;
  let capSince: number | null = count >= capacity ? from : null;
  let lastEventAt: number | null = null;
  let recentOut = 0;
  const recentFrom = to - 15 * 60_000;

  for (const row of res.rows) {
    const t = Date.parse(String(row.occurred_at));
    const type = String(row.type);
    const after = Number(row.count_after);
    const cap = Number(row.capacity);
    lastEventAt = t;

    // Fill timeline forward: buckets after this one inherit the new count.
    const idx = Math.min(timeline.length - 1, Math.max(0, Math.floor((t - from) / tlBucket)));
    for (let i = idx; i < timeline.length; i++) {
      timeline[i].count = after;
      timeline[i].capacity = cap;
      if (i === idx) timeline[i].max = Math.max(timeline[i].max, after);
      else timeline[i].max = after;
    }

    if (after > peak.count) peak = { count: after, at: t };

    // Time at capacity
    const wasFull = count >= capacity;
    const isFull = after >= cap;
    if (!wasFull && isFull) capSince = t;
    if (wasFull && !isFull && capSince !== null) {
      timeAtCapacityMs += t - capSince;
      capSince = null;
    }
    count = after;
    capacity = cap;

    if (type === "IN" || type === "OUT") {
      const b = Math.floor((t - barStart) / barMs);
      if (buckets[b]) buckets[b][type === "IN" ? "in" : "out"]++;
      if (type === "IN") {
        totals.in++;
        const local = new Date(t - tzOffsetMin * 60_000);
        heatmap[local.getUTCDay()][local.getUTCHours()]++;
      } else {
        totals.out++;
        if (t >= recentFrom) recentOut++;
      }
    } else if (type === "INVALID") totals.invalid++;
    else if (type === "TIMEOUT") totals.timeout++;
    else if (type === "FULL") totals.full++;
  }
  if (capSince !== null) timeAtCapacityMs += to - capSince;

  const crossings = totals.in + totals.out;
  const rejected = totals.invalid + totals.timeout;
  const minutes = (to - from) / 60_000;

  return {
    deviceId,
    range,
    from,
    to,
    bucketMs: barMs,
    timeline,
    buckets,
    totals,
    peak,
    timeAtCapacityMs,
    invalidRatio: crossings + rejected === 0 ? 0 : rejected / (crossings + rejected),
    avgOutPerMin: totals.out / minutes,
    recentOutPerMin: recentOut / Math.min(15, minutes),
    heatmap,
    capacity,
    lastEventAt,
  };
}

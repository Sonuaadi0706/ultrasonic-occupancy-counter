import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { EVENT_TYPES, type EventRow } from "@/lib/types";

// Node.js runtime is the default (required for mqtt + @libsql/client).

const toMs = (v: string | null) => {
  if (!v) return null;
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const deviceId = p.get("deviceId") || "room-01";
  const limit = Math.min(1000, Math.max(1, Number(p.get("limit")) || 200));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const from = toMs(p.get("from"));
  const to = toMs(p.get("to"));
  const types = (p.get("types") || "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => (EVENT_TYPES as readonly string[]).includes(t));

  const where = ["device_id = ?"];
  const args: (string | number)[] = [deviceId];
  if (from !== null) {
    where.push("occurred_at >= ?");
    args.push(new Date(from).toISOString());
  }
  if (to !== null) {
    where.push("occurred_at <= ?");
    args.push(new Date(to).toISOString());
  }
  if (types.length) {
    where.push(`type IN (${types.map(() => "?").join(",")})`);
    args.push(...types);
  }

  try {
    const c = await db();
    const [rows, total] = await Promise.all([
      c.execute({
        sql: `SELECT id, event_id, device_id, seq, type, delta, count_after, mode, capacity, occurred_at, received_at
              FROM occupancy_events WHERE ${where.join(" AND ")}
              ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      c.execute({ sql: `SELECT COUNT(*) AS n FROM occupancy_events WHERE ${where.join(" AND ")}`, args }),
    ]);
    const events: EventRow[] = rows.rows.map((r) => ({
      id: Number(r.id),
      eventId: String(r.event_id),
      deviceId: String(r.device_id),
      seq: Number(r.seq),
      type: String(r.type) as EventRow["type"],
      delta: Number(r.delta),
      count: Number(r.count_after),
      mode: String(r.mode) as EventRow["mode"],
      capacity: Number(r.capacity),
      occurredAt: Date.parse(String(r.occurred_at)),
      // SQLite datetime('now') is UTC without a zone marker.
      receivedAt: Date.parse(String(r.received_at).replace(" ", "T") + (String(r.received_at).endsWith("Z") ? "" : "Z")),
    }));
    return Response.json({ events, total: Number(total.rows[0].n), limit, offset });
  } catch (e) {
    return Response.json({ error: "History unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

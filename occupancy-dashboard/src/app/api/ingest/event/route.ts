import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { validateEvent } from "@/lib/validate";

// Node.js runtime is the default (required for mqtt + @libsql/client).

function tokenOk(header: string | null) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenOk(req.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const v = validateEvent(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const e = v.event;

  try {
    const c = await db();
    const dev = await c.execute({ sql: "SELECT 1 FROM devices WHERE device_id = ?", args: [e.deviceId] });
    if (!dev.rows.length) return Response.json({ error: `Unknown deviceId ${e.deviceId}` }, { status: 400 });

    const [ins] = await c.batch(
      [
        {
          sql: `INSERT OR IGNORE INTO occupancy_events
                (event_id, device_id, seq, type, delta, count_after, mode, capacity, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [e.eventId, e.deviceId, e.seq, e.type, e.delta, e.count, e.mode, e.capacity, new Date(e.ts).toISOString()],
        },
        {
          sql: `UPDATE devices SET last_seen_at = ?, capacity = ? WHERE device_id = ?`,
          args: [new Date().toISOString(), e.capacity, e.deviceId],
        },
      ],
      "write",
    );
    const inserted = ins.rowsAffected > 0;
    return Response.json({ ok: true, duplicate: !inserted, eventId: e.eventId }, { status: inserted ? 201 : 200 });
  } catch (err) {
    return Response.json({ error: "Database unavailable", detail: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}

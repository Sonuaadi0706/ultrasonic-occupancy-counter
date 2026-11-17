import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// Node.js runtime is the default (required for mqtt + @libsql/client).

const RANGE: Record<string, number> = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, all: 3650 * 86400e3 };

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const deviceId = p.get("deviceId") || "room-01";
  const range = p.get("range") || "7d";
  const span = RANGE[range] ?? RANGE["7d"];
  const fromIso = new Date(Date.now() - span).toISOString();
  try {
    const c = await db();
    const r = await c.execute({
      sql: `SELECT event_id, device_id, seq, type, delta, count_after, mode, capacity, occurred_at, received_at
            FROM occupancy_events WHERE device_id = ? AND occurred_at >= ? ORDER BY occurred_at ASC, id ASC`,
      args: [deviceId, fromIso],
    });
    const header = "event_id,device_id,seq,type,delta,count_after,mode,capacity,occurred_at_utc,received_at_utc";
    const lines = r.rows.map((row) =>
      [row.event_id, row.device_id, row.seq, row.type, row.delta, row.count_after, row.mode, row.capacity, row.occurred_at, row.received_at]
        .map(esc)
        .join(","),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response([header, ...lines].join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${deviceId}-events-${range}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: "Export unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildSummary, isRange } from "@/lib/summary";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const deviceId = p.get("deviceId") || "room-01";
  const range = p.get("range");
  const tz = Number(p.get("tz") ?? 0);
  if (!isRange(range)) return Response.json({ error: "range must be 1h, 24h, 7d or 30d" }, { status: 400 });
  try {
    const summary = await buildSummary(await db(), deviceId, range, Number.isFinite(tz) ? tz : 0);
    return Response.json(summary);
  } catch (e) {
    return Response.json({ error: "Summary unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

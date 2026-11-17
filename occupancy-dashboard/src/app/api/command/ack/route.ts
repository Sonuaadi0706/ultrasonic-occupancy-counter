import { db } from "@/lib/db";

// Node.js runtime is the default (required for mqtt + @libsql/client).

/** The browser reports the ack it saw on MQTT so command_audit records the outcome. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.cmdId !== "string") return Response.json({ error: "cmdId required" }, { status: 400 });
  const ok = body.ok === true ? 1 : body.ok === false ? 0 : null;
  try {
    const c = await db();
    await c.execute({
      sql: `UPDATE command_audit SET ack_ok = ?, ack_at = datetime('now') WHERE cmd_id = ? AND ack_at IS NULL`,
      args: [ok, body.cmdId],
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
  return Response.json({ ok: true });
}

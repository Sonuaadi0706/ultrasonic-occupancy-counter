import { connection } from "next/server";
import { db, dbKind } from "@/lib/db";
import { PUBLIC_BROKER, topicPrefix } from "@/lib/mqtt-config";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function GET() {
  await connection(); // always run at request time
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let error: string | undefined;
  try {
    const c = await db();
    await c.execute("SELECT 1");
  } catch (e) {
    database = "error";
    error = e instanceof Error ? e.message : String(e);
  }
  return Response.json(
    {
      ok: database === "ok",
      database,
      databaseKind: dbKind,
      broker: new URL(process.env.MQTT_URL || PUBLIC_BROKER.mqtts).hostname,
      topicPrefix: topicPrefix(process.env.MQTT_URL || PUBLIC_BROKER.mqtts, process.env.NEXT_PUBLIC_MQTT_TOPIC_PREFIX),
      latencyMs: Date.now() - started,
      ts: Date.now(),
      ...(error ? { error } : {}),
    },
    { status: database === "ok" ? 200 : 503 },
  );
}

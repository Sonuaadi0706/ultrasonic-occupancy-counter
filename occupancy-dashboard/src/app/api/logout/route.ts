import { clearSession } from "@/lib/auth";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}

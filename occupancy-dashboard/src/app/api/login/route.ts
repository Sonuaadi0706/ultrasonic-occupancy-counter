import { checkPassword, createSession } from "@/lib/auth";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    return Response.json({ ok: false, error: "Admin login is not configured on the server" }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  const password = body && typeof body.password === "string" ? body.password : "";
  // Small constant delay blunts brute force from a single client.
  await new Promise((r) => setTimeout(r, 350));
  if (!checkPassword(password)) {
    return Response.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }
  await createSession();
  return Response.json({ ok: true });
}

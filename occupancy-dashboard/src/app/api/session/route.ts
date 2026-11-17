import { isAdmin } from "@/lib/auth";

// Node.js runtime is the default (required for mqtt + @libsql/client).

export async function GET() {
  let admin = false;
  try {
    admin = await isAdmin();
  } catch {
    admin = false;
  }
  return Response.json({ admin }, { headers: { "Cache-Control": "no-store" } });
}

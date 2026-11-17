import "server-only";
import { createClient, type Client } from "@libsql/client";
import { generateSeedEvents } from "./seed-data";

/**
 * Turso in production (TURSO_DATABASE_URL=libsql://…), or a local SQLite file
 * for development so the dashboard works with zero setup.
 * On Vercel without Turso the project folder is read-only, so fall back to /tmp:
 * it works, but it is per-instance and wiped on cold starts (not durable).
 */
const DB_URL = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "file:/tmp/echo.db" : "file:local.db");
export const isLocalDb = DB_URL.startsWith("file:");
export const dbKind: "turso" | "sqlite-file" | "ephemeral" = !isLocalDb ? "turso" : process.env.VERCEL ? "ephemeral" : "sqlite-file";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS occupancy_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    delta INTEGER NOT NULL DEFAULT 0,
    count_after INTEGER NOT NULL,
    mode TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_device_time ON occupancy_events(device_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS command_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cmd_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    cmd TEXT NOT NULL,
    value TEXT,
    requested_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ack_ok INTEGER,
    ack_at TEXT
  )`,
  `INSERT OR IGNORE INTO devices (device_id, name, location, capacity) VALUES ('room-01', 'Main Room', 'Entrance', 10)`,
];

const g = globalThis as unknown as { __occDb?: Client; __occDbReady?: Promise<void> };

function client(): Client {
  if (!g.__occDb) {
    g.__occDb = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return g.__occDb;
}

async function init(db: Client) {
  await db.batch(SCHEMA, "write");
  // Local dev only: seed two weeks of realistic history so charts are not empty.
  if (isLocalDb && process.env.SEED_LOCAL_DB !== "0") {
    const r = await db.execute("SELECT COUNT(*) AS n FROM occupancy_events");
    if (Number(r.rows[0].n) === 0) await seed(db);
  }
}

export async function seed(db: Client = client()) {
  const rows = generateSeedEvents();
  for (let i = 0; i < rows.length; i += 500) {
    await db.batch(
      rows.slice(i, i + 500).map((e) => ({
        sql: `INSERT OR IGNORE INTO occupancy_events
              (event_id, device_id, seq, type, delta, count_after, mode, capacity, occurred_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [e.event_id, e.device_id, e.seq, e.type, e.delta, e.count_after, e.mode, e.capacity, e.occurred_at],
      })),
      "write",
    );
  }
  return rows.length;
}

/** Returns a ready DB client (schema applied once per process). */
export async function db(): Promise<Client> {
  const c = client();
  if (!g.__occDbReady) {
    g.__occDbReady = init(c).catch((err) => {
      g.__occDbReady = undefined;
      throw err;
    });
  }
  await g.__occDbReady;
  return c;
}

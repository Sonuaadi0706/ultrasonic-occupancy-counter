// Seed (or re-seed) the database with 14 days of realistic history.
//   npm run seed           → inserts (idempotent: duplicate event_ids are ignored)
//   npm run seed -- --wipe → clears occupancy_events first
import { createClient } from "@libsql/client";
import { generateSeedEvents } from "../src/lib/seed-data.ts";

const db = createClient({ url: process.env.TURSO_DATABASE_URL || "file:local.db", authToken: process.env.TURSO_AUTH_TOKEN });

await db.batch(
  [
    `CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT, capacity INTEGER NOT NULL DEFAULT 10, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS occupancy_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, delta INTEGER NOT NULL DEFAULT 0, count_after INTEGER NOT NULL, mode TEXT NOT NULL, capacity INTEGER NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_events_device_time ON occupancy_events(device_id, occurred_at)`,
    `CREATE TABLE IF NOT EXISTS command_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, cmd_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, cmd TEXT NOT NULL, value TEXT, requested_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), ack_ok INTEGER, ack_at TEXT)`,
    `INSERT OR IGNORE INTO devices (device_id, name, location, capacity) VALUES ('room-01', 'Main Room', 'Entrance', 10)`,
  ],
  "write",
);

if (process.argv.includes("--wipe")) {
  await db.execute("DELETE FROM occupancy_events");
  console.log("wiped occupancy_events");
}

const rows = generateSeedEvents();
for (let i = 0; i < rows.length; i += 500) {
  await db.batch(
    rows.slice(i, i + 500).map((e) => ({
      sql: `INSERT OR IGNORE INTO occupancy_events (event_id, device_id, seq, type, delta, count_after, mode, capacity, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [e.event_id, e.device_id, e.seq, e.type, e.delta, e.count_after, e.mode, e.capacity, e.occurred_at],
    })),
    "write",
  );
}
const n = await db.execute("SELECT COUNT(*) AS n FROM occupancy_events");
console.log(`seeded ${rows.length} events → table now has ${n.rows[0].n}`);

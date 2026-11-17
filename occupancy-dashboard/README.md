# ECHO — Ultrasonic Occupancy Dashboard

Hosted dashboard for the [ultrasonic-occupancy-counter](https://github.com/bhuvan11000/ultrasonic-occupancy-counter)
(Arduino UNO + ESP32 + 2× HC-SR04). Implements **Architecture A** from
`CLOUD_DASHBOARD_HANDOFF.md`: MQTT for live state, HTTPS event ingestion, Turso for history.

```
UNO ──UART──▶ ESP32 ──MQTT TLS──▶ EMQX ──WSS──▶ this dashboard (browser, read-only)
                 └──HTTPS POST /api/ingest/event──▶ Next.js API ──▶ Turso
dashboard ──POST /api/command (admin cookie)──▶ Next.js ──MQTT──▶ ESP32 ──▶ ack ──▶ dashboard
```

## Quick start (no hardware, no cloud)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no broker configured the live view runs a **software
twin** of the UNO + ESP32 (same state machine, events, commands and acks), and history
comes from `./local.db`, auto-seeded with 14 days of realistic traffic.

Admin password for the controls is `ADMIN_PASSWORD` in `.env.local`.

## Real MQTT end-to-end, locally

Three terminals:

```bash
npm run broker   # MQTT tcp :1883 + WebSockets :8083/mqtt (aedes)
npm run device   # mock ESP32: status+LWT, state every 700 ms, events, ingest POSTs, acks
npm run dev
```

Before `npm run dev`, uncomment `MQTT_URL`, `NEXT_PUBLIC_MQTT_URL` and `DEVICE_MQTT_URL`
in `.env.local`. Mock device keys: `u` toggle UNO link, `p` pause traffic, `k` crash
(fires the Last Will), `q` graceful offline.

## Production (Vercel + EMQX Cloud + Turso)

1. Turso: create a DB and token. The schema is applied automatically on first request
   (or run `npm run seed` with `TURSO_*` set to load demo history).
2. EMQX Cloud Serverless: create users `device-room-01`, `web-readonly`, `server-write`
   with the ACLs in handoff §8.
3. Vercel: import the repo, set every variable from `.env.example`, deploy.
   `NEXT_PUBLIC_MQTT_URL=wss://<host>:8084/mqtt`, `MQTT_URL=mqtts://<host>:8883`.
4. Check `GET /api/health`.

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | — | DB status, live source |
| `GET /api/events?deviceId&limit&offset&from&to&types` | — | events, newest first |
| `GET /api/summary?deviceId&range=1h\|24h\|7d\|30d&tz` | — | timeline, IN/OUT buckets, peak, time at capacity, invalid ratio, heatmap |
| `GET /api/export?deviceId&range` | — | CSV download |
| `POST /api/login` / `POST /api/logout` / `GET /api/session` | — | signed HttpOnly admin cookie (HS256) |
| `POST /api/command` | admin cookie | validates, publishes to `counter/{id}/cmd` QoS 1, writes `command_audit`, returns `202 {cmdId}` |
| `POST /api/command/ack` | admin cookie | records the ack the browser saw |
| `POST /api/ingest/event` | `Bearer INGEST_TOKEN` | `INSERT OR IGNORE`, `201` new / `200` duplicate / `400` / `401` |

State messages are never written to the database. Only discrete events are.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run broker` | local MQTT broker (dev only, no TLS) |
| `npm run device` | mock ESP32 cloud gateway |
| `npm run seed [-- --wipe]` | load 14 days of demo history |
| `npm run typecheck` / `lint` | checks |

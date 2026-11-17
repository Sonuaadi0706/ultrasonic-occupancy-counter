// Copy this file to secrets.h (same folder) and fill it in. Never commit secrets.h.
#pragma once

// ── Wi-Fi (2.4 GHz only; the ESP32 can't join 5 GHz networks) ─────────────────
#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASSWORD  "your-wifi-password"

#define DEVICE_ID      "room-01"   // must match NEXT_PUBLIC_DEVICE_ID and the devices table

// 1 = no Wi-Fi: send data over the USB cable to `npm run bridge` on the Mac.
// 0 = Wi-Fi + MQTT using one of the blocks below.
#define LINK_USB       0

// ═════════════════════════════════════════════════════════════════════════════
// Pick ONE block: comment out the other one.
// ═════════════════════════════════════════════════════════════════════════════

// ── A) LOCAL TESTING: `npm run broker` + `npm run dev` on your Mac ───────────
// Use your Mac's LAN IP (System Settings → Wi-Fi → Details → IP address),
// NOT "localhost". Localhost on the ESP32 means the ESP32 itself.
#define MQTT_USE_TLS   0
#define MQTT_HOST      "192.168.1.50"        // your Mac's IP
#define MQTT_PORT      1883
// Free public broker (no account), same as the hosted dashboard's default:
// #define MQTT_HOST         "broker.emqx.io"
// #define MQTT_PORT         1883
// #define MQTT_TOPIC_PREFIX "echo-occ-40474638/counter"
#define MQTT_USERNAME  ""                    // the local aedes broker has no auth
#define MQTT_PASSWORD  ""
#define INGEST_URL     "http://192.168.1.50:3000/api/ingest/event"
#define INGEST_TOKEN   "same-value-as-INGEST_TOKEN-in-.env.local"

// ── B) CLOUD: EMQX Cloud Serverless + Vercel ─────────────────────────────────
// #define MQTT_USE_TLS   1
// #define MQTT_HOST      "xxxxxxxx.ala.eu-central-1.emqxsl.com"  // EMQX deployment overview
// #define MQTT_PORT      8883
// #define MQTT_USERNAME  "device-room-01"     // EMQX → Access Control → Authentication
// #define MQTT_PASSWORD  "device-user-password"
// #define INGEST_URL     "https://your-app.vercel.app/api/ingest/event"
// #define INGEST_TOKEN   "same-value-as-INGEST_TOKEN-in-Vercel-env"

// Optional: root CA (PEM) for the EMQX broker / Vercel. Leave empty to skip
// certificate checks (traffic is still encrypted, but the server isn't verified).
// Download the CA from the EMQX deployment overview page and paste it here.
#define ROOT_CA ""

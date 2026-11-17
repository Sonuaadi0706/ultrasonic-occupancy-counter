"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLive } from "@/components/live/LiveProvider";
import { Card } from "@/components/ui/Card";
import { EVENT_META, ago, clock, describeEvent } from "@/lib/format";

export function EventFeed() {
  const { events, now, source } = useLive();
  const last = events[0];
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="eyebrow">Live stream</div>
          <div className="mt-1 font-display text-lg font-semibold">Events as they happen</div>
        </div>
        <span className="flex items-center gap-2 font-mono text-[11px] text-lime">
          <i className="pulse-dot h-2 w-2 rounded-full bg-lime text-lime" />
          {source === "mqtt" ? "MQTT" : "SIM"}
        </span>
      </div>

      {last && (
        <div className="mb-4 rounded-2xl border border-line bg-white/[0.02] p-4">
          <div className="eyebrow mb-1">Last event</div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-xl font-semibold" style={{ color: EVENT_META[last.type]?.color }}>
              {EVENT_META[last.type]?.glyph} {last.type}
            </span>
            <span className="font-mono text-xs text-mute">{ago(now - last.receivedAt)}</span>
          </div>
          <div className="mt-1 text-sm text-mute">{describeEvent(last)}</div>
        </div>
      )}

      <div className="relative -mx-2 flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(#000 75%, transparent)" }}>
        <ul className="max-h-[360px] space-y-1 overflow-y-auto px-2 pb-6" aria-live="polite">
          {events.length === 0 && <li className="py-10 text-center font-mono text-xs text-dim">Waiting for the first crossing…</li>}
          <AnimatePresence initial={false}>
            {events.slice(0, 30).map((e) => {
              const m = EVENT_META[e.type] ?? { color: "var(--mute)", glyph: "•", label: e.type };
              return (
                <motion.li
                  key={e.eventId}
                  layout
                  initial={{ opacity: 0, x: -24, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: `color-mix(in oklab, ${m.color} 18%, transparent)`, color: m.color }}>
                    {m.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{describeEvent(e)}</div>
                    <div className="font-mono text-[10px] text-dim">
                      #{e.seq} · {clock(e.ts)}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-mute">{ago(now - e.receivedAt)}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </Card>
  );
}

export function Ticker() {
  const { events } = useLive();
  const items = events.slice(0, 14);
  const fallback = ["ULTRASONIC OCCUPANCY", "ARDUINO UNO", "ESP32 GATEWAY", "MQTT · WSS", "TURSO · SQLITE", "HC-SR04 × 2"];
  const content = items.length >= 4 ? items.map((e) => ({ k: e.eventId, text: `${e.type} ${e.type === "IN" ? "+1" : e.type === "OUT" ? "−1" : ""} · ${clock(e.ts)} · ${e.count}/${e.capacity}`, color: EVENT_META[e.type]?.color })) : fallback.map((f) => ({ k: f, text: f, color: "var(--mute)" }));
  const row = (suffix: string) =>
    content.map((c) => (
      <span key={c.k + suffix} className="flex items-center gap-6 whitespace-nowrap">
        <span style={{ color: c.color }}>{c.text}</span>
        <span className="text-dim">✦</span>
      </span>
    ));
  return (
    <div className="marquee overflow-hidden border-y border-line py-3 font-display text-sm tracking-wide uppercase" aria-hidden>
      <div className="marquee-track flex w-max gap-6" style={{ ["--marquee-dur" as string]: "60s" }}>
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { DEVICE_ID } from "@/components/live/LiveProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EVENT_META, dateTime } from "@/lib/format";
import { EVENT_TYPES, type EventRow, type EventType } from "@/lib/types";

const PAGE = 25;

function EventTableInner({ version }: { version: number }) {
  const [types, setTypes] = useState<EventType[]>([]);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportRange, setExportRange] = useState("7d");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ deviceId: DEVICE_ID, limit: String(PAGE), offset: String(page * PAGE) });
      if (types.length) q.set("types", types.join(","));
      const r = await fetch(`/api/events?${q}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(d.events);
      setTotal(d.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, types]);

  useEffect(() => {
    const t = setTimeout(load, version ? 1500 : 0);
    return () => clearTimeout(t);
  }, [load, version, tick]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const toggle = (t: EventType) => {
    setPage(0);
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };

  return (
    <section id="events" className="scroll-mt-24">
      <SectionTitle
        eyebrow="Event log"
        title={<>Every crossing, <span className="text-signal">on record</span></>}
        right={
          <div className="flex items-center gap-2">
            <select value={exportRange} onChange={(e) => setExportRange(e.target.value)} aria-label="Export range" className="rounded-full border border-line bg-white/[0.02] px-3 py-2 font-mono text-xs text-ink">
              <option value="24h">24 h</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="all">All</option>
            </select>
            <a href={`/api/export?deviceId=${DEVICE_ID}&range=${exportRange}`} className="group flex items-center gap-2 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-black transition hover:shadow-[0_0_30px_rgba(200,255,46,.5)]">
              <Download size={15} className="transition-transform group-hover:translate-y-0.5" /> CSV
            </a>
          </div>
        }
      />
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <button onClick={() => { setTypes([]); setPage(0); }} className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${types.length === 0 ? "border-lime bg-lime text-black" : "border-line text-mute hover:text-ink"}`}>
            All
          </button>
          {EVENT_TYPES.map((t) => {
            const on = types.includes(t);
            const c = EVENT_META[t].color;
            return (
              <button key={t} onClick={() => toggle(t)} aria-pressed={on} className="rounded-full border px-3 py-1 font-mono text-[11px] transition" style={{ borderColor: on ? c : "var(--line)", color: on ? "#000" : "var(--mute)", background: on ? c : "transparent" }}>
                {t}
              </button>
            );
          })}
          <button onClick={() => setTick((x) => x + 1)} className="ml-auto grid h-8 w-8 place-items-center rounded-full border border-line text-mute hover:text-ink" aria-label="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center font-mono text-xs text-coral">History unavailable — {error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-5 py-3 font-normal">Time</th>
                  <th className="px-3 py-3 font-normal">Type</th>
                  <th className="px-3 py-3 font-normal">Δ</th>
                  <th className="px-3 py-3 font-normal">Count</th>
                  <th className="px-3 py-3 font-normal">Mode</th>
                  <th className="px-3 py-3 font-normal">Seq</th>
                  <th className="px-5 py-3 font-normal">Event ID</th>
                </tr>
              </thead>
              <tbody className={loading && rows.length ? "opacity-50" : ""}>
                <AnimatePresence initial={false} mode="popLayout">
                  {rows.map((r, i) => {
                    const m = EVENT_META[r.type];
                    return (
                      <motion.tr key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i * 0.012, 0.3) }} className="border-b border-line/60 font-mono text-xs hover:bg-white/[0.025]">
                        <td className="px-5 py-2.5 whitespace-nowrap text-mute">{dateTime(r.occurredAt)}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ color: m.color, background: `color-mix(in oklab, ${m.color} 14%, transparent)` }}>
                            {m.glyph} {r.type}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 ${r.type === "IN" ? "text-lime" : r.type === "OUT" ? "text-coral" : "text-mute"}`}>{r.type === "IN" || r.type === "OUT" || r.type === "CORRECT" ? (r.delta > 0 ? `+${r.delta}` : r.delta) : "·"}</td>
                        <td className="px-3 py-2.5">
                          {r.count}
                          <span className="text-dim">/{r.capacity}</span>
                        </td>
                        <td className="px-3 py-2.5 text-mute">{r.mode}</td>
                        <td className="px-3 py-2.5 text-dim">{r.seq}</td>
                        <td className="max-w-[220px] truncate px-5 py-2.5 text-dim">{r.eventId}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center font-mono text-xs text-dim">No events match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between p-4 font-mono text-xs text-mute">
          <span>
            {total.toLocaleString()} events · page {page + 1} / {pages}
          </span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-line transition enabled:hover:border-lime enabled:hover:text-lime disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft size={16} />
            </button>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-line transition enabled:hover:border-lime enabled:hover:text-lime disabled:opacity-30" aria-label="Next page">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>
    </section>
  );
}

export const EventTable = memo(EventTableInner);

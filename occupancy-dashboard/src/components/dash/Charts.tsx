"use client";

import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionTitle } from "@/components/ui/Card";
import { duration, shortDate, shortTime } from "@/lib/format";
import type { SummaryRange } from "@/lib/types";
import { useSummary } from "./useSummary";

const RANGES: SummaryRange[] = ["1h", "24h", "7d", "30d"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RangeSwitch({ value, onChange }: { value: SummaryRange; onChange: (r: SummaryRange) => void }) {
  return (
    <div role="tablist" aria-label="Time range" className="relative flex rounded-full border border-line bg-white/[0.02] p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={`relative rounded-full px-4 py-1.5 font-mono text-xs transition-colors ${value === r ? "text-black" : "text-mute hover:text-ink"}`}
        >
          {value === r && <motion.span layoutId="range-pill" className="absolute inset-0 rounded-full bg-lime" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
          <span className="relative">{r}</span>
        </button>
      ))}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: number; range: SummaryRange };

function GlassTip({ active, payload, label, range }: TipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="rounded-xl border border-line-2 bg-[#0c0e18]/90 px-3 py-2 font-mono text-[11px] shadow-2xl backdrop-blur-xl">
      <div className="mb-1 text-mute">{range === "7d" || range === "30d" ? `${shortDate(label)} ${shortTime(label)}` : shortTime(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-mute">{p.name}</span>
          <span className="ml-auto text-ink">{Math.abs(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const tickFor = (range: SummaryRange) => (t: number) => (range === "7d" || range === "30d" ? shortDate(t) : shortTime(t));

function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  // Rotate so Monday is first
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[36px_repeat(24,1fr)] gap-[3px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center font-mono text-[9px] text-dim">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {order.map((d, row) => (
            <div key={d} className="contents">
              <span className="self-center font-mono text-[10px] text-mute">{DAYS[d]}</span>
              {data[d].map((v, h) => {
                const k = v / max;
                return (
                  <motion.span
                    key={h}
                    title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 — ${v} entries`}
                    className="h-5 rounded-[4px] sm:h-6"
                    initial={{ opacity: 0, scale: 0.4 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: (row * 24 + h) * 0.003, duration: 0.3 }}
                    style={{
                      background: v === 0 ? "rgba(255,255,255,0.03)" : `color-mix(in oklab, var(--lime) ${Math.round(15 + k * 85)}%, var(--violet))`,
                      opacity: v === 0 ? 1 : 0.25 + k * 0.75,
                      boxShadow: k > 0.7 ? "0 0 12px rgba(200,255,46,0.45)" : "none",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 font-mono text-[10px] text-dim">
          less
          {[0.1, 0.35, 0.6, 0.85, 1].map((k) => (
            <i key={k} className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--lime) ${Math.round(15 + k * 85)}%, var(--violet))`, opacity: 0.25 + k * 0.75 }} />
          ))}
          more
        </div>
      </div>
    </div>
  );
}

function ChartsInner({ version }: { version: number }) {
  const [range, setRange] = useState<SummaryRange>("24h");
  const { data, error, loading } = useSummary(range, version);
  const [heatRange] = useState<SummaryRange>("30d");
  const heat = useSummary(heatRange, version);

  const [dbKind, setDbKind] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setDbKind(d.databaseKind ?? null))
      .catch(() => {});
  }, []);
  const eyebrow = dbKind === "ephemeral" ? "History · sample data (connect Turso to keep real events)" : dbKind === "turso" ? "History · Turso" : "History · local SQLite";

  const bars = useMemo(() => data?.buckets.map((b) => ({ t: b.t, in: b.in, out: -b.out })) ?? [], [data]);
  const tick = tickFor(range);

  return (
    <section id="history" className="scroll-mt-24">
      <SectionTitle eyebrow={eyebrow} title={<>Occupancy over <span className="text-signal">time</span></>} right={<RangeSwitch value={range} onChange={setRange} />} />

      {error && (
        <Card className="mb-4 border-coral/40 p-4 font-mono text-xs text-coral">History unavailable — {error}. Live data keeps streaming.</Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Occupancy timeline</div>
              <div className="mt-1 font-mono text-xs text-mute">
                peak <span className="text-violet">{data?.peak.count ?? "–"}</span>
                {data?.peak.at ? ` at ${shortTime(data.peak.at)}` : ""} · at capacity <span className="text-coral">{duration(data?.timeAtCapacityMs ?? 0)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-mute">
              <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-sm bg-lime" /> count</span>
              <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t border-dashed border-coral" /> capacity</span>
            </div>
          </div>
          <div className={`h-[280px] transition-opacity ${loading ? "opacity-40" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.timeline ?? []} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8ff2e" stopOpacity={0.55} />
                    <stop offset="60%" stopColor="#38e1ff" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#8a6bff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="occStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38e1ff" />
                    <stop offset="100%" stopColor="#c8ff2e" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(max, data?.capacity ?? 10) + 1]} />
                <Tooltip content={<GlassTip range={range} />} cursor={{ stroke: "rgba(255,255,255,0.2)", strokeDasharray: "3 3" }} />
                {data && <ReferenceLine y={data.capacity} stroke="#ff4f6d" strokeDasharray="5 5" strokeOpacity={0.8} />}
                <Area type="stepAfter" dataKey="max" name="peak in bucket" stroke="none" fill="#8a6bff" fillOpacity={0.12} isAnimationActive animationDuration={900} />
                <Area type="stepAfter" dataKey="count" name="count" stroke="url(#occStroke)" strokeWidth={2} fill="url(#occFill)" isAnimationActive animationDuration={1100} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="eyebrow">Entries vs exits</div>
          <div className="mt-1 font-mono text-xs text-mute">
            <span className="text-lime">{data?.totals.in ?? 0} in</span> · <span className="text-coral">{data?.totals.out ?? 0} out</span> · per{" "}
            {data ? (data.bucketMs >= 86400000 ? "day" : data.bucketMs >= 3600000 ? `${data.bucketMs / 3600000}h` : `${data.bucketMs / 60000} min`) : "–"}
          </div>
          <div className={`mt-4 h-[280px] transition-opacity ${loading ? "opacity-40" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} stackOffset="sign" margin={{ top: 10, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="inBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8ff2e" />
                    <stop offset="100%" stopColor="#c8ff2e" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="outBar" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#ff4f6d" />
                    <stop offset="100%" stopColor="#ff4f6d" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v) => String(Math.abs(v))} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<GlassTip range={range} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Bar dataKey="in" name="in" stackId="s" fill="url(#inBar)" radius={[4, 4, 0, 0]} animationDuration={900} />
                <Bar dataKey="out" name="out" stackId="s" fill="url(#outBar)" radius={[4, 4, 0, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 xl:col-span-3">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="eyebrow">Footfall heatmap · last 30 days</div>
              <div className="mt-1 font-mono text-xs text-mute">entries by weekday and hour, your local time</div>
            </div>
            <div className="font-mono text-xs text-mute">
              {heat.data ? (
                <>
                  busiest:{" "}
                  <span className="text-lime">
                    {(() => {
                      let best = { d: 0, h: 0, v: -1 };
                      heat.data.heatmap.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })));
                      return `${DAYS[best.d]} ${String(best.h).padStart(2, "0")}:00`;
                    })()}
                  </span>
                </>
              ) : (
                "loading…"
              )}
            </div>
          </div>
          {heat.data ? <Heatmap data={heat.data.heatmap} /> : <div className="h-[200px] animate-pulse rounded-xl bg-white/[0.03]" />}
        </Card>
      </div>
    </section>
  );
}

/** Memoised so 60 fps live updates elsewhere never re-render the charts. */
export const Charts = memo(ChartsInner);

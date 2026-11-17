"use client";

import { motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Gauge, Hourglass, ShieldAlert, Sigma, Timer, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useLive } from "@/components/live/LiveProvider";
import { Card } from "@/components/ui/Card";
import { TweenNumber } from "@/components/ui/RollingNumber";
import { duration, shortTime } from "@/lib/format";
import { useSummary } from "./useSummary";

function Tile({
  icon,
  label,
  value,
  sub,
  color,
  spark,
  i,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color: string;
  spark?: number[];
  i: number;
}) {
  const max = Math.max(1, ...(spark ?? [1]));
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 18 }}>
      <Card className="group h-full p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <span className="eyebrow">{label}</span>
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-line transition-transform duration-500 group-hover:rotate-12" style={{ color }}>
            {icon}
          </span>
        </div>
        <div className="mt-4 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl xl:text-4xl" style={{ color }}>
          {value}
        </div>
        <div className="mt-1 min-h-[1.25rem] font-mono text-[11px] text-mute">{sub}</div>
        {spark && spark.length > 1 && (
          <div className="mt-3 flex h-8 items-end gap-[2px]">
            {spark.map((v, k) => (
              <motion.span
                key={k}
                className="flex-1 rounded-sm"
                style={{ background: color, opacity: 0.25 + (v / max) * 0.75 }}
                initial={{ height: 0 }}
                whileInView={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + k * 0.02, duration: 0.5 }}
              />
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export function Kpis() {
  const { state, historyVersion } = useLive();
  const { data } = useSummary("24h", historyVersion);
  const inT = state?.in ?? 0;
  const outT = state?.out ?? 0;
  const net = inT - outT;
  const queue = state?.mode === "queue";
  const ins = data?.buckets.map((b) => b.in) ?? [];
  const outs = data?.buckets.map((b) => b.out) ?? [];
  const rate = data?.recentOutPerMin ?? 0;
  const wait = queue && state ? (rate > 0 ? (state.count / rate) * 60_000 : null) : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile i={0} icon={<ArrowUpRight size={16} />} color="var(--lime)" label="Entries" value={<TweenNumber value={inT} />} sub="since device boot" spark={ins.slice(-24)} />
      <Tile i={1} icon={<ArrowDownLeft size={16} />} color="var(--coral)" label="Exits" value={<TweenNumber value={outT} />} sub="since device boot" spark={outs.slice(-24)} />
      <Tile
        i={2}
        icon={<Sigma size={16} />}
        color="var(--cyan)"
        label="Net flow"
        value={
          <>
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            <TweenNumber value={Math.abs(net)} />
          </>
        }
        sub={`${data ? data.totals.in : "–"} in · ${data ? data.totals.out : "–"} out in 24 h`}
      />
      <Tile
        i={3}
        icon={<TrendingUp size={16} />}
        color="var(--violet)"
        label="Peak · 24 h"
        value={<TweenNumber value={data?.peak.count ?? 0} />}
        sub={data?.peak.at ? `at ${shortTime(data.peak.at)}` : "no peak yet"}
      />
      <Tile
        i={4}
        icon={<Timer size={16} />}
        color="var(--coral)"
        label="At capacity · 24 h"
        value={duration(data?.timeAtCapacityMs ?? 0)}
        sub={`${data?.totals.full ?? 0} full events`}
      />
      <Tile
        i={5}
        icon={<ShieldAlert size={16} />}
        color="var(--amber)"
        label="Rejected crossings"
        value={<TweenNumber value={(data?.invalidRatio ?? 0) * 100} decimals={1} suffix="%" />}
        sub={`${data?.totals.invalid ?? 0} invalid · ${data?.totals.timeout ?? 0} timeout`}
      />
      <Tile
        i={6}
        icon={<Gauge size={16} />}
        color="var(--lime)"
        label="Throughput"
        value={<TweenNumber value={rate} decimals={2} suffix="/min" />}
        sub="exits, last 15 min"
      />
      <Tile
        i={7}
        icon={<Hourglass size={16} />}
        color="var(--cyan)"
        label={queue ? "Est. queue wait" : "Avg exits / hour"}
        value={queue ? (wait === null ? "—" : duration(wait)) : <TweenNumber value={(data?.avgOutPerMin ?? 0) * 60} decimals={1} />}
        sub={queue ? "count ÷ exit rate" : "over the last 24 h"}
      />
    </div>
  );
}

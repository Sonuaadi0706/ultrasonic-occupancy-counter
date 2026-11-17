"use client";

import { motion } from "motion/react";
import { useLive } from "@/components/live/LiveProvider";
import { Card } from "@/components/ui/Card";

const SEQ = [
  { id: 0, label: "Idle" },
  { id: 1, label: "A first" },
  { id: 2, label: "B first" },
  { id: 3, label: "Wait clear" },
  { id: 4, label: "Ambiguous" },
];

function SensorBar({ name, role, distance, threshold, active, fault }: { name: string; role: string; distance: number; threshold: number; active: boolean; fault: boolean }) {
  const max = Math.max(250, threshold + 60);
  const pct = fault ? 100 : Math.min(100, (Math.max(0, distance) / max) * 100);
  const tp = (threshold / max) * 100;
  const color = fault ? "var(--coral)" : active ? "var(--lime)" : "var(--cyan)";
  return (
    <div className="rounded-2xl border border-line bg-white/[0.015] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl font-display text-sm font-bold text-black" style={{ background: color, boxShadow: `0 0 24px ${color}` }}>
            {name}
          </span>
          <div>
            <div className="text-sm font-medium">Sensor {name}</div>
            <div className="font-mono text-[11px] text-mute">{role}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold tabular" style={{ color }}>
            {fault ? "—" : distance}
            <span className="ml-1 font-mono text-xs text-mute">cm</span>
          </div>
          <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color }}>
            {fault ? "fault · no echo" : active ? "● triggered" : "clear"}
          </div>
        </div>
      </div>
      <div className="relative mt-4 h-3 overflow-visible rounded-full bg-white/[0.05]">
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, transparent 140%)`, boxShadow: active ? `0 0 18px ${color}` : "none" }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }} />
        <div className="absolute -top-1.5 -bottom-1.5 w-px border-l border-dashed border-amber" style={{ left: `${tp}%` }}>
          <span className="absolute -top-5 -translate-x-1/2 font-mono text-[9px] whitespace-nowrap text-amber">{threshold}</span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-dim">
        <span>0</span>
        <span>{max} cm</span>
      </div>
    </div>
  );
}

export function SensorPanel() {
  const { state } = useLive();
  const queue = state?.mode === "queue";
  const seq = state?.sequence ?? 0;
  return (
    <Card className="h-full p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="eyebrow">Sensors</div>
          <div className="mt-1 font-display text-lg font-semibold">Distance &amp; trigger</div>
        </div>
        <div className="font-mono text-[11px] text-mute">trigger ≤ thr ×2 · clear &gt; thr+12 ×3</div>
      </div>
      <div className="grid gap-3">
        <SensorBar name="A" role={queue ? "queue in · +1" : "outside"} distance={state?.distanceA ?? 0} threshold={state?.threshold ?? 80} active={!!state?.flags.activeA} fault={!!state?.flags.faultA || (state?.distanceA ?? 0) < 0} />
        <SensorBar name="B" role={queue ? "queue out · −1" : "inside"} distance={state?.distanceB ?? 0} threshold={state?.threshold ?? 80} active={!!state?.flags.activeB} fault={!!state?.flags.faultB || (state?.distanceB ?? 0) < 0} />
      </div>
      <div className="mt-5">
        <div className="eyebrow mb-3">Direction state machine {queue && <span className="text-dim">· room mode only</span>}</div>
        <div className="flex flex-wrap gap-2">
          {SEQ.map((s) => {
            const on = !queue && s.id === seq;
            const color = s.id === 4 ? "var(--amber)" : s.id === 0 ? "var(--mute)" : "var(--lime)";
            return (
              <div key={s.id} className="relative rounded-full border border-line px-3 py-1.5 font-mono text-[11px]" style={{ color: on ? "#000" : "var(--mute)" }}>
                {on && <motion.span layoutId="seq-pill" className="absolute inset-0 -z-0 rounded-full" style={{ background: color }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                <span className="relative">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLive } from "@/components/live/LiveProvider";
import { Card } from "@/components/ui/Card";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { SonarStage } from "./SonarStage";

function CapacityRing({ count, capacity, full }: { count: number; capacity: number; full: boolean }) {
  const size = 300;
  const r = 128;
  const c = size / 2;
  const segments = capacity <= 40 ? capacity : 0;
  const ratio = Math.min(1, count / Math.max(1, capacity));
  const gap = segments > 24 ? 1.6 : 3.2; // degrees
  const accent = full ? "var(--coral)" : ratio > 0.75 ? "var(--amber)" : "var(--lime)";

  const arc = (a0: number, a1: number) => {
    const toXY = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
    };
    const [x0, y0] = toXY(a0).map((n) => n.toFixed(2));
    const [x1, y1] = toXY(a1).map((n) => n.toFixed(2));
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full -rotate-0" aria-hidden>
      <defs>
        <linearGradient id="ringGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
          <stop offset="0%" stopColor="var(--lime)" />
          <stop offset="55%" stopColor="var(--cyan)" />
          <stop offset="100%" stopColor="var(--violet)" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* outer tick ring */}
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i * 5 * Math.PI) / 180;
        const r1 = 146;
        const r2 = i % 6 === 0 ? 140 : 143;
        return (
          <line
            key={i}
            x1={(c + r1 * Math.sin(a)).toFixed(2)}
            y1={(c - r1 * Math.cos(a)).toFixed(2)}
            x2={(c + r2 * Math.sin(a)).toFixed(2)}
            y2={(c - r2 * Math.cos(a)).toFixed(2)}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
          />
        );
      })}

      {segments > 0 ? (
        Array.from({ length: segments }, (_, i) => {
          const span = 360 / segments;
          const lit = i < count;
          return (
            <motion.path
              key={`${segments}-${i}`}
              d={arc(i * span + gap / 2, (i + 1) * span - gap / 2)}
              fill="none"
              strokeWidth={14}
              strokeLinecap="butt"
              stroke={lit ? (full ? "var(--coral)" : "url(#ringGrad)") : "rgba(255,255,255,0.07)"}
              initial={false}
              animate={{ opacity: 1, scale: lit ? 1 : 0.985 }}
              transition={{ duration: 0.45, delay: lit ? i * 0.015 : 0 }}
              filter={lit ? "url(#glow)" : undefined}
            />
          );
        })
      ) : (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} />
          <motion.circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={full ? "var(--coral)" : "url(#ringGrad)"}
            strokeWidth={14}
            strokeLinecap="round"
            transform={`rotate(-90 ${c} ${c})`}
            strokeDasharray={2 * Math.PI * r}
            animate={{ strokeDashoffset: 2 * Math.PI * r * (1 - ratio) }}
            transition={{ type: "spring", stiffness: 60, damping: 16 }}
            filter="url(#glow)"
          />
        </>
      )}

      {/* orbiting marker */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        style={{ originX: "50%", originY: "50%", transformBox: "view-box" }}
      >
        <circle cx={c} cy={c - 108} r={2.5} fill={accent} />
      </motion.g>
      <circle cx={c} cy={c} r={104} fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />
    </svg>
  );
}

export function Hero() {
  const { state, deviceStatus, conn, stale, source } = useLive();
  const count = state?.count ?? 0;
  const capacity = state?.capacity ?? 10;
  const full = !!state?.flags.full || count >= capacity;
  const available = Math.max(0, capacity - count);
  const queue = state?.mode === "queue";
  const ratio = count / Math.max(1, capacity);

  // Bump animation when count changes
  const [bump, setBump] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [prev, setPrev] = useState(count);
  if (prev !== count) {
    setDir(count > prev ? 1 : -1);
    setPrev(count);
    setBump((b) => b + 1);
  }

  const [h, setH] = useState(112);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const f = () => setH(m.matches ? 84 : 112);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);

  let headline: string;
  let tone: string;
  if (!state) {
    headline = conn === "offline" ? "Live link down" : "Listening for the device…";
    tone = "text-mute";
  } else if (deviceStatus === "offline") {
    headline = "Device offline";
    tone = "text-coral";
  } else if (!state.unoOnline) {
    headline = "UNO link lost";
    tone = "text-coral";
  } else if (full) {
    headline = queue ? "Queue at limit" : "Room is full";
    tone = "text-coral";
  } else if (ratio >= 0.75) {
    headline = queue ? "Queue is building" : "Almost full";
    tone = "text-amber";
  } else {
    headline = queue ? "Queue is moving" : "Room is open";
    tone = "text-lime";
  }

  return (
    <Card className="grid gap-0 overflow-hidden lg:grid-cols-[minmax(340px,420px)_1fr]">
      {/* Count + ring */}
      <div className="relative flex flex-col items-center justify-center gap-6 border-b border-line p-8 lg:border-r lg:border-b-0">
        <div className="flex w-full items-center justify-between">
          <span className="eyebrow">{queue ? "Queue length" : "Occupancy"}</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={state?.mode ?? "none"}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="rounded-full border border-line-2 px-3 py-1 font-mono text-[11px] tracking-widest text-violet uppercase"
            >
              {queue ? "Queue mode" : "Room mode"}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="relative aspect-square w-full max-w-[300px]">
          <CapacityRing count={count} capacity={capacity} full={full} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div style={{ filter: full ? "drop-shadow(0 0 28px rgba(255,79,109,.55))" : "drop-shadow(0 0 28px rgba(200,255,46,.22))" }}>
              <motion.div
                key={bump}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className={`font-display font-extrabold ${full ? "text-coral" : "text-ink"}`}
                style={{ fontSize: h * 0.86 }}
              >
                {state ? <RollingNumber value={count} height={h} /> : <span className="text-dim">–</span>}
              </motion.div>
            </div>
            <div className="mt-2 font-mono text-sm text-mute">
              of <span className="text-ink">{capacity}</span> {queue ? "max" : "capacity"}
            </div>
            <AnimatePresence>
              {bump > 0 && (
                <motion.span
                  key={`d${bump}`}
                  initial={{ opacity: 0, y: dir > 0 ? 14 : -14, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 1, 0], y: dir > 0 ? -34 : 34, scale: 1 }}
                  transition={{ duration: 1.3, ease: "easeOut" }}
                  className={`pointer-events-none absolute right-[16%] font-display text-2xl font-semibold ${dir > 0 ? "text-lime" : "text-coral"}`}
                  style={{ top: "36%" }}
                >
                  {dir > 0 ? "+1" : "−1"}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-1 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={headline}
              initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              className={`font-display text-xl font-semibold ${tone}`}
            >
              {headline}
            </motion.div>
          </AnimatePresence>
          <div className="font-mono text-xs text-mute">
            {state ? (
              full ? (
                <>
                  over by <span className="text-coral">{count - capacity}</span> · wait for someone to leave
                </>
              ) : (
                <>
                  <span className="text-lime">{available}</span> {available === 1 ? "space" : "spaces"} available
                </>
              )
            ) : (
              "waiting for retained state"
            )}
            {stale && <span className="ml-2 text-amber">· data stale</span>}
          </div>
        </div>
      </div>

      {/* Sonar */}
      <div className="relative min-h-[340px] lg:min-h-[480px]">
        <div className="absolute top-5 left-6 z-10">
          <div className="eyebrow">Ultrasonic array · live</div>
          <div className="mt-1 font-display text-lg font-semibold">
            Dual <span className="text-signal">HC-SR04</span> doorway
          </div>
        </div>
        <div className="absolute top-5 right-6 z-10 hidden items-center gap-2 font-mono text-[11px] text-mute sm:flex">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-cyan" /> idle
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-lime" /> active
          </span>
          {source === "simulator" && <span className="ml-2 rounded-full border border-violet/40 px-2 py-0.5 text-violet">SIM</span>}
        </div>
        <div className="absolute inset-0 pt-16">
          <SonarStage />
        </div>
      </div>
    </Card>
  );
}

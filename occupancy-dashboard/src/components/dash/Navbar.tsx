"use client";

import { motion } from "motion/react";
import { Lock, Unlock } from "lucide-react";
import { DEVICE_ID, DEVICE_NAME, useLive } from "@/components/live/LiveProvider";
import { ago } from "@/lib/format";

function Pill({ label, value, tone, pulse }: { label: string; value: string; tone: "lime" | "coral" | "amber" | "mute" | "violet"; pulse?: boolean }) {
  const color = `var(--${tone})`;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line bg-white/[0.02] px-2.5 py-1 sm:gap-2 sm:px-3 sm:py-1.5" title={`${label}: ${value}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${pulse ? "pulse-dot" : ""}`} style={{ background: color, color }} />
      <span className="font-mono text-[9px] tracking-widest text-dim uppercase sm:text-[10px]">{label}</span>
      <span className="font-mono text-[10px] sm:text-[11px]" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

export function Navbar() {
  const { source, conn, deviceStatus, state, lastStateAt, now, stale, admin } = useLive();

  const brokerTone = source === "simulator" ? "violet" : conn === "connected" ? "lime" : conn === "connecting" || conn === "reconnecting" ? "amber" : "coral";
  const brokerVal = source === "simulator" ? "simulator" : conn;
  const devTone = deviceStatus === "online" ? (stale ? "amber" : "lime") : deviceStatus === "offline" ? "coral" : "mute";
  const devVal = deviceStatus === "online" ? (stale ? "stale" : "online") : deviceStatus;
  const unoTone = !state ? "mute" : state.unoOnline ? "lime" : "coral";
  const unoVal = !state ? "—" : state.unoOnline ? "linked" : "link lost";

  return (
    <motion.header initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }} className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3">
        <a href="#top" className="flex items-center gap-3">
          <span className="relative grid h-9 w-9 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full border border-lime/40 [animation-duration:2.4s]" />
            <svg viewBox="0 0 32 32" className="h-9 w-9">
              <circle cx="9" cy="16" r="3.2" fill="var(--lime)" />
              <path d="M15 9.5a9 9 0 0 1 0 13" stroke="var(--lime)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M19.5 5.5a15 15 0 0 1 0 21" stroke="var(--cyan)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".8" />
              <path d="M24 2.5a20 20 0 0 1 0 27" stroke="var(--violet)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".55" />
            </svg>
          </span>
          <span>
            <span className="block font-display text-base leading-none font-extrabold tracking-tight">ECHO</span>
            <span className="block font-mono text-[10px] text-mute">
              {DEVICE_NAME} · {DEVICE_ID}
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-5 font-mono text-xs text-mute lg:flex">
          {[
            ["Live", "#top"],
            ["History", "#history"],
            ["Events", "#events"],
            ["Controls", "#controls"],
          ].map(([l, h]) => (
            <a key={h} href={h} className="transition hover:text-lime">
              {l}
            </a>
          ))}
        </nav>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto sm:gap-2">
          <Pill label="mqtt" value={brokerVal} tone={brokerTone} pulse={brokerTone === "lime" || brokerTone === "violet"} />
          <Pill label="esp32" value={devVal} tone={devTone} />
          <Pill label="uno" value={unoVal} tone={unoTone} />
          <span className="hidden font-mono text-[11px] text-dim sm:inline">{lastStateAt ? `updated ${ago(now - lastStateAt)}` : "connecting…"}</span>
          <a href="#controls" className={`hidden h-8 w-8 sm:grid place-items-center rounded-full border ${admin ? "border-lime/50 text-lime" : "border-line text-mute"}`} aria-label={admin ? "Controls unlocked" : "Controls locked"}>
            {admin ? <Unlock size={14} /> : <Lock size={14} />}
          </a>
        </div>
      </div>
    </motion.header>
  );
}

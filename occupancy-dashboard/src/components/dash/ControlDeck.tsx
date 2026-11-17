"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, FlaskConical, Loader2, Minus, Plus, Radio, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEVICE_ID, useLive, type PendingCommand } from "@/components/live/LiveProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { CommandName } from "@/lib/types";

function StatusLine({ p }: { p?: PendingCommand }) {
  const { now } = useLive();
  if (!p) return <div className="h-5" />;
  const elapsed = Math.min(5000, now - p.startedAt);
  return (
    <AnimatePresence mode="wait">
      <motion.div key={p.cmdId + p.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex h-5 items-center gap-2 font-mono text-[11px]">
        {p.status === "pending" && (
          <>
            <Loader2 size={12} className="animate-spin text-cyan" />
            <span className="text-cyan">waiting for ack…</span>
            <span className="relative h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <span className="absolute inset-y-0 left-0 bg-cyan transition-[width] duration-500" style={{ width: `${(elapsed / 5000) * 100}%` }} />
            </span>
          </>
        )}
        {p.status === "ok" && (
          <>
            <Check size={12} className="text-lime" />
            <span className="text-lime">{p.message}</span>
          </>
        )}
        {(p.status === "error" || p.status === "timeout") && (
          <>
            <X size={12} className="text-coral" />
            <span className="text-coral">{p.message}</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Control({ title, hint, children, p }: { title: string; hint: string; children: ReactNode; p?: PendingCommand }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <div className="font-display text-base font-semibold">{title}</div>
        <div className="font-mono text-[11px] text-mute">{hint}</div>
      </div>
      <div className="flex-1">{children}</div>
      <StatusLine p={p} />
    </Card>
  );
}

function ApplyButton({ onClick, busy, disabled, children = "Apply" }: { onClick: () => void; busy?: boolean; disabled?: boolean; children?: ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={busy || disabled}
      className="relative overflow-hidden rounded-xl bg-lime px-4 py-2.5 text-sm font-semibold text-black transition enabled:hover:shadow-[0_0_28px_rgba(200,255,46,.45)] disabled:opacity-40"
    >
      {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : children}
    </motion.button>
  );
}

function Stepper({ value, set, min, max }: { value: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => set(Math.max(min, value - 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-lime hover:text-lime" aria-label="Decrease">
        <Minus size={16} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="h-10 w-20 rounded-xl border border-line bg-white/[0.03] text-center font-display text-xl font-semibold tabular"
      />
      <button onClick={() => set(Math.min(max, value + 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-lime hover:text-lime" aria-label="Increase">
        <Plus size={16} />
      </button>
    </div>
  );
}

function HoldButton({ onConfirm, busy }: { onConfirm: () => void; busy?: boolean }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (busy) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, 1200);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && start()}
      onKeyUp={stop}
      disabled={busy}
      className="relative w-full overflow-hidden rounded-xl border border-coral/50 px-4 py-3 text-sm font-semibold text-coral select-none disabled:opacity-40"
    >
      <motion.span className="absolute inset-y-0 left-0 bg-coral" initial={false} animate={{ width: holding ? "100%" : "0%" }} transition={{ duration: holding ? 1.2 : 0.25, ease: "linear" }} />
      <span className={`relative flex items-center justify-center gap-2 transition-colors ${holding ? "text-black" : ""}`}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        {holding ? "Keep holding…" : "Hold to reset count"}
      </span>
    </button>
  );
}

export function ControlDeck() {
  const { state, source, deviceStatus, sendCommand, commands, pushToast } = useLive();
  const [cap, setCap] = useState(10);
  const [thr, setThr] = useState(80);
  const [corr, setCorr] = useState(0);
  // Re-sync the inputs from the device whenever the data source changes.
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (state && syncedFor.current !== source) {
      syncedFor.current = source;
      setCap(state.capacity);
      setThr(state.threshold);
      setCorr(state.count);
    }
  }, [state, source]);

  const send = async (cmd: CommandName, value?: string | number) => {
    const r = await sendCommand(cmd, value);
    if ("error" in r) pushToast({ tone: "coral", title: "Command not sent", body: r.error });
  };
  const busy = (c: CommandName) => commands[c]?.status === "pending";
  const mode = state?.mode ?? "room";

  return (
    <section id="controls" className="scroll-mt-24">
      <SectionTitle
        eyebrow="Control deck"
        title={<>Talk to the <span className="text-signal">device</span></>}
        right={
          source === "simulator" ? (
            <span className="flex items-center gap-2 rounded-full border border-violet/40 bg-violet/10 px-4 py-2 font-mono text-xs text-violet">
              <FlaskConical size={14} /> Sending to the simulator
            </span>
          ) : (
            <span className={`flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs ${deviceStatus === "online" ? "border-lime/40 bg-lime/10 text-lime" : "border-amber/40 bg-amber/10 text-amber"}`}>
              <Radio size={14} /> {deviceStatus === "online" ? `Sending to ${DEVICE_ID} over MQTT` : `${DEVICE_ID} is ${deviceStatus} — commands may time out`}
            </span>
          )
        }
      />

      <div className="relative">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Control title="Counting mode" hint="room = direction by A→B order · queue = A +1, B −1" p={commands.mode}>
            <div className="relative grid grid-cols-2 rounded-xl border border-line p-1">
              {(["room", "queue"] as const).map((m) => (
                <button key={m} disabled={busy("mode")} onClick={() => m !== mode && send("mode", m)} className={`relative rounded-lg py-2.5 text-sm font-semibold capitalize transition-colors ${mode === m ? "text-black" : "text-mute hover:text-ink"}`}>
                  {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-lg bg-violet" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                  <span className="relative">{m}</span>
                </button>
              ))}
            </div>
          </Control>

          <Control title="Capacity" hint={`full threshold · device now ${state?.capacity ?? "–"} · 1–99`} p={commands.capacity}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stepper value={cap} set={setCap} min={1} max={99} />
              <ApplyButton onClick={() => send("capacity", cap)} busy={busy("capacity")} disabled={cap === state?.capacity} />
            </div>
          </Control>

          <Control title="Detection threshold" hint={`trigger distance · device now ${state?.threshold ?? "–"} cm · 10–300`} p={commands.threshold}>
            <div className="flex items-center gap-4">
              <input type="range" className="slider" min={10} max={300} value={thr} onChange={(e) => setThr(Number(e.target.value))} style={{ ["--fill" as string]: `${((thr - 10) / 290) * 100}%` }} aria-label="Threshold in centimetres" />
              <span className="w-16 text-right font-display text-xl font-semibold tabular">
                {thr}
                <span className="font-mono text-xs text-mute">cm</span>
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <ApplyButton onClick={() => send("threshold", thr)} busy={busy("threshold")} disabled={thr === state?.threshold} />
            </div>
          </Control>

          <Control title="Correct count" hint={`set the count directly · now ${state?.count ?? "–"} · 0–999`} p={commands.correct}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stepper value={corr} set={setCorr} min={0} max={999} />
              <ApplyButton onClick={() => send("correct", corr)} busy={busy("correct")} disabled={corr === state?.count} />
            </div>
          </Control>

          <Control title="Reset count" hint="sets count to 0 · entry/exit totals remain" p={commands.reset}>
            <HoldButton onConfirm={() => send("reset")} busy={busy("reset")} />
          </Control>

          <Control title="Test buzzer" hint="two short beeps on the UNO" p={commands.beep}>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => send("beep")} disabled={busy("beep")} className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-cyan/50 px-4 py-3 text-sm font-semibold text-cyan disabled:opacity-40">
              <Bell size={16} className="group-hover:animate-[wiggle_0.4s_ease-in-out_2]" />
              Beep
              <span className="flex items-end gap-0.5">
                {[6, 12, 8, 14, 5].map((hgt, i) => (
                  <motion.i key={i} className="w-0.5 rounded-full bg-cyan" animate={busy("beep") ? { height: [hgt, 3, hgt] } : { height: 3 }} transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.08 }} />
                ))}
              </span>
            </motion.button>
          </Control>
        </div>

      </div>
    </section>
  );
}

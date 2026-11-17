"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const LINES = ["Powering HC-SR04 array", "Calibrating sensor A · sensor B", "Opening ESP32 uplink", "Subscribing to counter/room-01/#"];

/** Short cinematic boot sequence. Shown once per browser tab; click to skip. */
export function Boot() {
  const [show, setShow] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("echo-boot") === "1";
      sessionStorage.setItem("echo-boot", "1");
    } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) {
      const t = setTimeout(() => setShow(false), 0);
      return () => clearTimeout(t);
    }
    const timers = LINES.map((_, i) => setTimeout(() => setStep(i + 1), 280 + i * 330));
    timers.push(setTimeout(() => setShow(false), 280 + LINES.length * 330 + 350));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="boot"
          onClick={() => setShow(false)}
          className="fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-bg"
          initial={{ clipPath: "circle(150% at 50% 50%)" }}
          exit={{ clipPath: "circle(0% at 50% 50%)", transition: { duration: 0.9, ease: [0.76, 0, 0.24, 1] } }}
        >
          <div className="relative flex flex-col items-center">
            <div className="relative grid h-48 w-48 place-items-center">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border border-lime/60"
                  initial={{ scale: 0.2, opacity: 0.9 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.45, ease: "easeOut" }}
                />
              ))}
              <motion.span className="h-4 w-4 rounded-full bg-lime shadow-[0_0_40px_10px_rgba(200,255,46,.5)]" animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
            </div>
            <motion.div initial={{ opacity: 0, letterSpacing: "0.6em" }} animate={{ opacity: 1, letterSpacing: "0.32em" }} transition={{ duration: 1 }} className="mt-6 font-display text-4xl font-extrabold">
              ECHO
            </motion.div>
            <div className="mt-6 h-24 w-72 font-mono text-[11px]">
              {LINES.map((l, i) => (
                <motion.div key={l} initial={{ opacity: 0, x: -10 }} animate={step > i ? { opacity: 1, x: 0 } : {}} className="flex items-center justify-between py-0.5 text-mute">
                  <span>{l}</span>
                  <span className="text-lime">{step > i + 1 || step === LINES.length ? "ok" : "··"}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] text-dim">click to skip</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

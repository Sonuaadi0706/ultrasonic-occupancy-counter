"use client";

import { motion } from "motion/react";
import { useLive } from "@/components/live/LiveProvider";

const NODES = [
  { k: "HC-SR04 ×2", s: "ultrasonic A/B" },
  { k: "Arduino UNO", s: "state machine" },
  { k: "ESP32", s: "cloud gateway" },
  { k: "EMQX", s: "MQTT · WSS" },
  { k: "This dashboard", s: "Next.js" },
  { k: "Turso", s: "event history" },
];

/** Architecture strip with packets flowing on every live event. */
export function Pipeline() {
  const { events, source } = useLive();
  const pulse = events[0]?.eventId;
  return (
    <div className="overflow-x-auto">
      <div className="relative flex min-w-[760px] items-center justify-between gap-2 py-6">
        <div className="absolute top-1/2 right-[6%] left-[6%] h-px bg-gradient-to-r from-lime/0 via-line-2 to-violet/0" />
        {pulse && (
          <motion.span
            key={pulse}
            className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-lime shadow-[0_0_16px_4px_rgba(200,255,46,.6)]"
            initial={{ left: "6%", opacity: 1 }}
            animate={{ left: "94%", opacity: [1, 1, 0] }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />
        )}
        {NODES.map((n, i) => {
          const dim = source === "simulator" && (n.k === "EMQX" || n.k === "ESP32");
          return (
            <motion.div key={n.k} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className={`relative z-10 rounded-2xl border border-line bg-panel px-4 py-3 text-center backdrop-blur ${dim ? "opacity-50" : ""}`}>
              <div className="font-display text-xs font-semibold whitespace-nowrap">{n.k}</div>
              <div className="font-mono text-[10px] text-mute">{n.s}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

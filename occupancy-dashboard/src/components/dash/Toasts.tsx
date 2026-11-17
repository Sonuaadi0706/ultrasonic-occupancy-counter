"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLive } from "@/components/live/LiveProvider";

export function Toasts() {
  const { toasts, dismissToast } = useLive();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(92vw,360px)] flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="pointer-events-auto relative overflow-hidden rounded-2xl border border-line-2 bg-[#0c0e18]/90 p-4 pr-10 shadow-2xl backdrop-blur-xl"
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: `var(--${t.tone})`, boxShadow: `0 0 20px var(--${t.tone})` }} />
            <div className="text-sm font-semibold" style={{ color: `var(--${t.tone})` }}>
              {t.title}
            </div>
            {t.body && <div className="mt-0.5 text-xs text-mute">{t.body}</div>}
            <button onClick={() => dismissToast(t.id)} className="absolute top-3 right-3 text-dim hover:text-ink" aria-label="Dismiss">
              <X size={14} />
            </button>
            <motion.span className="absolute bottom-0 left-0 h-0.5" style={{ background: `var(--${t.tone})` }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 4.8, ease: "linear" }} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useEffect } from "react";

/** Aurora blobs + grid + cursor spotlight + film grain. */
export function Background() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 80, damping: 20 });
  const sy = useSpring(y, { stiffness: 80, damping: 20 });
  const spot = useMotionTemplate`radial-gradient(520px circle at ${sx}px ${sy}px, rgba(200,255,46,0.07), transparent 60%)`;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-[30vh] -left-[20vw] h-[80vh] w-[70vw] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle, #8a6bff 0%, transparent 65%)" }}
        animate={{ x: [0, 120, -40, 0], y: [0, 60, 120, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[10vh] -right-[20vw] h-[70vh] w-[60vw] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, #38e1ff 0%, transparent 65%)" }}
        animate={{ x: [0, -100, 30, 0], y: [0, 100, -30, 0], scale: [1, 0.9, 1.1, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[30vh] left-[20vw] h-[60vh] w-[60vw] rounded-full opacity-[0.16] blur-[130px]"
        style={{ background: "radial-gradient(circle, #c8ff2e 0%, transparent 65%)" }}
        animate={{ x: [0, 80, -60, 0], y: [0, -60, 20, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="grid-bg absolute inset-0" />
      <motion.div className="absolute inset-0" style={{ background: spot }} />
      <div className="grain" />
    </div>
  );
}

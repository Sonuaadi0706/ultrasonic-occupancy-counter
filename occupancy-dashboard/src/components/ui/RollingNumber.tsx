"use client";

import { motion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";

function Digit({ place, value, height }: { place: number; value: number; height: number }) {
  const spring = useSpring(Math.floor(value / place), { stiffness: 140, damping: 18, mass: 0.8 });
  useEffect(() => {
    spring.set(Math.floor(value / place));
  }, [spring, value, place]);
  return (
    <span className="relative inline-block overflow-hidden" style={{ height, width: "0.82em" }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Num key={i} mv={spring} n={i} height={height} />
      ))}
    </span>
  );
}

function Num({ mv, n, height }: { mv: MotionValue<number>; n: number; height: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + n - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) memo -= 10 * height;
    return memo;
  });
  return (
    <motion.span style={{ y }} className="absolute inset-0 flex items-center justify-center">
      {n}
    </motion.span>
  );
}

/** Odometer-style number: each digit rolls on a spring. */
export function RollingNumber({ value, height, className = "" }: { value: number; height: number; className?: string }) {
  const v = Math.max(0, Math.floor(value));
  const digits = Math.max(1, String(v).length);
  const places = Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i));
  return (
    <span className={`tabular inline-flex leading-none ${className}`} style={{ height }} aria-label={String(v)} role="text">
      {places.map((p) => (
        <Digit key={p} place={p} value={v} height={height} />
      ))}
    </span>
  );
}

/** Smoothly tweened number for KPI tiles. */
export function TweenNumber({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const text = useTransform(spring, (v) => `${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  return <motion.span className="tabular">{text}</motion.span>;
}

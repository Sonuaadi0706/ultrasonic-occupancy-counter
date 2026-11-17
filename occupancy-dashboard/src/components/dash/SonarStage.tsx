"use client";

import { useEffect, useRef } from "react";
import { useLive, type LiveEvent } from "@/components/live/LiveProvider";

type Comet = { kind: "in" | "out" | "timeout"; t0: number; dur: number; trail: { x: number; y: number }[] };
type Burst = { t0: number; color: string; x: number; y: number; max: number; sparks: { a: number; v: number }[] };
type Ripple = { sensor: 0 | 1; t0: number };

const LIME = [200, 255, 46];
const CORAL = [255, 79, 109];
const CYAN = [56, 225, 255];
const AMBER = [255, 181, 71];
const VIOLET = [138, 107, 255];
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Live visualisation of the two HC-SR04 sensors.
 * Each sensor fires ultrasonic pulses down a cone; the echo sits at the measured
 * distance. Crossing events launch comets through the doorway.
 */
export function SonarStage({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stateRef, onEvent } = useLive();
  const fx = useRef({ comets: [] as Comet[], bursts: [] as Burst[], ripples: [] as Ripple[], flash: 0 });

  useEffect(() => {
    return onEvent((e: LiveEvent) => {
      const now = performance.now();
      const f = fx.current;
      if (e.type === "IN") f.comets.push({ kind: "in", t0: now, dur: 1500, trail: [] });
      else if (e.type === "OUT") f.comets.push({ kind: "out", t0: now, dur: 1500, trail: [] });
      else if (e.type === "TIMEOUT") f.comets.push({ kind: "timeout", t0: now, dur: 1800, trail: [] });
      else if (e.type === "INVALID") f.bursts.push(makeBurst(now, AMBER, 0.5, 0.66, 90));
      else if (e.type === "FULL") {
        f.flash = now;
        f.bursts.push(makeBurst(now, CORAL, 0.5, 0.5, 420));
      } else if (e.type === "RESET" || e.type === "CORRECT") f.bursts.push(makeBurst(now, CYAN, 0.5, 0.5, 300));
      else f.bursts.push(makeBurst(now, VIOLET, 0.5, 0.5, 240));
    });
  }, [onEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mono = (getComputedStyle(document.body).getPropertyValue("--ff-mono").trim() || "") + ", ui-monospace, monospace";

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const disp = { a: 170, b: 165, heatA: 0, heatB: 0 };
    const lastRipple = [0, 0];
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(canvas);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || W === 0) return;
      const s = stateRef.current;
      const f = fx.current;
      const distA = s?.distanceA ?? 170;
      const distB = s?.distanceB ?? 165;
      const thr = s?.threshold ?? 80;
      const actA = !!s?.flags.activeA;
      const actB = !!s?.flags.activeB;
      const faultA = !!s?.flags.faultA || distA < 0;
      const faultB = !!s?.flags.faultB || distB < 0;
      const full = !!s?.flags.full;
      const queue = s?.mode === "queue";
      const offline = !s || !s.unoOnline;

      disp.a += ((distA < 0 ? 400 : distA) - disp.a) * 0.22;
      disp.b += ((distB < 0 ? 400 : distB) - disp.b) * 0.22;
      disp.heatA += ((actA ? 1 : 0) - disp.heatA) * 0.15;
      disp.heatB += ((actB ? 1 : 0) - disp.heatB) * 0.15;

      ctx.clearRect(0, 0, W, H);

      const top = 46;
      const floor = H - 34;
      const maxCm = Math.max(220, thr + 50);
      const yFor = (cm: number) => top + (Math.min(cm, maxCm) / maxCm) * (floor - top);
      const ax = W * 0.41;
      const bx = W * 0.59;
      const t = now / 1000;

      // ── dot field
      ctx.save();
      const gap = 22;
      for (let y = 18; y < H; y += gap) {
        for (let x = (y / gap) % 2 ? 11 : 0; x < W; x += gap) {
          const d = Math.hypot(x - W / 2, y - H * 0.6) / Math.max(W, H);
          const wob = Math.sin(t * 1.2 + x * 0.02 + y * 0.015) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(255,255,255,${(0.05 + wob * 0.05) * (1 - d)})`;
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }
      ctx.restore();

      // ── doorway frame
      const dg = ctx.createLinearGradient(ax - 40, 0, bx + 40, 0);
      dg.addColorStop(0, "rgba(255,255,255,0)");
      dg.addColorStop(0.5, "rgba(138,107,255,0.08)");
      dg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = dg;
      ctx.fillRect(ax - 60, top - 18, bx - ax + 120, floor - top + 18);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax - 60, top - 18);
      ctx.lineTo(bx + 60, top - 18);
      ctx.stroke();

      // floor line
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(0, floor);
      ctx.lineTo(W, floor);
      ctx.stroke();
      ctx.setLineDash([]);

      // zone labels
      ctx.font = `600 10px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(139,144,166,0.75)";
      ctx.textAlign = "left";
      ctx.fillText(queue ? "QUEUE  IN  ▸" : "◂  OUTSIDE", 16, floor + 18);
      ctx.textAlign = "right";
      ctx.fillText(queue ? "▸  QUEUE  OUT" : "INSIDE  ▸", W - 16, floor + 18);

      // ── threshold line
      const ty = yFor(thr);
      ctx.strokeStyle = "rgba(255,181,71,0.55)";
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      ctx.moveTo(ax - 90, ty);
      ctx.lineTo(bx + 90, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,181,71,0.85)";
      if (bx + 96 + 110 < W) {
        ctx.textAlign = "left";
        ctx.fillText(`THRESHOLD ${thr}cm`, bx + 96, ty);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(`THR ${thr}cm`, W - 10, ty - 10);
      }

      // ── beams
      const beam = (x: number, cm: number, heat: number, fault: boolean, label: string) => {
        const ey = yFor(cm);
        const col = fault ? CORAL : heat > 0.5 ? LIME : CYAN;
        const spread = 0.22;
        const len = ey - top;
        // cone
        const cg = ctx.createLinearGradient(0, top, 0, ey);
        cg.addColorStop(0, rgba(col, 0.28 + heat * 0.25));
        cg.addColorStop(1, rgba(col, 0.02));
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x - len * spread, ey);
        ctx.lineTo(x + len * spread, ey);
        ctx.closePath();
        ctx.fill();

        // echo surface
        if (!fault) {
          ctx.save();
          ctx.shadowColor = rgba(col, 0.9);
          ctx.shadowBlur = 18 + heat * 30;
          ctx.strokeStyle = rgba(col, 0.9);
          ctx.lineWidth = 2 + heat * 2;
          ctx.beginPath();
          ctx.arc(x, top, len, Math.PI / 2 - spread * 1.05, Math.PI / 2 + spread * 1.05);
          ctx.stroke();
          ctx.restore();
          if (heat > 0.05) {
            const rg = ctx.createRadialGradient(x, ey, 0, x, ey, 70);
            rg.addColorStop(0, rgba(LIME, 0.45 * heat));
            rg.addColorStop(1, rgba(LIME, 0));
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(x, ey, 70, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // emitter
        ctx.save();
        ctx.shadowColor = rgba(col, 1);
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#0b0d16";
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.lineWidth = 1.5;
        roundRect(ctx, x - 20, top - 30, 40, 18, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = rgba(col, 1);
        ctx.beginPath();
        ctx.arc(x - 8, top - 21, 4, 0, Math.PI * 2);
        ctx.arc(x + 8, top - 21, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `700 11px ${mono}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(238,240,248,0.9)";
        ctx.fillText(label, x, top - 40);
        ctx.font = `500 10px ${mono}`;
        ctx.fillStyle = rgba(col, 0.95);
        ctx.fillText(fault ? "NO ECHO" : `${Math.round(cm)} cm`, x, Math.min(floor - 8, ey + 16));
      };
      beam(ax, disp.a, disp.heatA, faultA, "A");
      beam(bx, disp.b, disp.heatB, faultB, "B");

      // ── ripples (ultrasonic pulses)
      if (!reduced && !offline) {
        for (const i of [0, 1] as const) {
          const period = (i === 0 ? actA : actB) ? 160 : 420;
          if (now - lastRipple[i] > period) {
            f.ripples.push({ sensor: i, t0: now });
            lastRipple[i] = now;
          }
        }
      }
      f.ripples = f.ripples.filter((r) => now - r.t0 < 900);
      for (const r of f.ripples) {
        const x = r.sensor === 0 ? ax : bx;
        const cm = r.sensor === 0 ? disp.a : disp.b;
        const heat = r.sensor === 0 ? disp.heatA : disp.heatB;
        const maxR = yFor(cm) - top;
        const p = (now - r.t0) / 900;
        const rad = p * maxR;
        ctx.strokeStyle = rgba(heat > 0.5 ? LIME : CYAN, (1 - p) * 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, top, Math.max(1, rad), Math.PI / 2 - 0.24, Math.PI / 2 + 0.24);
        ctx.stroke();
      }

      // ── comets (people)
      const pathY = floor - 34;
      f.comets = f.comets.filter((c) => now - c.t0 < c.dur + 600);
      for (const c of f.comets) {
        const p = Math.min(1, (now - c.t0) / c.dur);
        let x: number;
        if (c.kind === "timeout") {
          const q = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
          x = W * 0.04 + q * (ax - W * 0.04 + 10);
        } else {
          const e = ease(p);
          x = c.kind === "in" ? W * 0.02 + e * W * 0.96 : W * 0.98 - e * W * 0.96;
        }
        const y = pathY - Math.sin(p * Math.PI) * 26;
        if (p < 1) c.trail.unshift({ x, y });
        else c.trail.pop();
        if (c.trail.length > 28) c.trail.pop();
        const col = c.kind === "in" ? LIME : c.kind === "out" ? CORAL : AMBER;
        for (let i = c.trail.length - 1; i > 0; i--) {
          const a = c.trail[i];
          const b = c.trail[i - 1];
          ctx.strokeStyle = rgba(col, (1 - i / c.trail.length) * 0.8);
          ctx.lineWidth = (1 - i / c.trail.length) * 9;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (p < 1) {
          ctx.save();
          ctx.shadowColor = rgba(col, 1);
          ctx.shadowBlur = 30;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = rgba(col, 0.25);
          ctx.beginPath();
          ctx.arc(x, y, 14 + Math.sin(now / 80) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── bursts
      f.bursts = f.bursts.filter((b) => now - b.t0 < 1100);
      for (const b of f.bursts) {
        const p = (now - b.t0) / 1100;
        const e = 1 - Math.pow(1 - p, 3);
        const cx = b.x * W;
        const cy = b.y * H;
        ctx.strokeStyle = b.color.replace("A", String((1 - p) * 0.8));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, e * b.max, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = b.color.replace("A", String(1 - p));
        for (const s of b.sparks) {
          const r = e * b.max * s.v;
          ctx.fillRect(cx + Math.cos(s.a) * r, cy + Math.sin(s.a) * r, 2.2, 2.2);
        }
      }

      // ── full flash / offline veil
      if (full) {
        const pulse = (Math.sin(t * 3) + 1) / 2;
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, "rgba(255,79,109,0)");
        vg.addColorStop(1, `rgba(255,79,109,${0.1 + pulse * 0.12})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }
      if (f.flash && now - f.flash < 700) {
        ctx.fillStyle = `rgba(255,79,109,${0.25 * (1 - (now - f.flash) / 700)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (offline) {
        ctx.fillStyle = "rgba(5,6,10,0.55)";
        ctx.fillRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [stateRef]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-label="Live ultrasonic sensor visualisation" role="img" />;
}

function makeBurst(t0: number, c: number[], x: number, y: number, max: number): Burst {
  return {
    t0,
    color: `rgba(${c[0]},${c[1]},${c[2]},A)`,
    x,
    y,
    max,
    sparks: Array.from({ length: 26 }, () => ({ a: Math.random() * Math.PI * 2, v: 0.4 + Math.random() * 0.8 })),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

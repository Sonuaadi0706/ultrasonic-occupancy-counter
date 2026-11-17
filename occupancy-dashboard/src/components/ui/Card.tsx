"use client";

import { forwardRef, type HTMLAttributes, type MouseEvent } from "react";

/** Glass card with a cursor-tracked spotlight border (see .card in globals.css). */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className = "", onMouseMove, ...rest }, ref) {
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    onMouseMove?.(e);
  };
  return <div ref={ref} className={`card ${className}`} onMouseMove={move} {...rest} />;
});

export function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow mb-2 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-lime" />
          {eyebrow}
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {right}
    </div>
  );
}

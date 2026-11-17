"use client";

import { useEffect, useRef, useState } from "react";
import type { Summary, SummaryRange } from "@/lib/types";
import { DEVICE_ID } from "@/components/live/LiveProvider";

/** Fetch /api/summary, refetch on `version` changes (debounced) and every 30 s. */
export function useSummary(range: SummaryRange, version = 0) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/summary?deviceId=${DEVICE_ID}&range=${range}&tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    const delay = first.current ? 0 : 1200;
    first.current = false;
    const t = setTimeout(load, delay);
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [range, version]);

  // Loading while we have nothing for the currently selected range.
  const loading = !data || data.range !== range;
  return { data, error, loading };
}

export function ago(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1500) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function duration(ms: number): string {
  if (!ms || ms < 0) return "0m";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(ms / 1000)}s`;
}

export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const shortTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const shortDate = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
export const dateTime = (t: number) =>
  new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const EVENT_META: Record<string, { label: string; color: string; glyph: string }> = {
  IN: { label: "Entry", color: "var(--lime)", glyph: "→" },
  OUT: { label: "Exit", color: "var(--coral)", glyph: "←" },
  FULL: { label: "Full", color: "var(--coral)", glyph: "■" },
  INVALID: { label: "Invalid", color: "var(--amber)", glyph: "✕" },
  TIMEOUT: { label: "Timeout", color: "var(--amber)", glyph: "◷" },
  MODE: { label: "Mode", color: "var(--violet)", glyph: "◐" },
  CAP: { label: "Capacity", color: "var(--violet)", glyph: "▣" },
  THRESH: { label: "Threshold", color: "var(--cyan)", glyph: "≋" },
  RESET: { label: "Reset", color: "var(--cyan)", glyph: "↺" },
  CORRECT: { label: "Correct", color: "var(--cyan)", glyph: "✎" },
};

export function describeEvent(e: { type: string; delta: number; count: number; capacity: number }): string {
  switch (e.type) {
    case "IN": return `Someone entered · ${e.count}/${e.capacity}`;
    case "OUT": return `Someone left · ${e.count}/${e.capacity}`;
    case "FULL": return `Capacity reached · ${e.count}/${e.capacity}`;
    case "INVALID": return "Ambiguous crossing rejected";
    case "TIMEOUT": return "Crossing timed out";
    case "MODE": return `Mode → ${e.delta === 1 ? "queue" : "room"}`;
    case "CAP": return `Capacity → ${e.delta}`;
    case "THRESH": return `Threshold → ${e.delta} cm`;
    case "RESET": return "Count reset to 0";
    case "CORRECT": return `Count corrected to ${e.count} (${e.delta >= 0 ? "+" : ""}${e.delta})`;
    default: return e.type;
  }
}

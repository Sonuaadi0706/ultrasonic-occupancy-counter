"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MqttClient } from "mqtt";
import { CounterSimulator } from "@/lib/simulator";
import type { CommandAck, CommandName, DeviceEvent, DeviceState, DeviceStatus } from "@/lib/types";

export const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID || "room-01";
export const DEVICE_NAME = process.env.NEXT_PUBLIC_DEVICE_NAME || "Main Room";
const MQTT_URL = process.env.NEXT_PUBLIC_MQTT_URL || "";
const MQTT_USER = process.env.NEXT_PUBLIC_MQTT_USERNAME || undefined;
const MQTT_PASS = process.env.NEXT_PUBLIC_MQTT_PASSWORD || undefined;

const ACK_TIMEOUT_MS = 5000;
const STALE_AFTER_MS = 5000;
const MAX_LIVE_EVENTS = 60;

export type Source = "mqtt" | "simulator";
/** Real mode needs a broker URL baked in at build time. */
export const REAL_AVAILABLE = Boolean(MQTT_URL);
const SOURCE_KEY = "echo-source";
export type Conn = "connecting" | "connected" | "reconnecting" | "offline";
export type LiveEvent = DeviceEvent & { receivedAt: number };

export interface PendingCommand {
  cmdId: string;
  cmd: CommandName;
  value?: string | number;
  startedAt: number;
  status: "pending" | "ok" | "error" | "timeout";
  message?: string;
}

export interface Toast {
  id: number;
  tone: "lime" | "coral" | "amber" | "cyan";
  title: string;
  body?: string;
}

interface LiveContextValue {
  source: Source;
  setSource: (s: Source) => void;
  conn: Conn;
  state: DeviceState | null;
  /** Always-current state for animation loops (not throttled). */
  stateRef: React.RefObject<DeviceState | null>;
  deviceStatus: "online" | "offline" | "unknown";
  lastStateAt: number | null;
  stale: boolean;
  events: LiveEvent[];
  now: number;
  commands: Partial<Record<CommandName, PendingCommand>>;
  sendCommand: (cmd: CommandName, value?: string | number) => Promise<PendingCommand | { error: string }>;
  onEvent: (fn: (e: LiveEvent) => void) => () => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  historyVersion: number;
}

const LiveContext = createContext<LiveContextValue | null>(null);

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<Source>(REAL_AVAILABLE ? "mqtt" : "simulator");
  const [conn, setConn] = useState<Conn>("connecting");
  const [state, setState] = useState<DeviceState | null>(null);
  const stateRef = useRef<DeviceState | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [lastStateAt, setLastStateAt] = useState<number | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [now, setNow] = useState(0);
  const [commands, setCommands] = useState<Partial<Record<CommandName, PendingCommand>>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const listeners = useRef(new Set<(e: LiveEvent) => void>());
  const simRef = useRef<CounterSimulator | null>(null);
  const pendingById = useRef(new Map<string, { cmd: CommandName; timer: ReturnType<typeof setTimeout> }>());
  const lastFlush = useRef(0);
  const toastId = useRef(0);
  const prevStatus = useRef<string>("unknown");
  const prevUno = useRef<boolean | null>(null);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4800);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const onEvent = useCallback((fn: (e: LiveEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  // ── Inbound handlers (shared by MQTT and simulator) ──────────────────────
  const handleState = useCallback((s: DeviceState, force = false) => {
    stateRef.current = s;
    const t = Date.now();
    if (force || t - lastFlush.current > 180) {
      lastFlush.current = t;
      setState({ ...s, flags: { ...s.flags }, esp: s.esp ? { ...s.esp } : undefined });
      setLastStateAt(t);
    }
    if (prevUno.current === true && !s.unoOnline) pushToast({ tone: "coral", title: "UNO link lost", body: "The ESP32 stopped receiving UART state." });
    if (prevUno.current === false && s.unoOnline) pushToast({ tone: "lime", title: "UNO link restored" });
    prevUno.current = s.unoOnline;
  }, [pushToast]);

  const handleEvent = useCallback((e: DeviceEvent) => {
    const le: LiveEvent = { ...e, receivedAt: Date.now() };
    setEvents((list) => (list.some((x) => x.eventId === e.eventId) ? list : [le, ...list].slice(0, MAX_LIVE_EVENTS)));
    listeners.current.forEach((fn) => fn(le));
    if (e.type === "FULL") pushToast({ tone: "coral", title: "Capacity reached", body: `${e.count} / ${e.capacity} — the room is full.` });
    if (e.type === "RESET") pushToast({ tone: "cyan", title: "Count reset to 0" });
    // History refetch for persisted streams (MQTT path). Debounced by consumers.
    if (source === "mqtt") setHistoryVersion((v) => v + 1);
  }, [pushToast, source]);

  const handleStatus = useCallback((s: DeviceStatus) => {
    setDeviceStatus(s.status);
    if (prevStatus.current === "online" && s.status === "offline") pushToast({ tone: "coral", title: "Device offline", body: "ESP32 Last Will received." });
    if (prevStatus.current === "offline" && s.status === "online") pushToast({ tone: "lime", title: "Device back online" });
    prevStatus.current = s.status;
  }, [pushToast]);

  const handleAck = useCallback((a: CommandAck) => {
    const p = pendingById.current.get(a.cmdId);
    if (!p) return;
    clearTimeout(p.timer);
    pendingById.current.delete(a.cmdId);
    setCommands((c) => {
      const cur = c[p.cmd];
      if (!cur || cur.cmdId !== a.cmdId) return c;
      return { ...c, [p.cmd]: { ...cur, status: a.ok ? "ok" : "error", message: a.ok ? `${a.verb} acknowledged` : `${a.verb} rejected by device` } };
    });
    pushToast(a.ok ? { tone: "lime", title: `${a.verb} ✓`, body: "Acknowledged by the device." } : { tone: "coral", title: `${a.verb} failed`, body: "The UNO rejected the command." });
    if (!a.cmdId.startsWith("demo-")) void fetch("/api/command/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmdId: a.cmdId, ok: a.ok }) }).catch(() => {});
  }, [pushToast]);

  // ── Clock for ages / staleness ────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // ── Demo / real switch ────────────────────────────────────────────────────
  const setSource = useCallback((next: Source) => {
    if (next === "mqtt" && !REAL_AVAILABLE) return;
    try {
      localStorage.setItem(SOURCE_KEY, next);
    } catch {}
    // Drop everything from the previous source so demo and real data never mix.
    pendingById.current.forEach((p) => clearTimeout(p.timer));
    pendingById.current.clear();
    stateRef.current = null;
    prevStatus.current = "unknown";
    prevUno.current = null;
    setState(null);
    setLastStateAt(null);
    setEvents([]);
    setCommands({});
    setDeviceStatus("unknown");
    setConn("connecting");
    setSourceState(next);
  }, []);

  // Restore the viewer's last choice (after hydration, so SSR markup matches).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SOURCE_KEY);
    } catch {}
    if ((saved === "mqtt" || saved === "simulator") && saved !== source) {
      const t = setTimeout(() => setSource(saved as Source), 0);
      return () => clearTimeout(t);
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live source: simulator ────────────────────────────────────────────────
  useEffect(() => {
    if (source !== "simulator") return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const start = (count: number, capacity: number) => {
      if (cancelled) return;
      const sim = new CounterSimulator({ deviceId: DEVICE_ID, count, capacity, meanGapMs: 3800 });
      simRef.current = sim;
      setConn("connected");
      handleStatus({ deviceId: DEVICE_ID, status: "online" });
      handleState(sim.state, true);
      timer = setInterval(() => {
        const evs = sim.tick();
        handleState(sim.state);
        evs.forEach(handleEvent);
      }, 60);
    };

    // Start where the history left off so the hero matches the charts.
    fetch(`/api/events?deviceId=${DEVICE_ID}&limit=1`)
      .then((r) => r.json())
      .then((d) => {
        const last = d.events?.[0];
        start(last ? Math.min(last.count, last.capacity) : 3, last?.capacity ?? 10);
      })
      .catch(() => start(3, 10));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      simRef.current = null;
    };
  }, [source, handleEvent, handleState, handleStatus]);

  // ── Live source: MQTT over WebSockets ─────────────────────────────────────
  useEffect(() => {
    if (source !== "mqtt") return;
    let client: MqttClient | null = null;
    let disposed = false;
    const T = (s: string) => `counter/${DEVICE_ID}/${s}`;

    import("mqtt").then(({ default: mqtt }) => {
      if (disposed) return;
      client = mqtt.connect(MQTT_URL, {
        username: MQTT_USER,
        password: MQTT_PASS,
        clientId: `web-${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
        clean: true,
      });
      client.on("connect", () => {
        setConn("connected");
        client?.subscribe([T("state"), T("status"), T("event"), T("ack")], { qos: 1 });
      });
      client.on("reconnect", () => setConn("reconnecting"));
      client.on("offline", () => setConn("offline"));
      client.on("close", () => setConn((c) => (c === "connected" ? "reconnecting" : c)));
      client.on("error", () => setConn("offline"));
      client.on("message", (topic, payload) => {
        let msg: unknown;
        try {
          msg = JSON.parse(payload.toString());
        } catch {
          return;
        }
        if (topic === T("state")) handleState(msg as DeviceState);
        else if (topic === T("event")) handleEvent(msg as DeviceEvent);
        else if (topic === T("status")) handleStatus(msg as DeviceStatus);
        else if (topic === T("ack")) handleAck(msg as CommandAck);
      });
    });

    return () => {
      disposed = true;
      client?.end(true);
    };
  }, [source, handleAck, handleEvent, handleState, handleStatus]);

  // ── Commands ──────────────────────────────────────────────────────────────
  const track = useCallback(
    (cmdId: string, cmd: CommandName, value?: string | number): PendingCommand => {
      const entry: PendingCommand = { cmdId, cmd, value, startedAt: Date.now(), status: "pending" };
      setCommands((c) => ({ ...c, [cmd]: entry }));
      const timer = setTimeout(() => {
        pendingById.current.delete(cmdId);
        setCommands((c) => (c[cmd]?.cmdId === cmdId ? { ...c, [cmd]: { ...entry, status: "timeout", message: "No ack within 5 s" } } : c));
        pushToast({ tone: "amber", title: `${cmd} timed out`, body: "No acknowledgement from the device within 5 s." });
      }, ACK_TIMEOUT_MS);
      pendingById.current.set(cmdId, { cmd, timer });
      return entry;
    },
    [pushToast],
  );

  const sendCommand = useCallback<LiveContextValue["sendCommand"]>(
    async (cmd, value) => {
      // Demo: the simulated UNO answers locally, like real hardware would.
      if (source === "simulator") {
        const sim = simRef.current;
        if (!sim) return { error: "Simulator is still starting" };
        const entry = track(`demo-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, cmd, value);
        setTimeout(() => {
          const { ack, events: evs } = sim.command({ cmdId: entry.cmdId, cmd, value, ts: Date.now() });
          evs.forEach(handleEvent);
          handleState(sim.state, true);
          setTimeout(() => handleAck(ack), 140);
        }, 220 + Math.random() * 200);
        return entry;
      }

      // Real: the server publishes to counter/<id>/cmd; the ESP32 acks over MQTT.
      let res: Response;
      try {
        res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: DEVICE_ID, cmd, value }),
        });
      } catch {
        return { error: "Network error — server unreachable" };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error || `Command failed (${res.status})` };
      if (!data.delivered) return { error: "The server has no MQTT_URL set, so it can't reach the device." };
      return track(data.cmdId, cmd, value);
    },
    [source, track, handleAck, handleEvent, handleState],
  );

  const stale = lastStateAt === null ? false : now - lastStateAt > STALE_AFTER_MS;

  const value = useMemo<LiveContextValue>(
    () => ({
      source,
      setSource,
      conn,
      state,
      stateRef,
      deviceStatus,
      lastStateAt,
      stale,
      events,
      now,
      commands,
      sendCommand,
      onEvent,
      toasts,
      pushToast,
      dismissToast,
      historyVersion,
    }),
    [source, conn, state, deviceStatus, lastStateAt, stale, events, now, commands, sendCommand, setSource, onEvent, toasts, pushToast, dismissToast, historyVersion],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

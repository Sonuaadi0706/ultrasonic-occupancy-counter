// A faithful software twin of the UNO room/queue counter + ESP32 gateway.
// Used by the in-browser demo mode and by `scripts/mock-device.ts`.
// Only type imports — Node strips them, so this file runs without a bundler.
import type { CommandAck, DeviceCommand, DeviceEvent, DeviceState, EventType, Mode } from "./types";

type CrossingKind = "in" | "out" | "invalid" | "timeout";

interface Crossing {
  kind: CrossingKind;
  t0: number;
  emitted: boolean;
}

const VERB: Record<string, string> = {
  mode: "MODE",
  capacity: "CAP",
  threshold: "THRESH",
  correct: "CORRECT",
  reset: "RESET",
  beep: "BEEP",
  status: "STATUS",
};

export interface SimOptions {
  deviceId?: string;
  now?: number;
  count?: number;
  capacity?: number;
  /** Mean milliseconds between people crossing the door. */
  meanGapMs?: number;
}

export class CounterSimulator {
  state: DeviceState;
  readonly bootId: string;
  private eventSeq = 0;
  private crossing: Crossing | null = null;
  private nextAt: number;
  private startedAt: number;
  private baseA = 172;
  private baseB = 164;
  private meanGap: number;
  /** When true, people keep coming — set false to freeze traffic. */
  traffic = true;

  constructor(opts: SimOptions = {}) {
    const now = opts.now ?? Date.now();
    this.startedAt = now - 184_200;
    this.meanGap = opts.meanGapMs ?? 4200;
    this.bootId = `boot${Math.floor(now / 1000).toString(36).slice(-4)}`;
    const capacity = opts.capacity ?? 10;
    const count = opts.count ?? 3;
    this.state = {
      deviceId: opts.deviceId ?? "room-01",
      ts: now,
      unoOnline: true,
      count,
      mode: "room",
      capacity,
      in: 34 + count,
      out: 34,
      distanceA: this.baseA,
      distanceB: this.baseB,
      threshold: 80,
      flags: { activeA: false, activeB: false, full: count >= capacity, faultA: false, faultB: false },
      sequence: 0,
      esp: { rssi: -58, uptimeMs: now - this.startedAt, freeHeap: 214_000, ip: "192.168.1.42" },
    };
    this.nextAt = now + 1200;
  }

  private emit(type: EventType, delta: number, now: number): DeviceEvent {
    const seq = this.eventSeq++;
    return {
      eventId: `${this.state.deviceId}-${this.bootId}-${seq}`,
      deviceId: this.state.deviceId,
      seq,
      type,
      delta,
      count: this.state.count,
      mode: this.state.mode,
      capacity: this.state.capacity,
      ts: now,
    };
  }

  private chooseKind(): CrossingKind {
    const s = this.state;
    const r = Math.random();
    if (r < 0.04) return "invalid";
    if (r < 0.06 && s.mode === "room") return "timeout";
    const load = s.count / s.capacity;
    // Bias towards leaving as the room fills, entering when empty.
    const pIn = s.count === 0 ? 0.92 : Math.max(0.15, 0.82 - load * 0.62);
    return Math.random() < pIn ? "in" : "out";
  }

  private increment(now: number, out: DeviceEvent[]) {
    const s = this.state;
    const wasFull = s.count >= s.capacity;
    s.count++;
    s.in++;
    out.push(this.emit("IN", 1, now));
    if (!wasFull && s.count >= s.capacity) out.push(this.emit("FULL", 0, now));
  }

  private decrement(now: number, out: DeviceEvent[]) {
    const s = this.state;
    s.out++;
    if (s.count > 0) {
      s.count--;
      out.push(this.emit("OUT", -1, now));
    } else {
      out.push(this.emit("INVALID", 0, now));
    }
  }

  /** Advance the simulation. Returns any events produced. */
  tick(now = Date.now()): DeviceEvent[] {
    const s = this.state;
    const events: DeviceEvent[] = [];

    if (!this.crossing && this.traffic && now >= this.nextAt) {
      this.crossing = { kind: this.chooseKind(), t0: now, emitted: false };
    }

    let aActive = false;
    let bActive = false;
    let sequence = 0;

    const c = this.crossing;
    if (c) {
      const dt = now - c.t0;
      const queue = s.mode === "queue";
      if (c.kind === "in" || c.kind === "out") {
        const first = c.kind === "in" ? "A" : "B";
        if (queue) {
          // Queue: single-sensor edge on A (+1) or B (-1)
          const on = dt < 520;
          if (first === "A") aActive = on;
          else bActive = on;
          if (!c.emitted && dt >= 180) {
            c.emitted = true;
            if (c.kind === "in") this.increment(now, events);
            else this.decrement(now, events);
          }
          if (dt > 700) this.crossing = null;
        } else {
          const firstOn = dt < 560;
          const secondOn = dt > 280 && dt < 920;
          if (first === "A") {
            aActive = firstOn;
            bActive = secondOn;
          } else {
            bActive = firstOn;
            aActive = secondOn;
          }
          sequence = dt < 280 ? (first === "A" ? 1 : 2) : dt < 1050 ? 3 : 0;
          if (!c.emitted && dt >= 620) {
            c.emitted = true;
            if (c.kind === "in") this.increment(now, events);
            else this.decrement(now, events);
          }
          if (dt > 1100) this.crossing = null;
        }
      } else if (c.kind === "invalid") {
        aActive = dt < 600;
        bActive = dt < 600;
        sequence = dt < 900 ? 4 : 0;
        if (!c.emitted && dt >= 80) {
          c.emitted = true;
          events.push(this.emit("INVALID", 0, now));
        }
        if (dt > 950) this.crossing = null;
      } else {
        // timeout: someone pauses under A and backs away
        aActive = dt < 1400;
        sequence = dt < 2600 ? 1 : 0;
        if (!c.emitted && dt >= 2500) {
          c.emitted = true;
          events.push(this.emit("TIMEOUT", 0, now));
        }
        if (dt > 2650) this.crossing = null;
      }
      if (!this.crossing) {
        this.nextAt = now + this.meanGap * (0.45 + Math.random() * 1.1);
      }
    }

    const jitter = () => (Math.random() - 0.5) * 4;
    this.baseA += (172 - this.baseA) * 0.05 + (Math.random() - 0.5) * 0.8;
    this.baseB += (164 - this.baseB) * 0.05 + (Math.random() - 0.5) * 0.8;
    const body = () => 34 + Math.random() * 14;
    s.distanceA = Math.round(aActive ? body() : this.baseA + jitter());
    s.distanceB = Math.round(bActive ? body() : this.baseB + jitter());
    s.flags = {
      activeA: aActive,
      activeB: bActive,
      full: s.count >= s.capacity,
      faultA: false,
      faultB: false,
    };
    s.sequence = sequence;
    s.ts = now;
    if (s.esp) {
      s.esp.uptimeMs = now - this.startedAt;
      s.esp.rssi = Math.round(Math.max(-80, Math.min(-42, s.esp.rssi + (Math.random() - 0.5) * 3)));
      s.esp.freeHeap = 214_000 + Math.round((Math.random() - 0.5) * 3000);
    }
    return events;
  }

  /** Apply a dashboard command the way the UNO would, returning the ack and events. */
  command(cmd: DeviceCommand, now = Date.now()): { ack: CommandAck; events: DeviceEvent[] } {
    const s = this.state;
    const events: DeviceEvent[] = [];
    let ok = true;
    const v = cmd.value;

    switch (cmd.cmd) {
      case "mode": {
        const m = v as Mode;
        if (m !== "room" && m !== "queue") ok = false;
        else if (m !== s.mode) {
          s.mode = m;
          this.crossing = null;
          events.push(this.emit("MODE", m === "queue" ? 1 : 0, now));
        }
        break;
      }
      case "capacity": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 99) ok = false;
        else {
          const wasFull = s.count >= s.capacity;
          s.capacity = n;
          events.push(this.emit("CAP", n, now));
          if (!wasFull && s.count >= s.capacity) events.push(this.emit("FULL", 0, now));
        }
        break;
      }
      case "threshold": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 10 || n > 300) ok = false;
        else {
          s.threshold = n;
          events.push(this.emit("THRESH", n, now));
        }
        break;
      }
      case "correct": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 999) ok = false;
        else {
          const old = s.count;
          s.count = n;
          events.push(this.emit("CORRECT", n - old, now));
        }
        break;
      }
      case "reset":
        s.count = 0;
        events.push(this.emit("RESET", 0, now));
        break;
      case "beep":
      case "status":
        break;
      default:
        ok = false;
    }
    s.flags.full = s.count >= s.capacity;
    return { ack: { cmdId: cmd.cmdId, verb: VERB[cmd.cmd] ?? String(cmd.cmd).toUpperCase(), ok, ts: now + 180 }, events };
  }
}

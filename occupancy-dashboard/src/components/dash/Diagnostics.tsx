"use client";

import { Cpu, MemoryStick, Network, Radio, Timer, Wifi } from "lucide-react";
import { useLive } from "@/components/live/LiveProvider";
import { Card } from "@/components/ui/Card";
import { ago, duration } from "@/lib/format";

export function Diagnostics() {
  const { state, source, conn, lastStateAt, now, deviceStatus } = useLive();
  const esp = state?.esp;
  const rssi = esp?.rssi ?? -100;
  const bars = rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : rssi > -85 ? 1 : 0;
  const rows: [React.ReactNode, string, React.ReactNode][] = [
    [<Wifi key="w" size={14} />, "Wi-Fi RSSI", (
      <span key="r" className="flex items-center gap-2">
        <span className="flex items-end gap-0.5">
          {[1, 2, 3, 4].map((b) => (
            <i key={b} className="w-1 rounded-sm" style={{ height: 4 + b * 3, background: b <= bars ? "var(--lime)" : "rgba(255,255,255,.12)" }} />
          ))}
        </span>
        {esp ? `${rssi} dBm` : "—"}
      </span>
    )],
    [<Timer key="t" size={14} />, "ESP32 uptime", esp ? duration(esp.uptimeMs) : "—"],
    [<MemoryStick key="m" size={14} />, "Free heap", esp ? `${(esp.freeHeap / 1024).toFixed(0)} KB` : "—"],
    [<Network key="n" size={14} />, "LAN IP", esp?.ip ?? "—"],
    [<Radio key="r" size={14} />, "Live source", source === "mqtt" ? `MQTT · ${conn}` : "built-in simulator"],
    [<Cpu key="c" size={14} />, "Last state", lastStateAt ? ago(now - lastStateAt) : "—"],
  ];
  return (
    <Card className="h-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="eyebrow">Gateway</div>
          <div className="mt-1 font-display text-lg font-semibold">ESP32 diagnostics</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase ${deviceStatus === "online" ? "bg-lime/15 text-lime" : deviceStatus === "offline" ? "bg-coral/15 text-coral" : "bg-white/5 text-mute"}`}>{deviceStatus}</span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([icon, k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="flex items-center gap-2.5 text-mute">
              <span className="text-dim">{icon}</span>
              {k}
            </dt>
            <dd className="font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

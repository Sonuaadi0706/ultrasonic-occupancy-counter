"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, FlaskConical, Radio } from "lucide-react";
import { LiveProvider, REAL_AVAILABLE, useLive } from "@/components/live/LiveProvider";
import { Background } from "./Background";
import { Boot } from "./Boot";
import { Charts } from "./Charts";
import { ControlDeck } from "./ControlDeck";
import { Diagnostics } from "./Diagnostics";
import { EventFeed, Ticker } from "./EventFeed";
import { EventTable } from "./EventTable";
import { Hero } from "./Hero";
import { Kpis } from "./Kpis";
import { Navbar } from "./Navbar";
import { Pipeline } from "./Pipeline";
import { SensorPanel } from "./SensorPanel";
import { Toasts } from "./Toasts";

const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { type: "spring" as const, stiffness: 70, damping: 18 },
};

function Banner() {
  const { source, conn, deviceStatus, state } = useLive();
  let node: React.ReactNode = null;
  if (source === "simulator") {
    node = (
      <div className="flex items-start gap-3 rounded-2xl border border-violet/30 bg-violet/10 px-4 py-3 text-sm">
        <FlaskConical size={16} className="mt-0.5 shrink-0 text-violet" />
        <span className="text-mute">
          <span className="text-ink">Demo mode.</span> The live view is a software twin of the UNO + ESP32, and controls drive the twin, not your hardware.{" "}
          {REAL_AVAILABLE ? (
            <>Switch to <span className="text-lime">Real</span> in the top bar to see your device.</>
          ) : (
            <>
              Set <code className="font-mono text-violet">NEXT_PUBLIC_MQTT_URL</code> to enable Real mode.
            </>
          )}
        </span>
      </div>
    );
  } else if (conn === "offline" || conn === "reconnecting") {
    node = (
      <div className="flex items-center gap-3 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm">
        <AlertTriangle size={16} className="text-amber" />
        <span className="text-mute">
          <span className="text-amber">Live data disconnected</span> — retrying the MQTT broker. History still loads.
        </span>
      </div>
    );
  } else if (conn === "connected" && deviceStatus === "unknown" && !state) {
    node = (
      <div className="flex items-center gap-3 rounded-2xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm">
        <Radio size={16} className="shrink-0 text-cyan" />
        <span className="text-mute">
          <span className="text-cyan">Connected to the broker, waiting for your ESP32.</span> Power the gateway (Wi-Fi), or plug it in over USB and run <code className="font-mono text-cyan">npm run bridge</code>.
        </span>
      </div>
    );
  } else if (deviceStatus === "offline") {
    node = (
      <div className="flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm">
        <AlertTriangle size={16} className="text-coral" />
        <span className="text-mute">
          <span className="text-coral">Device offline.</span> The ESP32 Last Will fired; values below are the last known state.
        </span>
      </div>
    );
  } else if (state && !state.unoOnline) {
    node = (
      <div className="flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm">
        <AlertTriangle size={16} className="text-coral" />
        <span className="text-mute">
          <span className="text-coral">UNO link lost.</span> The ESP32 is online but stopped receiving UART state — check power, common ground and the D3 divider.
        </span>
      </div>
    );
  }
  return (
    <AnimatePresence>
      {node && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="pb-4">{node}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HistoryBridge() {
  const { historyVersion } = useLive();
  return (
    <>
      <motion.div {...reveal}>
        <Charts version={historyVersion} />
      </motion.div>
      <motion.div {...reveal}>
        <EventTable version={historyVersion} />
      </motion.div>
    </>
  );
}

const words = ["Who's", "in", "the", "room,"];

function Body() {
  return (
    <>
      <Boot />
      <Background />
      <Navbar />
      <main id="top" className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
        <section className="pt-10 pb-8 sm:pt-16">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="eyebrow mb-4 flex items-center gap-2">
            <i className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime text-lime" /> Ultrasonic occupancy counter · live
          </motion.div>
          <h1 className="font-display text-[clamp(2.2rem,6.5vw,5.6rem)] leading-[0.95] font-extrabold tracking-tight">
            {words.map((w, i) => (
              <span key={w} className="mr-[0.25em] inline-block overflow-hidden pb-2 align-bottom">
                <motion.span className="inline-block" initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.35 + i * 0.08, type: "spring", stiffness: 90, damping: 16 }}>
                  {w}
                </motion.span>
              </span>
            ))}
            <br />
            <span className="inline-block overflow-hidden pb-2 align-bottom">
              <motion.span className="text-signal inline-block" initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.7, type: "spring", stiffness: 90, damping: 16 }}>
                right now.
              </motion.span>
            </span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-5 max-w-xl text-mute">
            Two HC-SR04 sensors read the doorway, an Arduino UNO decides direction, and an ESP32 streams every crossing here over MQTT — with history kept in Turso.
          </motion.p>
        </section>

        <Banner />

        <motion.div initial={{ opacity: 0, y: 60, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 60, damping: 16 }}>
          <Hero />
        </motion.div>
      </main>

      <div className="mb-12 -mt-12">
        <Ticker />
      </div>

      <div className="mx-auto max-w-[1400px] space-y-16 px-4 pb-24 sm:px-6">
        <motion.div {...reveal}>
          <Kpis />
        </motion.div>

        <motion.div {...reveal} className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SensorPanel />
          </div>
          <div className="lg:col-span-4">
            <EventFeed />
          </div>
          <div className="lg:col-span-3">
            <Diagnostics />
          </div>
        </motion.div>

        <HistoryBridge />

        <motion.div {...reveal}>
          <ControlDeck />
        </motion.div>

        <motion.footer {...reveal} className="border-t border-line pt-10">
          <div className="eyebrow mb-2">Signal path</div>
          <Pipeline />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-dim">
            <span>ECHO · ultrasonic occupancy counter · IoT mini project</span>
            <span>UTC in the database · your local time on screen</span>
          </div>
        </motion.footer>
      </div>
      <Toasts />
    </>
  );
}

export function Dashboard() {
  return (
    <LiveProvider>
      <Body />
    </LiveProvider>
  );
}

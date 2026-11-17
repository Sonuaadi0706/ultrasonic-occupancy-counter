import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const display = Unbounded({ variable: "--ff-display", subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: "Echo — Ultrasonic Occupancy",
  description: "Live room & queue occupancy from a dual HC-SR04 ultrasonic counter (Arduino UNO + ESP32).",
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}

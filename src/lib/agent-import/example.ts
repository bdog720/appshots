/**
 * The worked example embedded in the agent prompt and shipped (with placeholder
 * PNGs) in docs/agent-import/example/. Tests keep it valid, warning-free, and
 * covering every layout.
 */

import type { ImportManifest } from "./schema";

export interface ExampleImage {
  name: string;
  width: number;
  height: number;
  /** Placeholder fill color for the generated PNG. */
  color: [number, number, number];
}

const PHONE = { width: 1206, height: 2622 }; // iphone-17-pro native resolution

export const EXAMPLE_IMAGES: ExampleImage[] = [
  { name: "01-today.png", ...PHONE, color: [238, 240, 255] },
  { name: "02-streaks.png", ...PHONE, color: [224, 231, 255] },
  { name: "03-reminders.png", ...PHONE, color: [237, 233, 254] },
  { name: "04-insights.png", ...PHONE, color: [219, 234, 254] },
  { name: "05-focus.png", ...PHONE, color: [236, 253, 245] },
  { name: "06-journal.png", ...PHONE, color: [30, 41, 59] },
  { name: "07-widgets.png", ...PHONE, color: [254, 243, 199] },
  { name: "08-share.png", ...PHONE, color: [252, 231, 243] },
  { name: "09a-light.png", ...PHONE, color: [248, 250, 252] },
  { name: "09b-dark.png", ...PHONE, color: [15, 23, 42] },
  { name: "badge.png", width: 600, height: 600, color: [255, 214, 10] },
];

export const EXAMPLE_MANIFEST: ImportManifest = {
  format: "appshots-import",
  version: 1,
  name: "Habitly — App Store",
  exportSize: "6.9",
  brand: {
    primary: "#5B5BD6",
    style: "bold",
  },
  device: { id: "iphone-17-pro", color: "cosmic-orange", style: "flat", shadow: true },
  screens: [
    {
      image: "01-today.png",
      headline: "Build habits <mark>that stick</mark>",
      subheadline: "Tiny daily wins, tracked for you",
      layout: "bleed-bottom",
      overlays: [{ image: "badge.png", x: 82, y: 30, width: 18, layer: "front" }],
    },
    { image: "02-streaks.png", headline: "Watch streaks grow", layout: "tilt-left" },
    { image: "03-reminders.png", headline: "Never miss a day", subheadline: "Gentle nudges at the right time", layout: "tilt-right" },
    { image: "04-insights.png", headline: "Insights that <mark>motivate</mark>", layout: "perspective" },
    { image: "05-focus.png", headline: "Focus on one thing", layout: "centered" },
    {
      image: "06-journal.png",
      headline: "Reflect in seconds",
      subheadline: "A private journal for every habit",
      layout: "bleed-top",
      background: { type: "solid", color: "#0F172A" },
      text: { color: "#F8FAFC" },
    },
    { image: "07-widgets.png", headline: "Widgets everywhere", layout: "float-center" },
    {
      image: "08-share.png",
      headline: "Share your progress",
      subheadline: "Invite friends and keep each other on track",
      layout: "float-bottom",
    },
    {
      headline: "Light or dark, your call",
      devices: [
        { image: "09a-light.png", x: 32, y: 40, scale: 55, rotation: -8 },
        { image: "09b-dark.png", x: 68, y: 44, scale: 55, rotation: 8 },
      ],
    },
  ],
};

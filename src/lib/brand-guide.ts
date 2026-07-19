/**
 * Brand guide "design brain" — turns a brand color + a vibe into a coordinated,
 * contrast-validated look (font, size scale, background, readable text color).
 * Pure; the generated text color is validated with the Phase 1 contrast engine so
 * a brand can never be unreadable. Six vibes sit on a Character x Energy grid.
 */

import type { BackgroundSettings } from "./background-settings";
import { resolveGradientStops } from "./background-settings";
import { adjustLightness, rotateHue, mix } from "./color-utils";
import { readableTextOptions, contrastRatio } from "./design-guidance";

export type Character = "modern" | "friendly" | "classic";
export type Energy = "calm" | "bold";

const NEAR_WHITE = "#f7f7f5";
const WARM_CREAM = "#fff6e9";

export interface VibeRecipe {
  id: string;
  label: string;
  character: Character;
  energy: Energy;
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  background: (brand: string) => BackgroundSettings;
}

const gradient = (from: string, to: string): BackgroundSettings => ({
  backgroundMode: "gradient",
  backgroundColor: from,
  gradientPresetId: null,
  gradientFrom: from,
  gradientTo: to,
});

const solid = (color: string): BackgroundSettings => ({
  backgroundMode: "solid",
  backgroundColor: color,
  gradientPresetId: null,
});

export const VIBES: VibeRecipe[] = [
  {
    id: "minimal", label: "Minimal", character: "modern", energy: "calm",
    fontFamily: "Inter", headlineFontSize: 60, subheadlineFontSize: 36,
    background: (brand) => solid(mix(brand, NEAR_WHITE, 0.86)),
  },
  {
    id: "bold", label: "Bold", character: "modern", energy: "bold",
    fontFamily: "Poppins", headlineFontSize: 72, subheadlineFontSize: 42,
    background: (brand) => gradient(brand, adjustLightness(brand, -22)),
  },
  {
    id: "warm", label: "Warm", character: "friendly", energy: "calm",
    fontFamily: "Nunito", headlineFontSize: 64, subheadlineFontSize: 40,
    background: (brand) => solid(mix(brand, WARM_CREAM, 0.8)),
  },
  {
    id: "playful", label: "Playful", character: "friendly", energy: "bold",
    fontFamily: "Quicksand", headlineFontSize: 76, subheadlineFontSize: 44,
    background: (brand) => gradient(brand, rotateHue(brand, 32)),
  },
  {
    id: "elegant", label: "Elegant", character: "classic", energy: "calm",
    fontFamily: "Playfair Display", headlineFontSize: 66, subheadlineFontSize: 38,
    background: (brand) => solid(adjustLightness(brand, -35)),
  },
  {
    id: "editorial", label: "Editorial", character: "classic", energy: "bold",
    fontFamily: "Lora", headlineFontSize: 70, subheadlineFontSize: 40,
    background: (brand) => gradient(adjustLightness(brand, -30), brand),
  },
];

export const vibeForAxes = (character: Character, energy: Energy): VibeRecipe =>
  VIBES.find((v) => v.character === character && v.energy === energy) ?? VIBES[0];

export const getVibe = (id: string): VibeRecipe =>
  VIBES.find((v) => v.id === id) ?? VIBES[0];

export interface BrandLook {
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  textColor: string;
  background: BackgroundSettings;
}

const stopsOf = (bg: BackgroundSettings): string[] => {
  const stops = resolveGradientStops(bg);
  return stops ? [stops.from, stops.to] : [bg.backgroundColor];
};

/** Pick the readable candidate with the best worst-case contrast across stops. */
const pickTextColor = (bg: BackgroundSettings): string => {
  const stops = stopsOf(bg);
  const mid = stops.length === 2 ? mix(stops[0], stops[1], 0.5) : stops[0];
  const candidates = readableTextOptions(mid);
  return candidates
    .map((c) => ({
      c,
      worst: Math.min(...stops.map((s) => contrastRatio(c, s))),
    }))
    .sort((a, b) => b.worst - a.worst)[0].c;
};

export const generateBrandLook = (
  brandColor: string,
  vibeId: string,
): BrandLook => {
  const vibe = getVibe(vibeId);
  const background = vibe.background(brandColor);
  return {
    fontFamily: vibe.fontFamily,
    headlineFontSize: vibe.headlineFontSize,
    subheadlineFontSize: vibe.subheadlineFontSize,
    textColor: pickTextColor(background),
    background,
  };
};

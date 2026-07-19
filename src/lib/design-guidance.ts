/**
 * Design guidance engine — the pure "design brain" behind AppShots' readability
 * help. No UI, no state: just WCAG contrast math and readable-color suggestions
 * that the editor surfaces (chips, tile dots, the design-check panel) build on.
 *
 * Phase 1 encodes contrast only (WCAG AA, size-aware). Harmony/clash detection
 * is a later layer on the same primitives. See the design spec at
 * docs/superpowers/specs/2026-07-19-design-guidance-and-brand-guide-design.md.
 */

import { gradientPresets } from "../constants";
import type { Screenshot } from "../types";

export type WcagLevel = "AAA" | "AA" | "fail";

export interface ContrastIssue {
  screenshotId: string;
  element: "headline" | "subheadline";
  ratio: number;
  /** Only "fail" is produced today, but the shape mirrors classifyContrast. */
  level: WcagLevel;
  suggestedTextColor: string;
}

/** Parse "#rrggbb", "rrggbb", "#rgb", or "rgb" into 0-255 channels. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  let value = hex.trim().replace(/^#/, "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(value, 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

function toHex(r: number, g: number, b: number): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** WCAG relative luminance of an sRGB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colors, from 1:1 to 21:1. Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG "large text": ≥ 24px, or ≥ 18.66px when bold. Most screenshot
 * headlines qualify, so the more lenient 3:1 threshold usually applies.
 */
export function isLargeText(fontSizePx: number, bold = false): boolean {
  return fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
}

/** Classify a contrast ratio against size-aware WCAG AA/AAA thresholds. */
export function classifyContrast(ratio: number, largeText: boolean): WcagLevel {
  const [aaa, aa] = largeText ? [4.5, 3] : [7, 4.5];
  if (ratio >= aaa) return "AAA";
  if (ratio >= aa) return "AA";
  return "fail";
}

// Subtle neutral tints (per DESIGN.md: never pure #000/#fff). Kept low-chroma
// so the text still reads as near-black / near-white, just not dead flat.
const NEAR_BLACK_LIGHTNESS = 0.08;
const NEAR_WHITE_LIGHTNESS = 0.96;
const NEUTRAL_SATURATION = 0.08;

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hueToRgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return {
    r: hueToRgb(p, q, hk + 1 / 3) * 255,
    g: hueToRgb(p, q, hk) * 255,
    b: hueToRgb(p, q, hk - 1 / 3) * 255,
  };
}

/** Hue (0-360) of a hex color; 0 for pure grays. */
function hueOf(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function tintedNeutral(hue: number, lightness: number): string {
  const { r, g, b } = hslToRgb(hue, NEUTRAL_SATURATION, lightness);
  return toHex(r, g, b);
}

/**
 * The two readable text choices for a background: a near-black and a near-white,
 * each faintly tinted toward the background's own hue so the pick feels
 * coordinated rather than a flat black/white slap. Ordered best-contrast-first.
 */
export function readableTextOptions(background: string): string[] {
  const hue = hueOf(background);
  const nearBlack = tintedNeutral(hue, NEAR_BLACK_LIGHTNESS);
  const nearWhite = tintedNeutral(hue, NEAR_WHITE_LIGHTNESS);
  return [nearBlack, nearWhite].sort(
    (a, b) => contrastRatio(b, background) - contrastRatio(a, background),
  );
}

/** The single best readable text color for a background (higher contrast wins). */
export function bestReadableText(background: string): string {
  return readableTextOptions(background)[0];
}

/** Resolve the color stops a background presents behind text. */
function backgroundStops(screenshot: Screenshot): string[] {
  if (screenshot.backgroundMode === "gradient") {
    const preset = gradientPresets.find(
      (p) => p.id === screenshot.gradientPresetId,
    );
    if (preset) return [preset.from, preset.to];
  }
  return [screenshot.backgroundColor];
}

/**
 * Worst-case (minimum) contrast between text and the screenshot's background.
 * Gradients are evaluated across both stops; solids use the single color.
 */
export function backgroundContrast(
  textColor: string,
  screenshot: Screenshot,
): number {
  return Math.min(
    ...backgroundStops(screenshot).map((stop) =>
      contrastRatio(textColor, stop),
    ),
  );
}

const ELEMENTS = [
  { element: "headline", sizeKey: "headlineFontSize", textKey: "headline" },
  {
    element: "subheadline",
    sizeKey: "subheadlineFontSize",
    textKey: "subheadline",
  },
] as const;

/** Elements that actually carry visible (non-whitespace) text. */
function visibleElements(screenshot: Screenshot) {
  return ELEMENTS.filter(({ textKey }) => screenshot[textKey].trim().length > 0);
}

/** Severity order, worst first, for picking a screenshot's overall level. */
const LEVEL_SEVERITY: Record<WcagLevel, number> = { fail: 0, AA: 1, AAA: 2 };

export interface ContrastAssessment {
  /** Worst-case contrast ratio between the text color and the background. */
  ratio: number;
  /** Worst level across the screenshot's headline and subheadline. */
  level: WcagLevel;
  /** Convenience: the level is not "fail". */
  passes: boolean;
  /** A readable text color derived from the background, for one-click Fix. */
  suggestedTextColor: string;
}

/**
 * Assess how a candidate `textColor` would read on a screenshot's background,
 * for live indicators. Unlike {@link evaluateScreenshotContrast}, this takes an
 * arbitrary color (e.g. the global default currently shown in a control) rather
 * than the screenshot's stored one. Returns null when the background has no
 * measurable base color (image mode).
 */
export function assessScreenshotContrast(
  textColor: string,
  screenshot: Screenshot,
): ContrastAssessment | null {
  if (screenshot.backgroundMode === "image") return null;

  const ratio = backgroundContrast(textColor, screenshot);
  // Judge only the elements that carry text. With none yet (empty screenshot),
  // fall back to every configured size so the chip still guides color choice.
  const visible = visibleElements(screenshot);
  const judged = visible.length > 0 ? visible : ELEMENTS;
  const level = judged
    .map(({ sizeKey }) =>
      classifyContrast(ratio, isLargeText(screenshot[sizeKey])),
    )
    .reduce((worst, current) =>
      LEVEL_SEVERITY[current] < LEVEL_SEVERITY[worst] ? current : worst,
    );

  return {
    ratio,
    level,
    passes: level !== "fail",
    suggestedTextColor: bestReadableText(backgroundStops(screenshot)[0]),
  };
}

/**
 * Contrast issues for one screenshot's base text. Only failing elements are
 * returned. Image-mode backgrounds have no measurable base color and are
 * skipped (per spec — overlay/image contrast is out of Phase 1 scope).
 */
export function evaluateScreenshotContrast(
  screenshot: Screenshot,
): ContrastIssue[] {
  if (screenshot.backgroundMode === "image") return [];

  const ratio = backgroundContrast(screenshot.textColor, screenshot);
  const suggestedTextColor = bestReadableText(
    backgroundStops(screenshot)[0],
  );

  const issues: ContrastIssue[] = [];
  for (const { element, sizeKey } of visibleElements(screenshot)) {
    const level = classifyContrast(ratio, isLargeText(screenshot[sizeKey]));
    if (level === "fail") {
      issues.push({
        screenshotId: screenshot.id,
        element,
        ratio,
        level,
        suggestedTextColor,
      });
    }
  }
  return issues;
}

/** Every contrast issue across a project's screenshots, in screenshot order. */
export function evaluateProjectContrast(
  screenshots: Screenshot[],
): ContrastIssue[] {
  return screenshots.flatMap(evaluateScreenshotContrast);
}

/**
 * Background settings — global defaults with a per-screenshot override, mirroring
 * text-settings.ts. A background can be a solid color, a named-preset gradient, or
 * a custom gradient (brand-derived) carried as explicit from/to stops. The
 * concrete values live on each screenshot so the preview and export pipelines read
 * them directly; `backgroundOverride` marks a screenshot that has pinned its own
 * background rather than inheriting the project default.
 */

import { gradientPresets } from "../constants";

export interface BackgroundSettings {
  backgroundMode: "solid" | "gradient" | "image";
  backgroundColor: string;
  gradientPresetId: string | null;
  /** Custom gradient start (used before falling back to a named preset). */
  gradientFrom?: string;
  /** Custom gradient end. */
  gradientTo?: string;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  backgroundMode: "solid",
  backgroundColor: "#8b5cf6",
  gradientPresetId: null,
};

type GradientResolvable = Pick<
  BackgroundSettings,
  "backgroundMode" | "gradientPresetId" | "gradientFrom" | "gradientTo"
>;

/**
 * The two color stops a background presents behind text, or null for
 * solid/image. Custom stops win; otherwise fall back to the named preset (and,
 * as a last resort, the first preset — matching the render pipelines' behavior).
 */
export const resolveGradientStops = (
  bg: GradientResolvable,
): { from: string; to: string } | null => {
  if (bg.backgroundMode !== "gradient") return null;
  if (bg.gradientFrom && bg.gradientTo) {
    return { from: bg.gradientFrom, to: bg.gradientTo };
  }
  const preset =
    gradientPresets.find((p) => p.id === bg.gradientPresetId) ??
    gradientPresets[0];
  return { from: preset.from, to: preset.to };
};

/** Extracts only the background fields from a larger object. */
export const pickBackgroundSettings = (
  source: BackgroundSettings,
): BackgroundSettings => ({
  backgroundMode: source.backgroundMode,
  backgroundColor: source.backgroundColor,
  gradientPresetId: source.gradientPresetId,
  gradientFrom: source.gradientFrom,
  gradientTo: source.gradientTo,
});

/** Anything carrying background fields plus the optional override flag. */
export type BackgroundOverrideCarrier = BackgroundSettings & {
  backgroundOverride?: boolean;
};

/** Propagate a changed default to every non-overriding screenshot. */
export const applyBackgroundDefaultToScreenshots = <
  T extends BackgroundOverrideCarrier,
>(
  screenshots: T[],
  settings: BackgroundSettings,
): T[] =>
  screenshots.map((s) =>
    s.backgroundOverride ? s : { ...s, ...pickBackgroundSettings(settings) },
  );

/** Patch a screenshot's background and record it as an override. */
export const overrideScreenshotBackground = <
  T extends BackgroundOverrideCarrier,
>(
  item: T,
  patch: Partial<BackgroundSettings>,
): T => ({ ...item, ...patch, backgroundOverride: true });

/** Restore a screenshot to the default background and clear the override. */
export const resetScreenshotBackground = <T extends BackgroundOverrideCarrier>(
  item: T,
  defaults: BackgroundSettings,
): T => ({
  ...item,
  ...pickBackgroundSettings(defaults),
  backgroundOverride: false,
});

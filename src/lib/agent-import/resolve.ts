/**
 * Resolvers turn loosely-specified manifest values into concrete editor values.
 * Unknown ids never fail an import: they fall back to a sensible neighbor and
 * return a warning naming what was used.
 */

import { devices, exportSizes, gradientPresets } from "../../constants";
import type { DeviceSpec, ExportSize, ShadowConfig } from "../../types";
import {
  resolveGradientStops,
  type BackgroundSettings,
} from "../background-settings";
import { adjustLightness } from "../color-utils";
import { contrastRatio } from "../design-guidance";
import { isAndroidDevice, isAndroidTablet } from "../device-platform";
import { googleFonts } from "../google-fonts";
import type { ImportIssue } from "./issues";
import type { ManifestBackground, ManifestShadow } from "./schema";

export interface Resolved<T> {
  value: T;
  warning: ImportIssue | null;
}

export const normalizeHex = (hex: string): string => {
  const digits = hex.replace("#", "").toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  return `#${full}`;
};

export const toBackgroundSettings = (
  bg: ManifestBackground,
): BackgroundSettings => {
  switch (bg.type) {
    case "solid":
      return {
        backgroundMode: "solid",
        backgroundColor: normalizeHex(bg.color),
        gradientPresetId: null,
      };
    case "gradient": {
      const from = normalizeHex(bg.from);
      return {
        backgroundMode: "gradient",
        backgroundColor: from,
        gradientPresetId: null,
        gradientFrom: from,
        gradientTo: normalizeHex(bg.to),
      };
    }
    case "preset": {
      const preset =
        gradientPresets.find((p) => p.id === bg.id) ?? gradientPresets[0];
      return {
        backgroundMode: "gradient",
        backgroundColor: normalizeHex(preset.from),
        gradientPresetId: preset.id,
      };
    }
  }
};

export const backgroundStopsOf = (bg: BackgroundSettings): string[] => {
  const stops = resolveGradientStops(bg);
  return stops ? [stops.from, stops.to] : [bg.backgroundColor];
};

export type DeviceFamily =
  | "apple-phone"
  | "apple-tablet"
  | "android-phone"
  | "android-tablet";

export const deviceFamily = (deviceId: string): DeviceFamily => {
  if (isAndroidTablet(deviceId)) return "android-tablet";
  if (isAndroidDevice(deviceId)) return "android-phone";
  if (deviceId.startsWith("ipad")) return "apple-tablet";
  return "apple-phone";
};

export const exportSizeFamily = (exportSizeId: string): DeviceFamily | null => {
  if (exportSizeId === "play-feature-graphic") return null;
  if (exportSizeId.startsWith("play-tablet")) return "android-tablet";
  if (exportSizeId.startsWith("play-")) return "android-phone";
  if (exportSizeId.startsWith("ipad")) return "apple-tablet";
  return "apple-phone";
};

const DEFAULT_EXPORT_SIZE_BY_FAMILY: Record<DeviceFamily, string> = {
  "apple-phone": "6.9",
  "apple-tablet": "ipad-13",
  "android-phone": "play-phone-20-9",
  "android-tablet": "play-tablet-10",
};

export const resolveDevice = (
  requestedId: string | undefined,
  path: string,
): Resolved<DeviceSpec> => {
  if (requestedId === undefined) return { value: devices[0], warning: null };
  const exact = devices.find((d) => d.id === requestedId);
  if (exact) return { value: exact, warning: null };
  const family = deviceFamily(requestedId);
  const fallback = devices.find((d) => deviceFamily(d.id) === family) ?? devices[0];
  return {
    value: fallback,
    warning: {
      path,
      message: `unknown device "${requestedId}"; using "${fallback.id}"`,
    },
  };
};

export const resolveDeviceColor = (
  spec: DeviceSpec,
  requested: string | undefined,
  path: string,
): Resolved<string> => {
  const first = spec.colors[0].id;
  if (requested === undefined) return { value: first, warning: null };
  if (spec.colors.some((c) => c.id === requested)) {
    return { value: requested, warning: null };
  }
  return {
    value: first,
    warning: {
      path,
      message: `"${spec.id}" has no color "${requested}"; using "${first}"`,
    },
  };
};

export const resolveFont = (requested: string, path: string): Resolved<string> => {
  const match = googleFonts.find(
    (f) => f.family.toLowerCase() === requested.trim().toLowerCase(),
  );
  if (match) return { value: match.family, warning: null };
  return {
    value: "Inter",
    warning: { path, message: `font "${requested}" is not available; using "Inter"` },
  };
};

export const resolveExportSize = (
  requested: string | undefined,
  deviceId: string,
  path: string,
): Resolved<ExportSize> => {
  const byId = (id: string) => exportSizes.find((s) => s.id === id);
  const fallback = byId(DEFAULT_EXPORT_SIZE_BY_FAMILY[deviceFamily(deviceId)]) ?? exportSizes[0];
  if (requested === undefined) return { value: fallback, warning: null };
  const exact = byId(requested);
  if (exact) return { value: exact, warning: null };
  return {
    value: fallback,
    warning: {
      path,
      message: `unknown export size "${requested}"; using "${fallback.id}"`,
    },
  };
};

export const checkPlatformMismatch = (
  deviceId: string,
  exportSizeId: string,
): ImportIssue | null => {
  const expected = exportSizeFamily(exportSizeId);
  const actual = deviceFamily(deviceId);
  if (expected === null || expected === actual) return null;
  return {
    path: "exportSize",
    message: `export size "${exportSizeId}" is for ${expected} screenshots, but the device "${deviceId}" is ${actual}`,
  };
};

/** Matches the shadow `addOverlayImage` gives editor-added overlays. */
export const DEFAULT_OVERLAY_SHADOW: ShadowConfig = {
  enabled: false,
  color: "#000000",
  blur: 20,
  offsetX: 0,
  offsetY: 10,
};

export const resolveShadow = (
  shadow: ManifestShadow | undefined,
  base: ShadowConfig,
): ShadowConfig => {
  if (shadow === undefined) return { ...base };
  if (typeof shadow === "boolean") return { ...base, enabled: shadow };
  return {
    ...base,
    enabled: true,
    ...shadow,
    color: shadow.color ? normalizeHex(shadow.color) : base.color,
  };
};

const HIGHLIGHT_FALLBACK = "#facc15";

/**
 * A `<mark>` background that the text stays readable on (≥ 3:1, large text) and
 * that is distinguishable from the canvas background (≥ 1.5:1 against every stop).
 * Falls back to the most readable candidate when none satisfies both.
 */
export const deriveHighlightColor = (
  primary: string | undefined,
  textColor: string,
  backgroundStops: string[],
): string => {
  const base = primary ?? HIGHLIGHT_FALLBACK;
  const candidates = [
    base,
    adjustLightness(base, 25),
    adjustLightness(base, -25),
    adjustLightness(base, 45),
    adjustLightness(base, -45),
    HIGHLIGHT_FALLBACK,
  ].map((color) => ({
    color,
    text: contrastRatio(textColor, color),
    canvas: Math.min(...backgroundStops.map((stop) => contrastRatio(color, stop))),
  }));

  const good = candidates.find((c) => c.text >= 3 && c.canvas >= 1.5);
  if (good) return good.color;
  return [...candidates].sort((a, b) => b.text - a.text)[0].color;
};

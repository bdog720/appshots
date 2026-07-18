/**
 * Sidebar grouping helpers
 *
 * Pure functions that organize the flat `devices` and `exportSizes` constant
 * arrays into collapsible UI groups. Kept separate from rendering so the
 * grouping rules stay unit-testable.
 */

import type { DeviceSpec, ExportSize } from "../types";

export type DeviceGroup = {
  /** Stable group key */
  id: string;
  /** Human-readable heading */
  label: string;
  /** Devices belonging to this group, in their original order */
  devices: DeviceSpec[];
};

export type ExportGroup = {
  /** Stable group key */
  id: string;
  /** Human-readable heading */
  label: string;
  /** Export sizes belonging to this group, in their original order */
  sizes: ExportSize[];
};

/** Ordered platform buckets. Prefix drives membership; first match wins. */
const DEVICE_PLATFORMS: { id: string; label: string; prefix: string }[] = [
  { id: "iphone", label: "iPhone", prefix: "iphone-" },
  { id: "ipad", label: "iPad", prefix: "ipad-" },
  { id: "samsung", label: "Samsung", prefix: "samsung-" },
  { id: "pixel", label: "Pixel", prefix: "pixel-" },
];

const OTHER_DEVICE_GROUP = { id: "other", label: "Other" };

/**
 * Groups devices into platform buckets (iPhone, iPad, Samsung, Pixel) by id
 * prefix, preserving input order within each group and omitting empty groups.
 * Anything unmatched falls into a trailing "Other" group.
 */
export const groupDevicesByPlatform = (
  devices: DeviceSpec[],
): DeviceGroup[] => {
  const groups: DeviceGroup[] = DEVICE_PLATFORMS.map((p) => ({
    id: p.id,
    label: p.label,
    devices: [],
  }));
  const other: DeviceGroup = { ...OTHER_DEVICE_GROUP, devices: [] };

  for (const device of devices) {
    const platform = DEVICE_PLATFORMS.find((p) =>
      device.id.startsWith(p.prefix),
    );
    const target = platform
      ? groups.find((g) => g.id === platform.id)!
      : other;
    target.devices.push(device);
  }

  return [...groups, other].filter((g) => g.devices.length > 0);
};

/**
 * Groups export sizes by store. Ids prefixed `play-` are Play Store; everything
 * else is App Store. App Store is listed first, order preserved within groups.
 */
export const groupExportSizesByStore = (
  sizes: ExportSize[],
): ExportGroup[] => {
  const appStore: ExportGroup = {
    id: "app-store",
    label: "App Store",
    sizes: [],
  };
  const playStore: ExportGroup = {
    id: "play-store",
    label: "Play Store",
    sizes: [],
  };

  for (const size of sizes) {
    (size.id.startsWith("play-") ? playStore : appStore).sizes.push(size);
  }

  return [appStore, playStore].filter((g) => g.sizes.length > 0);
};

/**
 * True when an export size is wider than tall — a landscape "banner" format
 * (e.g. the Play Store feature graphic) rather than a normal portrait
 * screenshot. Used to flag it in the UI.
 */
export const isLandscapeExportSize = (size: ExportSize): boolean =>
  size.width > size.height;

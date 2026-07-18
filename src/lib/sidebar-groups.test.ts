import { describe, it, expect } from "vitest";
import {
  groupDevicesByPlatform,
  groupExportSizesByStore,
  isLandscapeExportSize,
} from "./sidebar-groups";
import { devices, exportSizes } from "../constants";
import type { DeviceSpec, ExportSize } from "../types";

const makeDevice = (id: string): DeviceSpec =>
  ({ id, label: id }) as DeviceSpec;

const makeSize = (id: string, width: number, height: number): ExportSize => ({
  id,
  label: id,
  width,
  height,
});

describe("groupDevicesByPlatform", () => {
  it("groups devices by id prefix in iPhone, iPad, Samsung, Pixel order", () => {
    const groups = groupDevicesByPlatform([
      makeDevice("pixel-9"),
      makeDevice("iphone-16"),
      makeDevice("samsung-galaxy-s24-ultra"),
      makeDevice("ipad-pro-11-m4"),
    ]);

    expect(groups.map((g) => g.id)).toEqual([
      "iphone",
      "ipad",
      "samsung",
      "pixel",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "iPhone",
      "iPad",
      "Samsung",
      "Pixel",
    ]);
  });

  it("preserves the original order of devices within a group", () => {
    const groups = groupDevicesByPlatform([
      makeDevice("iphone-17-pro-max"),
      makeDevice("iphone-16"),
      makeDevice("iphone-14"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].devices.map((d) => d.id)).toEqual([
      "iphone-17-pro-max",
      "iphone-16",
      "iphone-14",
    ]);
  });

  it("omits groups that have no devices", () => {
    const groups = groupDevicesByPlatform([makeDevice("iphone-16")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("iphone");
  });

  it("places every real device into a known platform group", () => {
    const groups = groupDevicesByPlatform(devices);
    const grouped = groups.flatMap((g) => g.devices);
    expect(grouped).toHaveLength(devices.length);
    expect(groups.every((g) => g.id !== "other")).toBe(true);
  });
});

describe("groupExportSizesByStore", () => {
  it("splits play-store sizes from app-store sizes, App Store first", () => {
    const groups = groupExportSizesByStore([
      makeSize("play-phone-16-9", 1080, 1920),
      makeSize("6.9", 1320, 2868),
    ]);

    expect(groups.map((g) => g.id)).toEqual(["app-store", "play-store"]);
    expect(groups[0].sizes.map((s) => s.id)).toEqual(["6.9"]);
    expect(groups[1].sizes.map((s) => s.id)).toEqual(["play-phone-16-9"]);
  });

  it("assigns every real export size to a store group", () => {
    const groups = groupExportSizesByStore(exportSizes);
    const grouped = groups.flatMap((g) => g.sizes);
    expect(grouped).toHaveLength(exportSizes.length);
  });
});

describe("isLandscapeExportSize", () => {
  it("is true for a wider-than-tall size (Play feature graphic)", () => {
    expect(isLandscapeExportSize(makeSize("play-feature-graphic", 1024, 500))).toBe(
      true,
    );
  });

  it("is false for a portrait size", () => {
    expect(isLandscapeExportSize(makeSize("6.9", 1320, 2868))).toBe(false);
  });
});

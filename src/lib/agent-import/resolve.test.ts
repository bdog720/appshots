import { describe, expect, it } from "vitest";
import { devices } from "../../constants";
import { pickReadableTextColor } from "../brand-guide";
import { contrastRatio } from "../design-guidance";
import { DEFAULT_DEVICE_SHADOW } from "../device-instances";
import {
  DEFAULT_OVERLAY_SHADOW,
  backgroundStopsOf,
  checkPlatformMismatch,
  deriveHighlightColor,
  deviceFamily,
  exportSizeFamily,
  normalizeHex,
  resolveDevice,
  resolveDeviceColor,
  resolveExportSize,
  resolveFont,
  resolveShadow,
  toBackgroundSettings,
} from "./resolve";

describe("normalizeHex", () => {
  it("lowercases and expands short hex", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#5B5BD6")).toBe("#5b5bd6");
  });
});

describe("backgrounds", () => {
  it("converts solid, gradient and preset backgrounds", () => {
    expect(toBackgroundSettings({ type: "solid", color: "#ABC" })).toEqual({
      backgroundMode: "solid",
      backgroundColor: "#aabbcc",
      gradientPresetId: null,
    });
    expect(toBackgroundSettings({ type: "gradient", from: "#111111", to: "#222222" })).toEqual({
      backgroundMode: "gradient",
      backgroundColor: "#111111",
      gradientPresetId: null,
      gradientFrom: "#111111",
      gradientTo: "#222222",
    });
    expect(toBackgroundSettings({ type: "preset", id: "ocean" })).toEqual({
      backgroundMode: "gradient",
      backgroundColor: "#2b5876",
      gradientPresetId: "ocean",
    });
  });

  it("lists the stops text sits on", () => {
    expect(backgroundStopsOf(toBackgroundSettings({ type: "solid", color: "#123456" }))).toEqual(["#123456"]);
    expect(
      backgroundStopsOf(toBackgroundSettings({ type: "gradient", from: "#111111", to: "#222222" })),
    ).toEqual(["#111111", "#222222"]);
  });

  it("exposes the brand guide's readable text picker", () => {
    const text = pickReadableTextColor(toBackgroundSettings({ type: "solid", color: "#ffffff" }));
    expect(contrastRatio(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("families", () => {
  it("classifies devices and export sizes", () => {
    expect(deviceFamily("iphone-17-pro")).toBe("apple-phone");
    expect(deviceFamily("ipad-pro-13-m4")).toBe("apple-tablet");
    expect(deviceFamily("pixel-10")).toBe("android-phone");
    expect(deviceFamily("samsung-galaxy-tab-s9")).toBe("android-tablet");
    expect(exportSizeFamily("6.9")).toBe("apple-phone");
    expect(exportSizeFamily("ipad-13")).toBe("apple-tablet");
    expect(exportSizeFamily("play-phone-20-9")).toBe("android-phone");
    expect(exportSizeFamily("play-tablet-10")).toBe("android-tablet");
    expect(exportSizeFamily("play-feature-graphic")).toBeNull();
  });

  it("flags a device that doesn't match the export size", () => {
    expect(checkPlatformMismatch("iphone-17-pro", "ipad-13")?.path).toBe("exportSize");
    expect(checkPlatformMismatch("iphone-17-pro", "6.9")).toBeNull();
    expect(checkPlatformMismatch("pixel-10", "play-phone-20-9")).toBeNull();
    expect(checkPlatformMismatch("pixel-10", "play-feature-graphic")).toBeNull();
  });
});

describe("resolveDevice", () => {
  it("uses the first device when none is requested", () => {
    expect(resolveDevice(undefined, "device.id")).toEqual({ value: devices[0], warning: null });
  });

  it("returns an exact match without warning", () => {
    const result = resolveDevice("pixel-10", "device.id");
    expect(result.value.id).toBe("pixel-10");
    expect(result.warning).toBeNull();
  });

  it("falls back within the same family and says so", () => {
    const firstAndroidPhone = devices.find((d) => deviceFamily(d.id) === "android-phone");
    const result = resolveDevice("pixel-99", "device.id");
    expect(result.value.id).toBe(firstAndroidPhone?.id);
    expect(result.warning).toEqual({
      path: "device.id",
      message: `unknown device "pixel-99"; using "${firstAndroidPhone?.id}"`,
    });
    expect(resolveDevice("ipad-mini-9", "device.id").value.id).toBe(
      devices.find((d) => deviceFamily(d.id) === "apple-tablet")?.id,
    );
  });

  it("falls back to the device's first color", () => {
    const spec = resolveDevice("iphone-17-pro", "device.id").value;
    expect(resolveDeviceColor(spec, "cosmic-orange", "device.color")).toEqual({
      value: "cosmic-orange",
      warning: null,
    });
    expect(resolveDeviceColor(spec, undefined, "device.color").value).toBe(spec.colors[0].id);
    const unknown = resolveDeviceColor(spec, "neon", "device.color");
    expect(unknown.value).toBe(spec.colors[0].id);
    expect(unknown.warning?.path).toBe("device.color");
  });
});

describe("resolveFont and resolveExportSize", () => {
  it("matches fonts exactly or case-insensitively, else Inter", () => {
    expect(resolveFont("Poppins", "brand.font")).toEqual({ value: "Poppins", warning: null });
    expect(resolveFont("playfair display", "brand.font")).toEqual({
      value: "Playfair Display",
      warning: null,
    });
    const unknown = resolveFont("Comic Sans", "brand.font");
    expect(unknown.value).toBe("Inter");
    expect(unknown.warning?.message).toMatch(/Comic Sans/);
  });

  it("defaults the export size to the device's family", () => {
    expect(resolveExportSize(undefined, "iphone-17-pro", "exportSize").value.id).toBe("6.9");
    expect(resolveExportSize(undefined, "ipad-pro-13-m4", "exportSize").value.id).toBe("ipad-13");
    expect(resolveExportSize(undefined, "pixel-10", "exportSize").value.id).toBe("play-phone-20-9");
    expect(resolveExportSize(undefined, "samsung-galaxy-tab-s9", "exportSize").value.id).toBe("play-tablet-10");
  });

  it("warns on unknown export sizes", () => {
    const result = resolveExportSize("7.7", "iphone-17-pro", "exportSize");
    expect(result.value.id).toBe("6.9");
    expect(result.warning?.path).toBe("exportSize");
  });
});

describe("resolveShadow", () => {
  it("handles undefined, booleans and patches", () => {
    expect(resolveShadow(undefined, DEFAULT_DEVICE_SHADOW)).toEqual(DEFAULT_DEVICE_SHADOW);
    expect(resolveShadow(false, DEFAULT_DEVICE_SHADOW).enabled).toBe(false);
    expect(resolveShadow(true, DEFAULT_OVERLAY_SHADOW)).toEqual({ ...DEFAULT_OVERLAY_SHADOW, enabled: true });
    expect(resolveShadow({ blur: 30, color: "#FFF" }, DEFAULT_OVERLAY_SHADOW)).toEqual({
      ...DEFAULT_OVERLAY_SHADOW,
      enabled: true,
      blur: 30,
      color: "#ffffff",
    });
  });
});

describe("deriveHighlightColor", () => {
  it("stays readable behind white text on a brand gradient", () => {
    const color = deriveHighlightColor("#5b5bd6", "#ffffff", ["#5b5bd6", "#2a2a9e"]);
    expect(contrastRatio("#ffffff", color)).toBeGreaterThanOrEqual(3);
  });

  it("works without a brand color", () => {
    const color = deriveHighlightColor(undefined, "#111111", ["#ffffff"]);
    expect(contrastRatio("#111111", color)).toBeGreaterThanOrEqual(3);
  });
});

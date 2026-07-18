import { describe, expect, it } from "vitest";
import { devices, exportSizes } from "./constants";
import { isAndroidDevice, isAndroidTablet } from "./lib/device-platform";

describe("device catalog", () => {
  it("includes the modern Apple and Android devices", () => {
    const ids = devices.map((d) => d.id);
    // iPhones
    expect(ids).toContain("iphone-16-pro-max");
    expect(ids).toContain("iphone-16-pro");
    expect(ids).toContain("iphone-16");
    // iPads
    expect(ids).toContain("ipad-pro-13-m4");
    expect(ids).toContain("ipad-pro-11-m4");
    // Pixels
    expect(ids).toContain("pixel-9-pro-xl");
    expect(ids).toContain("pixel-9-pro");
    expect(ids).toContain("pixel-9");
    // Galaxy Tab
    expect(ids).toContain("samsung-galaxy-tab-s10-ultra");
  });

  it("has unique device ids", () => {
    const ids = devices.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every device a positive aspect ratio and at least one color", () => {
    for (const device of devices) {
      expect(device.width).toBeGreaterThan(0);
      expect(device.height).toBeGreaterThan(0);
      expect(device.colors.length).toBeGreaterThan(0);
    }
  });

  it("uses unique color ids and a 5-stop gradient (when present) per device", () => {
    for (const device of devices) {
      const colorIds = device.colors.map((c) => c.id);
      expect(new Set(colorIds).size).toBe(colorIds.length);
      for (const color of device.colors) {
        expect(color.frame).toMatch(/^#/);
        if (color.frameColors) {
          expect(color.frameColors).toHaveLength(5);
        }
      }
    }
  });

  it("classifies Pixel devices as Android phones and Galaxy Tab as an Android tablet", () => {
    expect(isAndroidDevice("pixel-9-pro-xl")).toBe(true);
    expect(isAndroidTablet("pixel-9-pro-xl")).toBe(false);
    expect(isAndroidTablet("samsung-galaxy-tab-s10-ultra")).toBe(true);
  });
});

describe("export sizes", () => {
  it("includes the 6.9-inch iPhone and 13-inch iPad presets", () => {
    const ids = exportSizes.map((s) => s.id);
    expect(ids).toContain("6.9");
    expect(ids).toContain("ipad-13");
  });
});

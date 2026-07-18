import { describe, expect, it } from "vitest";
import { exportSizes } from "./constants";

describe("Play Store export sizes", () => {
  const byId = (id: string) => exportSizes.find((s) => s.id === id);

  it("includes phone, tablet, and feature-graphic Play Store presets", () => {
    const ids = exportSizes.map((s) => s.id);
    expect(ids).toContain("play-phone-16-9");
    expect(ids).toContain("play-phone-20-9");
    expect(ids).toContain("play-tablet-7");
    expect(ids).toContain("play-tablet-10");
    expect(ids).toContain("play-feature-graphic");
  });

  it("uses Google Play's exact dimensions", () => {
    expect(byId("play-phone-16-9")).toMatchObject({ width: 1080, height: 1920 });
    expect(byId("play-phone-20-9")).toMatchObject({ width: 1080, height: 2400 });
    expect(byId("play-tablet-7")).toMatchObject({ width: 1200, height: 1920 });
    expect(byId("play-tablet-10")).toMatchObject({ width: 1600, height: 2560 });
    // Feature graphic is a fixed, required 1024x500 landscape banner.
    expect(byId("play-feature-graphic")).toMatchObject({ width: 1024, height: 500 });
  });

  it("keeps every export size within Google Play's 320-3840px bounds", () => {
    for (const size of exportSizes) {
      expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(320);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(3840);
    }
  });

  it("has unique export size ids", () => {
    const ids = exportSizes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

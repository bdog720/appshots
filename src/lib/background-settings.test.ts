import { describe, it, expect } from "vitest";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  resolveGradientStops,
  applyBackgroundDefaultToScreenshots,
  overrideScreenshotBackground,
  resetScreenshotBackground,
  type BackgroundSettings,
} from "./background-settings";

const solid = (color: string): BackgroundSettings => ({
  backgroundMode: "solid",
  backgroundColor: color,
  gradientPresetId: null,
});

describe("resolveGradientStops", () => {
  it("returns null for solid and image backgrounds", () => {
    expect(resolveGradientStops(solid("#123456"))).toBeNull();
    expect(
      resolveGradientStops({ ...solid("#000"), backgroundMode: "image" }),
    ).toBeNull();
  });

  it("uses custom stops when both are present", () => {
    expect(
      resolveGradientStops({
        backgroundMode: "gradient",
        gradientPresetId: null,
        gradientFrom: "#111111",
        gradientTo: "#222222",
      }),
    ).toEqual({ from: "#111111", to: "#222222" });
  });

  it("falls back to a named preset when custom stops are absent", () => {
    const stops = resolveGradientStops({
      backgroundMode: "gradient",
      gradientPresetId: "berry",
    });
    expect(stops).toEqual({ from: "#e1eec3", to: "#f05053" });
  });
});

describe("applyBackgroundDefaultToScreenshots", () => {
  const brand: BackgroundSettings = {
    backgroundMode: "gradient",
    backgroundColor: "#8b5cf6",
    gradientPresetId: null,
    gradientFrom: "#8b5cf6",
    gradientTo: "#5a3ba0",
  };

  it("updates inheriting screenshots and skips overridden ones", () => {
    const screens = [
      { id: "a", ...solid("#fff"), backgroundOverride: false },
      { id: "b", ...solid("#000"), backgroundOverride: true },
    ];
    const result = applyBackgroundDefaultToScreenshots(screens, brand);
    expect(result[0].gradientTo).toBe("#5a3ba0");
    expect(result[0].backgroundMode).toBe("gradient");
    expect(result[1].backgroundColor).toBe("#000"); // overridden, untouched
  });

  it("treats a missing override flag as inheriting", () => {
    const screens = [{ id: "a", ...solid("#fff") }];
    const result = applyBackgroundDefaultToScreenshots(screens, brand);
    expect(result[0].backgroundMode).toBe("gradient");
  });
});

describe("override / reset helpers", () => {
  it("override sets the flag and patches fields", () => {
    const s = { id: "a", ...solid("#fff"), backgroundOverride: false };
    const next = overrideScreenshotBackground(s, { backgroundColor: "#abcabc" });
    expect(next.backgroundColor).toBe("#abcabc");
    expect(next.backgroundOverride).toBe(true);
  });

  it("reset restores defaults and clears the flag", () => {
    const s = { id: "a", ...solid("#abcabc"), backgroundOverride: true };
    const next = resetScreenshotBackground(s, DEFAULT_BACKGROUND_SETTINGS);
    expect(next.backgroundColor).toBe(DEFAULT_BACKGROUND_SETTINGS.backgroundColor);
    expect(next.backgroundOverride).toBe(false);
  });
});

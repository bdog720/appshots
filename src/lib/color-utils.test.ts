import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, adjustLightness, rotateHue, mix } from "./color-utils";

describe("color-utils", () => {
  it("mixes two colors linearly", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("round-trips primary red through HSL", () => {
    expect(hslToHex(hexToHsl("#ff0000"))).toBe("#ff0000");
  });

  it("lightens toward white and darkens toward black", () => {
    expect(adjustLightness("#808080", 100)).toBe("#ffffff");
    expect(adjustLightness("#808080", -100)).toBe("#000000");
  });

  it("rotating hue by 360 degrees returns the same color", () => {
    expect(rotateHue("#8b5cf6", 360)).toBe("#8b5cf6");
  });

  it("clamps mix ratio to [0,1]", () => {
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
  });
});

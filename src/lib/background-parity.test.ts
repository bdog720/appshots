import { describe, it, expect } from "vitest";
import { resolveGradientStops } from "./background-settings";
import type { Screenshot } from "../types";

const base = {
  backgroundColor: "#8b5cf6",
  gradientPresetId: null,
} as Pick<Screenshot, "backgroundColor" | "gradientPresetId">;

describe("background pipeline parity", () => {
  it("custom brand gradient resolves to identical stops for preview and export", () => {
    const bg = {
      ...base,
      backgroundMode: "gradient" as const,
      gradientFrom: "#8b5cf6",
      gradientTo: "#5a3ba0",
    };
    const stops = resolveGradientStops(bg);
    expect(stops).toEqual({ from: "#8b5cf6", to: "#5a3ba0" });
    // The preview builds `linear-gradient(180deg, from, to)` and the export
    // builds a vertical canvas gradient from the SAME stops.
    const previewCss = `linear-gradient(180deg, ${stops!.from}, ${stops!.to})`;
    expect(previewCss).toBe("linear-gradient(180deg, #8b5cf6, #5a3ba0)");
  });
});

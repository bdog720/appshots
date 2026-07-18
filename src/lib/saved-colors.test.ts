import { describe, it, expect } from "vitest";
import {
  MAX_SAVED_COLORS,
  addColorToPalette,
  removeColorFromPalette,
} from "./saved-colors";

describe("addColorToPalette", () => {
  it("adds a new color to the front (most recent first)", () => {
    expect(addColorToPalette(["#111111"], "#222222")).toEqual([
      "#222222",
      "#111111",
    ]);
  });

  it("de-duplicates case-insensitively without reordering", () => {
    expect(addColorToPalette(["#ffffff"], "#FFFFFF")).toEqual(["#ffffff"]);
  });

  it("caps the palette at MAX_SAVED_COLORS, dropping the oldest", () => {
    const full = Array.from(
      { length: MAX_SAVED_COLORS },
      (_, i) => `#0000${i.toString(16).padStart(2, "0")}`,
    );
    const result = addColorToPalette(full, "#abcdef");
    expect(result).toHaveLength(MAX_SAVED_COLORS);
    expect(result[0]).toBe("#abcdef");
    expect(result).not.toContain(full[full.length - 1]);
  });
});

describe("removeColorFromPalette", () => {
  it("removes a color case-insensitively", () => {
    expect(removeColorFromPalette(["#ffffff", "#000000"], "#FFFFFF")).toEqual([
      "#000000",
    ]);
  });
});

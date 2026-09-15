import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PRESET_ID,
  LAYOUT_PRESETS,
  LAYOUT_PRESET_IDS,
  getLayoutPreset,
  presetDeviceSettings,
} from "./layout-presets";

// The editor's PositionPresets values before extraction — must not change.
const EDITOR_SETTINGS_BEFORE_REFACTOR: Record<string, object> = {
  centered: { scale: 65, y: 35, rotation: 0, style: "flat" },
  "bleed-bottom": { scale: 70, y: 45, rotation: 0, style: "flat" },
  "bleed-top": { scale: 70, y: 15, rotation: 0, style: "flat" },
  "float-center": { scale: 55, y: 30, rotation: 0, style: "flat" },
  "tilt-left": { scale: 60, y: 35, rotation: -15, style: "flat" },
  "tilt-right": { scale: 60, y: 35, rotation: 15, style: "flat" },
  perspective: { scale: 60, y: 35, rotation: 0, style: "3d", rotateY: -20, rotateX: 5 },
  "float-bottom": { scale: 50, y: 50, rotation: 0, style: "flat" },
};

describe("layout presets", () => {
  it("lists the eight presets in editor order with unique ids", () => {
    expect(LAYOUT_PRESET_IDS).toEqual([
      "centered",
      "bleed-bottom",
      "bleed-top",
      "float-center",
      "tilt-left",
      "tilt-right",
      "perspective",
      "float-bottom",
    ]);
    expect(new Set(LAYOUT_PRESET_IDS).size).toBe(LAYOUT_PRESETS.length);
  });

  it("keeps the editor's device settings identical", () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(presetDeviceSettings(preset)).toEqual(
        EDITOR_SETTINGS_BEFORE_REFACTOR[preset.id],
      );
    }
  });

  it("gives every preset a description and in-bounds text positions", () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(10);
      for (const pos of [preset.text.headline, preset.text.subheadline]) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(100);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(100);
      }
      expect(preset.text.subheadline.y).toBeGreaterThan(preset.text.headline.y);
    }
  });

  it("only perspective carries a style", () => {
    const styled = LAYOUT_PRESETS.filter((p) => p.device.style !== undefined);
    expect(styled.map((p) => p.id)).toEqual(["perspective"]);
  });

  it("puts text below the device for bleed-top", () => {
    expect(getLayoutPreset("bleed-top").text.headline.y).toBeGreaterThan(50);
  });

  it("falls back to the default preset for unknown ids", () => {
    expect(DEFAULT_LAYOUT_PRESET_ID).toBe("bleed-bottom");
    expect(getLayoutPreset("nope").id).toBe("bleed-bottom");
  });
});

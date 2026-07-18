import { describe, expect, it } from "vitest";
import { buildImportedScreenshots } from "./bulk-import";
import { createDeviceInstance } from "./device-instances";
import { DEFAULT_TEXT_SETTINGS } from "./text-settings";
import type { Screenshot } from "../types";

function makeBase(devices = [createDeviceInstance({ id: "base-dev", screenshotSrc: "OLD" })]): Screenshot {
  return {
    id: "base",
    headline: "Base headline",
    subheadline: "Base sub",
    backgroundColor: "#123456",
    backgroundMode: "solid",
    gradientPresetId: null,
    textColor: "#ffffff",
    headlineX: 50,
    headlineY: 10,
    headlineWidth: 80,
    subheadlineX: 50,
    subheadlineY: 18,
    subheadlineWidth: 80,
    fontFamily: "Inter",
    headlineFontSize: 72,
    subheadlineFontSize: 42,
    textOverrides: [],
    overlayImages: [],
    devices,
    activeDeviceId: devices[0].id,
  } as Screenshot;
}

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("buildImportedScreenshots", () => {
  it("creates one screenshot per image, in order, with the image on the primary device", () => {
    const result = buildImportedScreenshots({
      base: makeBase(),
      textDefaults: DEFAULT_TEXT_SETTINGS,
      images: ["IMG_A", "IMG_B", "IMG_C"],
      generateId: counter(),
    });

    expect(result).toHaveLength(3);
    expect(result[0].devices[0].screenshotSrc).toBe("IMG_A");
    expect(result[1].devices[0].screenshotSrc).toBe("IMG_B");
    expect(result[2].devices[0].screenshotSrc).toBe("IMG_C");
  });

  it("inherits background from the base and text from the defaults, with no overlays or overrides", () => {
    const [s] = buildImportedScreenshots({
      base: makeBase(),
      textDefaults: DEFAULT_TEXT_SETTINGS,
      images: ["X"],
      generateId: counter(),
    });

    expect(s.backgroundColor).toBe("#123456");
    expect(s.backgroundMode).toBe("solid");
    expect(s.fontFamily).toBe(DEFAULT_TEXT_SETTINGS.fontFamily);
    expect(s.overlayImages).toEqual([]);
    expect(s.textOverrides).toEqual([]);
  });

  it("gives each screenshot and device a fresh id and points activeDeviceId at the primary device", () => {
    const result = buildImportedScreenshots({
      base: makeBase(),
      textDefaults: DEFAULT_TEXT_SETTINGS,
      images: ["A", "B"],
      generateId: counter(),
    });

    const ids = new Set([
      result[0].id,
      result[1].id,
      result[0].devices[0].id,
      result[1].devices[0].id,
    ]);
    expect(ids.size).toBe(4);
    expect(result[0].activeDeviceId).toBe(result[0].devices[0].id);
  });

  it("clears images on non-primary devices of imported tiles", () => {
    const base = makeBase([
      createDeviceInstance({ id: "d1", screenshotSrc: "OLD1" }),
      createDeviceInstance({ id: "d2", screenshotSrc: "OLD2" }),
    ]);

    const [s] = buildImportedScreenshots({
      base,
      textDefaults: DEFAULT_TEXT_SETTINGS,
      images: ["NEW"],
      generateId: counter(),
    });

    expect(s.devices).toHaveLength(2);
    expect(s.devices[0].screenshotSrc).toBe("NEW");
    expect(s.devices[1].screenshotSrc).toBeNull();
  });
});

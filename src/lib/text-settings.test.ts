import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEXT_SETTINGS,
  TEXT_SETTING_KEYS,
  pickTextSettings,
  isTextOverridden,
  overrideScreenshotText,
  resetScreenshotText,
  applyTextDefaultToScreenshots,
  deriveTextOverrides,
  type TextSettings,
} from "./text-settings";

const carrier = (
  overrides: Partial<TextSettings> = {},
  overridden: (keyof TextSettings)[] = [],
) => ({
  ...DEFAULT_TEXT_SETTINGS,
  ...overrides,
  textOverrides: overridden,
});

describe("pickTextSettings", () => {
  it("extracts just the six text-setting fields", () => {
    const source = {
      ...DEFAULT_TEXT_SETTINGS,
      headlineFontSize: 90,
      fontFamily: "Roboto",
      // extraneous fields should be ignored
      headline: "hi",
      backgroundColor: "#000",
    };
    expect(pickTextSettings(source)).toEqual({
      ...DEFAULT_TEXT_SETTINGS,
      headlineFontSize: 90,
      fontFamily: "Roboto",
    });
    expect(Object.keys(pickTextSettings(source))).toEqual(TEXT_SETTING_KEYS);
  });
});

describe("overrideScreenshotText", () => {
  it("sets the value and records the key as overridden", () => {
    const result = overrideScreenshotText(carrier(), "headlineFontSize", 120);
    expect(result.headlineFontSize).toBe(120);
    expect(result.textOverrides).toEqual(["headlineFontSize"]);
    expect(isTextOverridden(result, "headlineFontSize")).toBe(true);
  });

  it("does not duplicate an already-overridden key", () => {
    const start = carrier({ fontFamily: "Roboto" }, ["fontFamily"]);
    const result = overrideScreenshotText(start, "fontFamily", "Lato");
    expect(result.fontFamily).toBe("Lato");
    expect(result.textOverrides).toEqual(["fontFamily"]);
  });
});

describe("resetScreenshotText", () => {
  it("restores the default value and clears the override flag", () => {
    const defaults: TextSettings = { ...DEFAULT_TEXT_SETTINGS, textColor: "#ff0000" };
    const start = carrier({ textColor: "#00ff00" }, ["textColor", "fontFamily"]);
    const result = resetScreenshotText(start, "textColor", defaults);
    expect(result.textColor).toBe("#ff0000");
    expect(result.textOverrides).toEqual(["fontFamily"]);
  });
});

describe("applyTextDefaultToScreenshots", () => {
  it("updates only screenshots that do not override the key", () => {
    const inheriting = carrier();
    const overriding = carrier({ headlineFontSize: 50 }, ["headlineFontSize"]);
    const [a, b] = applyTextDefaultToScreenshots(
      [inheriting, overriding],
      "headlineFontSize",
      99,
    );
    expect(a.headlineFontSize).toBe(99);
    expect(b.headlineFontSize).toBe(50);
  });
});

describe("deriveTextOverrides", () => {
  it("marks keys whose value differs from the defaults", () => {
    const defaults: TextSettings = {
      ...DEFAULT_TEXT_SETTINGS,
      fontFamily: "Inter",
      textColor: "#ffffff",
    };
    const screenshot = {
      ...DEFAULT_TEXT_SETTINGS,
      fontFamily: "Roboto",
      textColor: "#ffffff",
    };
    expect(deriveTextOverrides(screenshot, defaults)).toEqual(["fontFamily"]);
  });
});

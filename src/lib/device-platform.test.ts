import { describe, expect, it } from "vitest";
import { isAndroidDevice, isAndroidTablet } from "./device-platform";

describe("isAndroidDevice", () => {
  it("treats Samsung devices as Android", () => {
    expect(isAndroidDevice("samsung-galaxy-s24-ultra")).toBe(true);
    expect(isAndroidDevice("samsung-galaxy-tab-s10-ultra")).toBe(true);
  });

  it("treats Pixel devices as Android", () => {
    expect(isAndroidDevice("pixel-9-pro-xl")).toBe(true);
    expect(isAndroidDevice("pixel-9")).toBe(true);
  });

  it("does not treat Apple devices as Android", () => {
    expect(isAndroidDevice("iphone-16-pro-max")).toBe(false);
    expect(isAndroidDevice("ipad-pro-13-m4")).toBe(false);
  });
});

describe("isAndroidTablet", () => {
  it("is true for Galaxy Tab models", () => {
    expect(isAndroidTablet("samsung-galaxy-tab-s10-ultra")).toBe(true);
  });

  it("is false for Android phones", () => {
    expect(isAndroidTablet("samsung-galaxy-s24-ultra")).toBe(false);
    expect(isAndroidTablet("pixel-9-pro-xl")).toBe(false);
  });

  it("is false for Apple tablets (iPad is not an Android tablet)", () => {
    expect(isAndroidTablet("ipad-pro-13-m4")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hasAnyScreenshotImage } from "./onboarding";
import type { Screenshot } from "../types";

const device = (screenshotSrc: string | null) =>
  ({ id: "d", deviceId: "iphone-15-pro-max", colorId: "c", screenshotSrc }) as any;

const screenshot = (devices: unknown[]): Screenshot =>
  ({ id: "s", devices } as unknown as Screenshot);

describe("hasAnyScreenshotImage", () => {
  it("is false when no device has an uploaded image", () => {
    expect(
      hasAnyScreenshotImage([screenshot([device(null)]), screenshot([device(null)])]),
    ).toBe(false);
  });

  it("is true when any device in any screenshot has an image", () => {
    expect(
      hasAnyScreenshotImage([
        screenshot([device(null)]),
        screenshot([device(null), device("data:image/png;base64,xxx")]),
      ]),
    ).toBe(true);
  });

  it("is false for an empty project", () => {
    expect(hasAnyScreenshotImage([])).toBe(false);
  });
});

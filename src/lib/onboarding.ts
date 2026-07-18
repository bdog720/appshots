import type { Screenshot } from "../types";

const ONBOARDING_DISMISSED_KEY = "appshots:onboardingDismissed";

/** Whether any device in any screenshot has an uploaded screen image. */
export function hasAnyScreenshotImage(screenshots: Screenshot[]): boolean {
  return screenshots.some((screenshot) =>
    screenshot.devices.some((device) => Boolean(device.screenshotSrc)),
  );
}

/** Whether the user has previously dismissed the first-run onboarding hint. */
export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist that the first-run onboarding hint has been dismissed. */
export function dismissOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  } catch {
    // Ignore storage failures (private mode, quota); the hint simply reappears.
  }
}

/**
 * ContrastWarningDot
 *
 * A small amber marker overlaid on a screenshot card when its base text would
 * be hard to read against the background (per the design-guidance engine). It's
 * editor chrome — the export pipeline renders from export-utils.ts, not the DOM,
 * so this never appears in exported PNGs. Renders nothing when the screenshot is
 * clean or has no measurable background (image mode).
 */

import type { Screenshot } from "../../types";
import { evaluateScreenshotContrast } from "../../lib/design-guidance";

interface ContrastWarningDotProps {
  screenshot: Screenshot;
}

export const ContrastWarningDot = ({ screenshot }: ContrastWarningDotProps) => {
  const issues = evaluateScreenshotContrast(screenshot);
  if (issues.length === 0) return null;

  return (
    <div
      role="img"
      aria-label="Low contrast — text may be hard to read"
      title="Low contrast — text may be hard to read"
      className="absolute top-2 left-2 z-10 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-black/40"
    />
  );
};

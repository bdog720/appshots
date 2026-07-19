/**
 * ContrastIndicator
 *
 * Live readability chip for a text color against the active screenshot's
 * background. Reads the pure design-guidance engine: shows the worst-case WCAG
 * level and ratio, and — when the text would be hard to read — an inline Fix
 * that swaps in a readable color derived from the background. Renders nothing
 * for image backgrounds, which have no measurable base color.
 */

import { Check, TriangleAlert } from "lucide-react";
import type { Screenshot } from "../../types";
import { assessScreenshotContrast } from "../../lib/design-guidance";

interface ContrastIndicatorProps {
  /** The candidate text color to assess (the value the control currently shows). */
  textColor: string;
  /** Active screenshot, for its background and per-element font sizes. */
  screenshot: Screenshot;
  /** Apply a readable color; the caller decides scope (global vs screenshot). */
  onFix: (readableColor: string) => void;
}

const LABELS = {
  AAA: "Excellent contrast",
  AA: "Good contrast",
  fail: "Low contrast",
} as const;

export const ContrastIndicator = ({
  textColor,
  screenshot,
  onFix,
}: ContrastIndicatorProps) => {
  const assessment = assessScreenshotContrast(textColor, screenshot);
  if (!assessment) return null;

  const { level, ratio, passes, suggestedTextColor } = assessment;
  const ratioText = `${ratio.toFixed(1)}:1`;

  return (
    <div
      role="status"
      className="mt-1.5 flex items-center gap-1.5 text-[11px]"
    >
      {passes ? (
        <Check size={12} className="shrink-0 text-emerald-400" />
      ) : (
        <TriangleAlert size={12} className="shrink-0 text-amber-400" />
      )}
      <span className={passes ? "text-zinc-400" : "text-amber-300"}>
        {LABELS[level]}
      </span>
      <span className="text-zinc-500">· {ratioText}</span>
      {!passes && (
        <button
          type="button"
          onClick={() => onFix(suggestedTextColor)}
          className="ml-auto rounded bg-amber-400/15 px-2 py-0.5 font-medium text-amber-200 hover:bg-amber-400/25"
          title="Use a readable text color"
        >
          Fix
        </button>
      )}
    </div>
  );
};

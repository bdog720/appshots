/**
 * DesignCheckSection
 *
 * A project-wide readability review in the right sidebar: every screenshot whose
 * base text fails WCAG contrast, each with a one-click Fix (applies a readable
 * color derived from the background) and a jump-to that activates the screenshot.
 * When nothing is wrong it shows a positive empty state. Collapsible.
 *
 * Built on the pure design-guidance engine (evaluateProjectContrast). Fixes route
 * through setScreenshots so they can target any screenshot, not just the active
 * one, recording a per-screenshot textColor override.
 */

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import { overrideScreenshotText } from "../../lib/text-settings";
import {
  evaluateProjectContrast,
  type ContrastIssue,
} from "../../lib/design-guidance";
import { STYLES } from "./constants";

/** One entry per screenshot that has at least one contrast issue. */
interface ScreenshotGroup {
  screenshotId: string;
  /** 1-based position for a human-readable label. */
  index: number;
  elements: ContrastIssue["element"][];
  ratio: number;
  suggestedTextColor: string;
}

export const DesignCheckSection = () => {
  const { screenshots, setScreenshots, setActiveScreenshotId } = useEditor();
  const [expanded, setExpanded] = useState(true);

  const issues = evaluateProjectContrast(screenshots);

  // Group by screenshot, preserving canvas order and carrying a 1-based index.
  const groups: ScreenshotGroup[] = [];
  for (const issue of issues) {
    let group = groups.find((g) => g.screenshotId === issue.screenshotId);
    if (!group) {
      group = {
        screenshotId: issue.screenshotId,
        index: screenshots.findIndex((s) => s.id === issue.screenshotId) + 1,
        elements: [],
        ratio: issue.ratio,
        suggestedTextColor: issue.suggestedTextColor,
      };
      groups.push(group);
    }
    group.elements.push(issue.element);
  }

  const fixScreenshot = (screenshotId: string, color: string) => {
    setScreenshots(
      screenshots.map((s) =>
        s.id === screenshotId
          ? overrideScreenshotText(s, "textColor", color)
          : s,
      ),
    );
  };

  return (
    <section className={STYLES.section}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between"
      >
        <span className={`${STYLES.sectionTitle} mb-0 flex items-center gap-2`}>
          Design check
          {groups.length > 0 && (
            <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              {groups.length}
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronDown size={16} className="text-zinc-400" />
        ) : (
          <ChevronRight size={16} className="text-zinc-400" />
        )}
      </button>

      {expanded &&
        (groups.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <Check size={14} className="shrink-0 text-emerald-400" />
            Text is readable on every screenshot.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {groups.map((group) => (
              <li
                key={group.screenshotId}
                className="rounded-lg bg-input p-2"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveScreenshotId(group.screenshotId)}
                    aria-label={`Go to Screenshot ${group.index}`}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                      <TriangleAlert
                        size={12}
                        className="shrink-0 text-amber-400"
                      />
                      Screenshot {group.index}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Low contrast on {group.elements.join(" & ")} ·{" "}
                      {group.ratio.toFixed(1)}:1
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      fixScreenshot(
                        group.screenshotId,
                        group.suggestedTextColor,
                      )
                    }
                    className="shrink-0 rounded bg-amber-400/15 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-400/25"
                    title="Use a readable text color"
                  >
                    Fix
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
};

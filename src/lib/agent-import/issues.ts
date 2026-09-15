/**
 * Import problems. Blocking problems are thrown as ImportError (or returned as
 * errors); non-blocking ones are returned as warnings. Both are path-addressed
 * so the text can be pasted straight back to the agent that wrote the file.
 */

import type { Project } from "../../types";

export interface ImportIssue {
  /** Manifest location like "screens[2].layout"; "" for bundle-level issues. */
  path: string;
  message: string;
}

export const formatIssue = (issue: ImportIssue): string =>
  issue.path ? `${issue.path}: ${issue.message}` : issue.message;

export class ImportError extends Error {
  readonly issues: ImportIssue[];

  constructor(issues: ImportIssue[]) {
    super(issues.map(formatIssue).join("\n"));
    this.name = "ImportError";
    this.issues = issues;
  }
}

export const formatIssuePath = (path: ReadonlyArray<PropertyKey>): string =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, "");

/** Conservative localStorage budget (most browsers allow ~5M characters). */
export const STORAGE_BUDGET_CHARS = 4_500_000;

const toMb = (chars: number) => (chars / 1_000_000).toFixed(1);

/**
 * Persistence only logs quota failures to the console, so an oversized import
 * would look fine and then silently stop saving. Warn before that happens.
 */
export const checkStorageBudget = (
  existingChars: number,
  project: Project,
  budget: number = STORAGE_BUDGET_CHARS,
): ImportIssue | null => {
  const total = existingChars + JSON.stringify(project).length;
  if (total <= budget) return null;
  return {
    path: "",
    message: `This import brings saved data to about ${toMb(total)} MB, above the ~${toMb(budget)} MB browser storage limit. AppShots may stop saving your work — use fewer or smaller images, or delete unused projects first.`,
  };
};

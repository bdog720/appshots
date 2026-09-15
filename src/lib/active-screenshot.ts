import type { Screenshot } from "../types";

/**
 * Keep the active screenshot id pointing at a screenshot that exists. After a
 * history restore (e.g. undoing a replace or an added screenshot) the old id
 * may be gone; fall back to the first screenshot so edits don't target nothing.
 */
export const reconcileActiveScreenshotId = (
  currentId: string,
  screenshots: Screenshot[],
): string => {
  if (screenshots.length === 0) return currentId;
  return screenshots.some((shot) => shot.id === currentId)
    ? currentId
    : screenshots[0].id;
};

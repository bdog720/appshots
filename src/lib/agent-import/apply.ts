import type { Project } from "../../types";

export type AgentImportMode = "new" | "replace";

/** Imported content under the current project's identity (for "Replace current project"). */
export const replaceProjectContent = (
  current: Project,
  imported: Project,
  now: number = Date.now(),
): Project => ({
  ...imported,
  id: current.id,
  name: current.name,
  createdAt: current.createdAt,
  updatedAt: now,
});

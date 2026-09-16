/**
 * First run against container storage: if the container has no projects and
 * this browser does, move them in once. The browser copy is left in place as a
 * backup; a flag stops it being imported again.
 */

import type { Project } from "../../types";
import { BrowserStorage } from "./browser-storage";
import { StorageError, type ProjectStorage } from "./types";

export const MIGRATION_FLAG_KEY = "appshots-migrated-to-server";

export const migrateBrowserProjects = async (options: {
  server: ProjectStorage;
  serverProjectCount: number;
  normalize: (project: Project) => Project;
  localStorage?: Storage;
  now?: () => number;
}): Promise<number> => {
  if (options.serverProjectCount > 0) return 0;
  const storage = options.localStorage ?? window.localStorage;
  try {
    if (storage.getItem(MIGRATION_FLAG_KEY)) return 0;
  } catch {
    return 0;
  }

  const local = await new BrowserStorage(storage).load();
  if (local.projects.length === 0) return 0;

  const projects = local.projects.map(options.normalize);
  for (const project of projects) {
    const result = await options.server.saveProject(project);
    if (!result.ok) throw new StorageError(`Couldn't move "${project.name}" into the container`);
  }

  const order = projects.map((project) => project.id);
  const active = local.activeProjectId && order.includes(local.activeProjectId) ? local.activeProjectId : order[0];
  await options.server.saveMeta(active, order);
  try {
    storage.setItem(MIGRATION_FLAG_KEY, String((options.now ?? Date.now)()));
  } catch {
    // Setting the flag must never throw; a retry next load is safe (browser copy is intact).
  }
  return projects.length;
};

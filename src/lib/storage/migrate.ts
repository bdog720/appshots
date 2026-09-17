/**
 * First run against container storage: if the container has no projects (or
 * a prior attempt left it partway there) and this browser has projects, move
 * them in. The browser copy is left in place as a backup. A flag stops a
 * completed migration from running again; an incomplete marker lets a
 * partial migration resume on the next load instead of being permanently
 * blocked by the container's now-nonzero project count.
 */

import type { Project } from "../../types";
import { BrowserStorage } from "./browser-storage";
import { StorageError, type ProjectStorage } from "./types";

export const MIGRATION_FLAG_KEY = "appshots-migrated-to-server";
export const MIGRATION_INCOMPLETE_KEY = "appshots-migration-incomplete";

/** localStorage access can throw (blocked site data); these must never propagate that. */
const safeGet = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (storage: Storage, key: string, value: string): void => {
  try {
    storage.setItem(key, value);
  } catch {
    // Never throws: the browser copy is intact either way.
  }
};

const safeRemove = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key);
  } catch {
    // Never throws.
  }
};

export const migrateBrowserProjects = async (options: {
  server: ProjectStorage;
  serverProjectCount: number;
  /** Ids already saved on the server (e.g. from a previous partial run); skipped this run. */
  serverProjectIds?: string[];
  normalize: (project: Project) => Project;
  localStorage?: Storage;
  now?: () => number;
}): Promise<number> => {
  const storage = options.localStorage ?? window.localStorage;

  // An unreadable flag is treated as absent rather than aborting: a blocked
  // read must never permanently disable migration.
  if (safeGet(storage, MIGRATION_FLAG_KEY)) return 0;
  const incomplete = Boolean(safeGet(storage, MIGRATION_INCOMPLETE_KEY));
  if (options.serverProjectCount > 0 && !incomplete) return 0;

  const local = await new BrowserStorage(storage).load();
  if (local.projects.length === 0) return 0;

  const allIds = local.projects.map((project) => project.id);
  const alreadyOnServer = new Set(options.serverProjectIds ?? []);
  const toMigrate = local.projects
    .filter((project) => !alreadyOnServer.has(project.id))
    .map((project) => options.normalize(project));

  try {
    for (const project of toMigrate) {
      const result = await options.server.saveProject(project);
      if (!result.ok) throw new StorageError(`Couldn't move "${project.name}" into the container`);
    }
    const active = local.activeProjectId && allIds.includes(local.activeProjectId) ? local.activeProjectId : allIds[0];
    await options.server.saveMeta(active, allIds);
  } catch (error) {
    safeSet(storage, MIGRATION_INCOMPLETE_KEY, "1");
    throw error;
  }

  safeRemove(storage, MIGRATION_INCOMPLETE_KEY);
  safeSet(storage, MIGRATION_FLAG_KEY, String((options.now ?? Date.now)()));
  return toMigrate.length;
};

/** Startup: pick storage, move browser projects into an empty container, load. */

import { BrowserStorage } from "../lib/storage/browser-storage";
import { migrateBrowserProjects } from "../lib/storage/migrate";
import { resolveStorage } from "../lib/storage/resolve-storage";
import type { LoadedState, ProjectStorage } from "../lib/storage/types";
import {
  normalizeProject,
  prepareInitialState,
  type InitialEditorState,
  type StartupNotice,
} from "./EditorContext";

export interface BootstrapResult {
  storage: ProjectStorage;
  initialState: InitialEditorState;
  notice: StartupNotice;
}

export interface BootstrapDeps {
  resolveStorage: typeof resolveStorage;
  migrateBrowserProjects: typeof migrateBrowserProjects;
  createBrowserStorage: () => ProjectStorage;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Couldn't move projects into the container";

export const bootstrapEditor = async (
  onProgress: (message: string) => void,
  deps: Partial<BootstrapDeps> = {},
): Promise<BootstrapResult> => {
  const resolve = deps.resolveStorage ?? resolveStorage;
  const migrate = deps.migrateBrowserProjects ?? migrateBrowserProjects;
  const createBrowserStorage = deps.createBrowserStorage ?? (() => new BrowserStorage());

  const resolved = await resolve();
  let storage = resolved.storage;
  let unwritable = resolved.notice === "unwritable";
  let migratedCount = 0;
  let migrationError: string | undefined;

  let loaded: LoadedState;
  try {
    loaded = await storage.load();
  } catch (error) {
    // The container answered /api/health but won't hand over its state. Saving
    // to this browser beats a dead editor, and the container's copy is left
    // exactly as it is.
    if (storage.mode !== "server") throw error;
    storage = createBrowserStorage();
    unwritable = true;
    loaded = await storage.load();
  }

  if (storage.mode === "server") {
    onProgress("Moving projects into the container…");
    try {
      migratedCount = await migrate({
        server: storage,
        serverProjectCount: loaded.projects.length,
        serverProjectIds: loaded.projects.map((project) => project.id),
        normalize: normalizeProject,
      });
    } catch (error) {
      // A half-finished move is resumable: the browser copy is intact and the
      // next load retries, so open the editor on what the container does have.
      migrationError = messageOf(error);
    }
    if (migratedCount > 0 || migrationError !== undefined) {
      loaded = await storage.load();
    }
  }

  return {
    storage,
    initialState: prepareInitialState(loaded),
    notice: {
      unwritable,
      migratedCount,
      ...(migrationError === undefined ? {} : { migrationError }),
    },
  };
};

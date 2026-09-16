/**
 * Persisted editor state shape and migration for browser storage.
 */

import type { Project } from "../types";

/**
 * Editor state that gets persisted to localStorage
 */
export interface PersistedEditorState {
  /** Editor version for migration support */
  version: number;
  /** All projects */
  projects: Project[];
  /** Active project ID */
  activeProjectId: string;
  /** Timestamp of last save */
  lastSaved: number;
}

/** Current schema version for migration support */
export const CURRENT_VERSION = 2;

/** localStorage key for editor state */
export const STORAGE_KEY = "app-screenshot-editor-state";

/**
 * Migrates a raw parsed value forward to the current persisted shape.
 *
 * Rather than wiping everything on a version mismatch (which would silently
 * destroy a user's projects on any schema bump), we keep any structurally
 * valid `projects` array and let the defensive normalization in EditorContext
 * fill in newer fields. Returns null only when the data is unusable.
 */
export const migratePersistedState = (
  raw: unknown,
): PersistedEditorState | null => {
  if (!raw || typeof raw !== "object") return null;

  const state = raw as Partial<PersistedEditorState>;
  if (!Array.isArray(state.projects) || state.projects.length === 0) {
    return null;
  }

  return {
    version: CURRENT_VERSION,
    projects: state.projects,
    activeProjectId: state.activeProjectId ?? state.projects[0]?.id ?? "",
    lastSaved: state.lastSaved ?? Date.now(),
  };
};

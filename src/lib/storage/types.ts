/** Where projects are saved: the container's storage API, or this browser. */

import type { Project } from "../../types";

export type StorageMode = "server" | "browser";

export interface LoadedState {
  projects: Project[];
  activeProjectId: string | null;
}

export interface SaveOptions {
  /** Keep this save as a pinned history version (Save now). */
  pin?: boolean;
  /** Keep the version being overwritten as a pinned history version. */
  pinPrevious?: boolean;
  label?: string;
  /** Save on top of this revision instead of the last one seen (Keep mine). */
  baseRevision?: number;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; conflict: { revision: number; savedAt: number } };

export interface ProjectStorage {
  readonly mode: StorageMode;
  load(): Promise<LoadedState>;
  saveProject(project: Project, options?: SaveOptions): Promise<SaveResult>;
  deleteProject(id: string): Promise<void>;
  saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void>;
  resetAll(): Promise<void>;
}

export interface HistoryVersion {
  version: string;
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
  screenCount: number;
  firstHeadline: string;
}

export interface ServerProjectStorage extends ProjectStorage {
  readonly mode: "server";
  reloadProject(id: string): Promise<Project | null>;
  listHistory(id: string): Promise<HistoryVersion[]>;
  addHistory(project: Project, label: string): Promise<void>;
  restoreVersion(id: string, version: string): Promise<Project>;
  /** Replace /api/images URLs with data URLs (for self-contained exports). */
  inlineProjectImages(project: Project): Promise<Project>;
  /** Best-effort keepalive save while the page unloads. False when it can't be sent. */
  saveProjectOnUnload(project: Project, options?: { pinPrevious?: boolean }): boolean;
}

export const isServerStorage = (storage: ProjectStorage): storage is ServerProjectStorage =>
  storage.mode === "server";

export class StorageError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/**
 * Browser storage: the original single localStorage blob, behind the
 * ProjectStorage interface. Unlike the old autosave, a failed write (e.g. a
 * full quota) rejects so the save indicator can show it.
 */

import type { Project } from "../../types";
import {
  CURRENT_VERSION,
  STORAGE_KEY,
  migratePersistedState,
  type PersistedEditorState,
} from "../useLocalStorage";
import { StorageError, type LoadedState, type ProjectStorage, type SaveResult } from "./types";

const UNAVAILABLE = "Browser storage is unavailable";

/** Quota errors across browsers, including legacy Firefox's name and code. */
const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014);

/** Thrown when site data is blocked (privacy settings, sandboxed iframes). */
const isSecurityError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "SecurityError";

export class BrowserStorage implements ProjectStorage {
  readonly mode = "browser" as const;
  private projects = new Map<string, Project>();
  private order: string[] = [];
  private activeProjectId: string | null = null;
  private loaded = false;
  private readonly injected: Storage | undefined;

  constructor(storage?: Storage) {
    this.injected = storage;
  }

  async load(): Promise<LoadedState> {
    return this.readState();
  }

  async saveProject(project: Project): Promise<SaveResult> {
    this.ensureLoaded();
    if (!this.projects.has(project.id)) this.order.push(project.id);
    this.projects.set(project.id, project);
    this.write();
    return { ok: true };
  }

  async deleteProject(id: string): Promise<void> {
    this.ensureLoaded();
    this.projects.delete(id);
    this.order = this.order.filter((projectId) => projectId !== id);
    if (this.activeProjectId === id) this.activeProjectId = this.order[0] ?? null;
    this.write();
  }

  async saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void> {
    this.ensureLoaded();
    this.activeProjectId = activeProjectId;
    const known = [...new Set(projectOrder)].filter((id) => this.projects.has(id));
    this.order = [...known, ...this.order.filter((id) => !known.includes(id))];
    this.write();
  }

  async resetAll(): Promise<void> {
    this.projects.clear();
    this.order = [];
    this.activeProjectId = null;
    this.loaded = true;
    const storage = this.resolveStorage();
    if (!storage) throw new StorageError(UNAVAILABLE);
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (error) {
      throw new StorageError(isSecurityError(error) ? UNAVAILABLE : "Couldn't clear browser storage");
    }
  }

  /**
   * Resolved on each use rather than in the constructor: reading
   * `window.localStorage` throws when site data is blocked, and browser
   * storage is the fallback that must still start up.
   */
  private resolveStorage(): Storage | null {
    if (this.injected) return this.injected;
    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  /** Synchronous so mutations still write before their first await (beforeunload). */
  private readState(): LoadedState {
    let raw: string | null = null;
    try {
      raw = this.resolveStorage()?.getItem(STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const state = migratePersistedState(parsed);
    const projects = state?.projects ?? [];
    this.projects = new Map(projects.map((project) => [project.id, project]));
    this.order = projects.map((project) => project.id);
    this.activeProjectId = state?.activeProjectId || null;
    this.loaded = true;
    return { projects, activeProjectId: this.activeProjectId };
  }

  /** Read the stored blob first so a write never drops projects not yet loaded. */
  private ensureLoaded(): void {
    if (!this.loaded) this.readState();
  }

  private write(): void {
    const storage = this.resolveStorage();
    if (!storage) throw new StorageError(UNAVAILABLE);
    const state: PersistedEditorState = {
      version: CURRENT_VERSION,
      projects: this.order.map((id) => this.projects.get(id) as Project),
      activeProjectId: this.activeProjectId ?? this.order[0] ?? "",
      lastSaved: Date.now(),
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (isQuotaError(error)) throw new StorageError("Browser storage is full");
      if (isSecurityError(error)) throw new StorageError(UNAVAILABLE);
      throw new StorageError("Couldn't save to browser storage");
    }
  }
}

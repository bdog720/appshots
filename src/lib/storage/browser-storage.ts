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

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22);

export class BrowserStorage implements ProjectStorage {
  readonly mode = "browser" as const;
  private projects = new Map<string, Project>();
  private order: string[] = [];
  private activeProjectId: string | null = null;
  private readonly storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? window.localStorage;
  }

  async load(): Promise<LoadedState> {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
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
    return { projects, activeProjectId: this.activeProjectId };
  }

  async saveProject(project: Project): Promise<SaveResult> {
    if (!this.projects.has(project.id)) this.order.push(project.id);
    this.projects.set(project.id, project);
    this.write();
    return { ok: true };
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    this.order = this.order.filter((projectId) => projectId !== id);
    if (this.activeProjectId === id) this.activeProjectId = this.order[0] ?? null;
    this.write();
  }

  async saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void> {
    this.activeProjectId = activeProjectId;
    const known = projectOrder.filter((id) => this.projects.has(id));
    this.order = [...known, ...this.order.filter((id) => !known.includes(id))];
    this.write();
  }

  async resetAll(): Promise<void> {
    this.projects.clear();
    this.order = [];
    this.activeProjectId = null;
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      throw new StorageError("Couldn't clear browser storage");
    }
  }

  private write(): void {
    const state: PersistedEditorState = {
      version: CURRENT_VERSION,
      projects: this.order.map((id) => this.projects.get(id) as Project),
      activeProjectId: this.activeProjectId ?? this.order[0] ?? "",
      lastSaved: Date.now(),
    };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new StorageError(isQuotaError(error) ? "Browser storage is full" : "Couldn't save to browser storage");
    }
  }
}

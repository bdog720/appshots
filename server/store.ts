/**
 * FileStore — the container's project storage on disk.
 *
 *   <dataDir>/state.json               { activeProjectId, projectOrder }
 *   <dataDir>/projects/<id>.json        { revision, savedAt, project }
 *   <dataDir>/images/<sha256>.<ext>
 *
 * Every write goes to a temp file and is renamed into place. Writes to the same
 * project are serialized so a read-check-write can't interleave.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_CONTENT_TYPES, detectImageType, isValidImageName, type ImageExt } from "./validation";

export interface AppState {
  activeProjectId: string | null;
  projectOrder: string[];
}

export interface ProjectListing {
  id: string;
  revision: number;
  savedAt: number;
}

export interface StoredProject {
  revision: number;
  savedAt: number;
  project: unknown;
}

export interface PutProjectOptions {
  /** Revision the client last saw; 0 means the project must not exist yet. */
  expectedRevision: number;
  pin?: boolean;
  pinPrevious?: boolean;
  label?: string;
}

export type PutProjectResult =
  | { ok: true; revision: number; savedAt: number }
  | { ok: false; current: { revision: number; savedAt: number } };

export const writeFileAtomic = async (target: string, data: string | Uint8Array): Promise<void> => {
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
};

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export class FileStore {
  protected readonly projectsDir: string;
  protected readonly imagesDir: string;
  private readonly statePath: string;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    readonly dataDir: string,
    protected readonly now: () => number = Date.now,
  ) {
    this.projectsDir = path.join(dataDir, "projects");
    this.imagesDir = path.join(dataDir, "images");
    this.statePath = path.join(dataDir, "state.json");
  }

  async init(): Promise<{ writable: boolean }> {
    try {
      await mkdir(this.projectsDir, { recursive: true });
      await mkdir(this.imagesDir, { recursive: true });
      const probe = path.join(this.dataDir, `.write-test-${randomBytes(4).toString("hex")}`);
      await writeFile(probe, "ok");
      await rm(probe, { force: true });
      return { writable: true };
    } catch {
      return { writable: false };
    }
  }

  /** Run `task` after any in-flight task for the same key. */
  protected withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    this.locks.set(key, settled);
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return run;
  }

  protected projectPath(id: string): string {
    return path.join(this.projectsDir, `${id}.json`);
  }

  async getState(): Promise<AppState & { projects: ProjectListing[] }> {
    const saved = (await readJson<AppState>(this.statePath)) ?? { activeProjectId: null, projectOrder: [] };
    const files = (await readdir(this.projectsDir)).filter((file) => file.endsWith(".json"));
    const listings: ProjectListing[] = [];
    for (const file of files) {
      const stored = await readJson<StoredProject>(path.join(this.projectsDir, file));
      if (stored) listings.push({ id: file.slice(0, -".json".length), revision: stored.revision, savedAt: stored.savedAt });
    }
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    const ordered = saved.projectOrder.filter((id) => byId.has(id));
    const rest = listings
      .filter((listing) => !ordered.includes(listing.id))
      .sort((a, b) => a.savedAt - b.savedAt)
      .map((listing) => listing.id);
    const projectOrder = [...ordered, ...rest];
    return {
      activeProjectId: saved.activeProjectId && byId.has(saved.activeProjectId) ? saved.activeProjectId : null,
      projectOrder,
      projects: projectOrder.map((id) => byId.get(id) as ProjectListing),
    };
  }

  async putState(state: AppState): Promise<void> {
    await this.withLock("state", () =>
      writeFileAtomic(this.statePath, JSON.stringify({ activeProjectId: state.activeProjectId, projectOrder: state.projectOrder })),
    );
  }

  getProject(id: string): Promise<StoredProject | null> {
    return readJson<StoredProject>(this.projectPath(id));
  }

  putProject(id: string, project: unknown, options: PutProjectOptions): Promise<PutProjectResult> {
    return this.withLock(id, async () => {
      const current = await this.getProject(id);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== options.expectedRevision) {
        return { ok: false, current: { revision: currentRevision, savedAt: current?.savedAt ?? 0 } };
      }
      const next: StoredProject = { revision: currentRevision + 1, savedAt: this.now(), project };
      await writeFileAtomic(this.projectPath(id), JSON.stringify(next));
      await this.afterProjectWrite(id, current, next, options);
      return { ok: true, revision: next.revision, savedAt: next.savedAt };
    });
  }

  /** Hook for version history (Task 4). */
  protected async afterProjectWrite(
    _id: string,
    _previous: StoredProject | null,
    _next: StoredProject,
    _options: PutProjectOptions,
  ): Promise<void> {}

  async deleteProject(id: string): Promise<boolean> {
    const deleted = await this.withLock(id, async () => {
      const existing = await this.getProject(id);
      if (!existing) return false;
      await rm(this.projectPath(id), { force: true });
      await rm(path.join(this.projectsDir, id), { recursive: true, force: true });
      return true;
    });
    if (deleted) {
      const state = await this.getState();
      await this.putState({
        activeProjectId: state.activeProjectId,
        projectOrder: state.projectOrder.filter((projectId) => projectId !== id),
      });
    }
    return deleted;
  }

  async putImage(bytes: Uint8Array): Promise<string | null> {
    const ext = detectImageType(bytes);
    if (!ext) return null;
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
    const target = path.join(this.imagesDir, name);
    const exists = await stat(target).then(
      () => true,
      () => false,
    );
    if (!exists) await writeFileAtomic(target, bytes);
    return name;
  }

  async readImage(name: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!isValidImageName(name)) return null;
    try {
      const bytes = new Uint8Array(await readFile(path.join(this.imagesDir, name)));
      const ext = name.split(".").pop() as ImageExt;
      return { bytes, contentType: IMAGE_CONTENT_TYPES[ext] };
    } catch {
      return null;
    }
  }
}

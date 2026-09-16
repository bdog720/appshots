/**
 * FileStore — the container's project storage on disk.
 *
 *   <dataDir>/state.json               { activeProjectId, projectOrder }
 *   <dataDir>/projects/<id>.json        { revision, savedAt, project }
 *   <dataDir>/projects/<id>/history/<savedAt>-<revision>.json   { revision, savedAt, pinned, label?, project }
 *   <dataDir>/images/<sha256>.<ext>     deleted by collectGarbage once unreferenced and past the grace period
 *
 * Every write goes to a fsynced temp file and is renamed into place. Writes to
 * the same project are serialized so a read-check-write can't interleave, and
 * state.json updates are serialized under their own lock.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectImageNames,
  selectVersionsToKeep,
  shouldAutoSnapshot,
  summarizeProject,
  versionName,
  type ProjectSummary,
  type VersionMeta,
} from "./history";
import { IMAGE_CONTENT_TYPES, detectImageType, isValidImageName, isValidVersion, type ImageExt } from "./validation";

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

export const IMAGE_GRACE_MS = 60 * 60 * 1000;
export const PREVIOUS_VERSION_LABEL = "Before replace";
export const RESTORE_LABEL = "Before restore";

export interface HistoryEntry {
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
  project: unknown;
}

export interface HistorySummary extends ProjectSummary {
  version: string;
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
}

const STATE_LOCK = "state";
/** Project ids can't contain ":", so this never collides with STATE_LOCK. */
const projectLockKey = (id: string): string => `project:${id}`;

const DEFAULT_STATE: AppState = { activeProjectId: null, projectOrder: [] };

export const writeFileAtomic = async (target: string, data: string | Uint8Array): Promise<void> => {
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(temp, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
};

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** Like readJson, but an unreadable or unparsable file is warned about and treated as missing. */
const readJsonOrSkip = async <T>(file: string): Promise<T | null> => {
  try {
    return await readJson<T>(file);
  } catch (error) {
    console.warn(`[store] skipping unreadable file ${file}: ${(error as Error).message}`);
    return null;
  }
};

const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false,
  );

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
      for (const dir of [this.dataDir, this.projectsDir, this.imagesDir]) {
        const probe = path.join(dir, `.write-test-${randomBytes(4).toString("hex")}`);
        await writeFile(probe, "ok");
        await rm(probe, { force: true });
      }
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

  /** Serialize `task` with every other write to project `id`. */
  protected withProjectLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    return this.withLock(projectLockKey(id), task);
  }

  protected projectPath(id: string): string {
    return path.join(this.projectsDir, `${id}.json`);
  }

  async getState(): Promise<AppState & { projects: ProjectListing[] }> {
    const saved = (await readJsonOrSkip<AppState>(this.statePath)) ?? DEFAULT_STATE;
    const files = (await readdir(this.projectsDir)).filter((file) => file.endsWith(".json"));
    const listings: ProjectListing[] = [];
    for (const file of files) {
      const stored = await readJsonOrSkip<StoredProject>(path.join(this.projectsDir, file));
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
    await this.withLock(STATE_LOCK, () => this.writeState(state));
  }

  /** Unlocked; callers must hold STATE_LOCK. */
  private writeState(state: AppState): Promise<void> {
    return writeFileAtomic(
      this.statePath,
      JSON.stringify({ activeProjectId: state.activeProjectId, projectOrder: state.projectOrder }),
    );
  }

  getProject(id: string): Promise<StoredProject | null> {
    return readJson<StoredProject>(this.projectPath(id));
  }

  putProject(id: string, project: unknown, options: PutProjectOptions): Promise<PutProjectResult> {
    return this.withProjectLock(id, async () => {
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

  /** Writes version history for a save. Runs inside the project lock. */
  protected async afterProjectWrite(
    id: string,
    previous: StoredProject | null,
    next: StoredProject,
    options: PutProjectOptions,
  ): Promise<void> {
    const newestSavedAt = await this.newestVersionSavedAt(id);
    let wrote = false;
    if (options.pinPrevious && previous) {
      await this.writeVersion(id, { ...previous, pinned: true, label: PREVIOUS_VERSION_LABEL });
      wrote = true;
    }
    if (options.pin) {
      await this.writeVersion(id, { ...next, pinned: true, ...(options.label ? { label: options.label } : {}) });
      wrote = true;
    } else if (shouldAutoSnapshot(newestSavedAt, next.savedAt)) {
      await this.writeVersion(id, { ...next, pinned: false });
      wrote = true;
    }
    if (wrote) await this.pruneHistory(id);
  }

  private historyDir(id: string): string {
    return path.join(this.projectsDir, id, "history");
  }

  private async writeVersion(id: string, entry: HistoryEntry): Promise<void> {
    await mkdir(this.historyDir(id), { recursive: true });
    const file = path.join(this.historyDir(id), `${versionName(entry.savedAt, entry.revision)}.json`);
    await writeFileAtomic(file, JSON.stringify(entry));
  }

  private async versionNames(id: string): Promise<string[]> {
    try {
      return (await readdir(this.historyDir(id)))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .filter(isValidVersion);
    } catch {
      return [];
    }
  }

  private async newestVersionSavedAt(id: string): Promise<number | null> {
    const [newest] = await this.readVersions(id);
    return newest?.savedAt ?? null;
  }

  private async readVersions(id: string): Promise<Array<VersionMeta & { entry: HistoryEntry }>> {
    const versions: Array<VersionMeta & { entry: HistoryEntry }> = [];
    for (const version of await this.versionNames(id)) {
      const entry = await readJsonOrSkip<HistoryEntry>(path.join(this.historyDir(id), `${version}.json`));
      if (entry) versions.push({ version, savedAt: entry.savedAt, pinned: entry.pinned, entry });
    }
    return versions.sort((a, b) => b.savedAt - a.savedAt);
  }

  private async pruneHistory(id: string): Promise<void> {
    const versions = await this.readVersions(id);
    const keep = selectVersionsToKeep(versions, this.now());
    let removed = 0;
    for (const version of versions) {
      if (!keep.has(version.version)) {
        await rm(path.join(this.historyDir(id), `${version.version}.json`), { force: true });
        removed += 1;
      }
    }
    // Same class as the delete path: the versions are already pruned and the
    // project file already written, so a cleanup failure here would report the
    // save (or restore) that triggered it as a 500 — and the client's next
    // attempt would then carry a stale revision.
    if (removed > 0) {
      await this.collectGarbage().catch((error: unknown) => {
        console.warn(`[store] image cleanup after pruning ${id} failed: ${(error as Error).message}`);
      });
    }
  }

  async listHistory(id: string): Promise<HistorySummary[] | null> {
    if (!(await exists(this.projectPath(id)))) return null;
    return (await this.readVersions(id)).map(({ version, entry }) => ({
      version,
      revision: entry.revision,
      savedAt: entry.savedAt,
      pinned: entry.pinned,
      ...(entry.label ? { label: entry.label } : {}),
      ...summarizeProject(entry.project),
    }));
  }

  addHistory(id: string, project: unknown, label: string): Promise<boolean> {
    return this.withProjectLock(id, async () => {
      const current = await this.getProject(id);
      if (!current) return false;
      await this.writeVersion(id, { revision: current.revision, savedAt: this.now(), pinned: true, label, project });
      await this.pruneHistory(id);
      return true;
    });
  }

  restoreVersion(id: string, version: string): Promise<StoredProject | null> {
    return this.withProjectLock(id, async () => {
      if (!isValidVersion(version)) return null;
      const current = await this.getProject(id);
      if (!current) return null;
      const entry = await readJsonOrSkip<HistoryEntry>(path.join(this.historyDir(id), `${version}.json`));
      if (!entry) return null;
      await this.writeVersion(id, { ...current, pinned: true, label: RESTORE_LABEL });
      const next: StoredProject = { revision: current.revision + 1, savedAt: this.now(), project: entry.project };
      await writeFileAtomic(this.projectPath(id), JSON.stringify(next));
      await this.pruneHistory(id);
      return next;
    });
  }

  /** Deletes images that no project or history file references and that are past the grace period. */
  async collectGarbage(): Promise<number> {
    const referenced = await this.referencedImages();
    if (!referenced) return 0;
    let deleted = 0;
    for (const name of await readdir(this.imagesDir)) {
      if (!isValidImageName(name) || referenced.has(name)) continue;
      const info = await stat(path.join(this.imagesDir, name)).catch(() => null);
      if (info && this.now() - info.mtimeMs > IMAGE_GRACE_MS) {
        await rm(path.join(this.imagesDir, name), { force: true });
        deleted += 1;
      }
    }
    return deleted;
  }

  /**
   * Every image referenced by a project or history file, or null if any of those
   * files can't be parsed — an unknown reference could be an image still in use.
   */
  private async referencedImages(): Promise<Set<string> | null> {
    const files: string[] = [];
    for (const entry of await readdir(this.projectsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(this.projectsDir, entry.name));
      } else if (entry.isDirectory()) {
        for (const version of await this.versionNames(entry.name)) {
          files.push(path.join(this.historyDir(entry.name), `${version}.json`));
        }
      }
    }
    const referenced = new Set<string>();
    for (const file of files) {
      try {
        const stored = await readJson<{ project?: unknown }>(file);
        if (stored) collectImageNames(stored.project, referenced);
      } catch (error) {
        console.warn(`[store] skipping image cleanup, unreadable file ${file}: ${(error as Error).message}`);
        return null;
      }
    }
    return referenced;
  }

  async deleteProject(id: string): Promise<boolean> {
    const deleted = await this.withProjectLock(id, async () => {
      // Existence, not parsing: a corrupt project file must still be deletable.
      if (!(await exists(this.projectPath(id)))) return false;
      await rm(this.projectPath(id), { force: true });
      await rm(path.join(this.projectsDir, id), { recursive: true, force: true });
      return true;
    });
    if (deleted) {
      await this.withLock(STATE_LOCK, async () => {
        const state = await this.getState();
        await this.writeState({
          activeProjectId: state.activeProjectId,
          projectOrder: state.projectOrder.filter((projectId) => projectId !== id),
        });
      });
      // Best-effort: the project is already gone, so a cleanup failure must not
      // be reported as a failed delete — the client would show a save error and
      // abandon the rest of its flush over some unreferenced images.
      await this.collectGarbage().catch((error: unknown) => {
        console.warn(`[store] image cleanup after deleting ${id} failed: ${(error as Error).message}`);
      });
    }
    return deleted;
  }

  async putImage(bytes: Uint8Array): Promise<string | null> {
    const ext = detectImageType(bytes);
    if (!ext) return null;
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
    const target = path.join(this.imagesDir, name);
    // Touching an existing image restarts its cleanup grace period, so a re-upload survives until
    // it's saved into a project; if it doesn't exist (or was just cleaned up), write it.
    const now = new Date(this.now());
    await utimes(target, now, now).catch(() => writeFileAtomic(target, bytes));
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

/**
 * ServerStorage — saves projects through the container's storage API.
 * Remembers each project's revision for conflict detection and uploads inline
 * (data URL) images, saving /api/images URLs in their place.
 */

import type { Project } from "../../types";
import {
  bytesToDataUrl,
  convertDataUrlToPng,
  dataUrlContentType,
  dataUrlToBytes,
  isDataUrl,
  isServerImageUrl,
  mapProjectImages,
  mapProjectImagesSync,
} from "./images";
import {
  StorageError,
  type HistoryVersion,
  type LoadedState,
  type SaveOptions,
  type SaveResult,
  type ServerProjectStorage,
} from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const UNLOAD_BODY_LIMIT = 60 * 1024;

/**
 * How long an uploaded image's URL is reused. The server deletes unreferenced
 * images an hour after their last upload, so re-upload (refreshing it) well before.
 */
export const UPLOAD_CACHE_TTL_MS = 30 * 60 * 1000;

export interface ServerStorageOptions {
  now?: () => number;
  /** Re-encodes an image the server doesn't accept as a PNG data URL. */
  convertImage?: (dataUrl: string) => Promise<string>;
}

/** Types the server accepts (it checks magic bytes); anything else is converted first. */
const UPLOADABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface CachedUpload {
  /** Shared by concurrent saves of the same image. */
  promise: Promise<string>;
  /** Set once the upload has finished. */
  url?: string;
  uploadedAt?: number;
}

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export class ServerStorage implements ServerProjectStorage {
  readonly mode = "server" as const;
  private readonly revisions = new Map<string, number>();
  /** Per-project ticket counter: the next ticket `nextTicket` will hand out. */
  private readonly seq = new Map<string, number>();
  /** Per-project: the newest ticket whose response has been applied so far. */
  private readonly applied = new Map<string, number>();
  /** Keyed by the original data URL, so a converted image is converted once. */
  private readonly uploads = new Map<string, CachedUpload>();
  private readonly pendingUnloadSaves = new Map<string, Promise<void>>();
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly convertImage: (dataUrl: string) => Promise<string>;

  constructor(fetchImpl?: FetchLike, options: ServerStorageOptions = {}) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.convertImage = options.convertImage ?? convertDataUrlToPng;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(url, { credentials: "same-origin", ...init });
    } catch {
      throw new StorageError("Can't reach the Breezel server");
    }
  }

  private async ensureOk(response: Response, action: string): Promise<Response> {
    if (response.ok) return response;
    let message = `${action} failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = `${action} failed: ${body.error}`;
    } catch {
      // keep the status-based message
    }
    throw new StorageError(message, response.status);
  }

  private preconditionHeaders(revision: number): Record<string, string> {
    return revision === 0 ? { "If-None-Match": "*" } : { "If-Match": `"${revision}"` };
  }

  /**
   * A ticket for a request about to go out for a project, taken immediately
   * before its fetch so ticket order matches send order. Responses are
   * applied by that order, not by revision magnitude: the server's revision
   * can legitimately move backward (a restored backup, a rollback, another
   * client deleting and recreating the same id), and a one-way "only ever
   * increase" guard would leave the client stuck resending a stale, too-high
   * revision forever in exactly those cases.
   */
  private nextTicket(id: string): number {
    const ticket = (this.seq.get(id) ?? 0) + 1;
    this.seq.set(id, ticket);
    return ticket;
  }

  /**
   * Records a revision seen for a project under the ticket its request was
   * given. A response whose ticket is older than the newest one already
   * applied is a straggler — from a request sent before one that has already
   * landed — and is dropped; otherwise the server's value wins outright,
   * including downward.
   */
  private trackRevision(id: string, revision: number, ticket: number): void {
    const newest = this.applied.get(id);
    if (newest !== undefined && ticket <= newest) return;
    this.applied.set(id, ticket);
    this.revisions.set(id, revision);
  }

  /** The cached upload for a data URL, unless it's old enough that the server may have deleted it. */
  private cachedUpload(src: string): CachedUpload | undefined {
    const entry = this.uploads.get(src);
    if (entry?.uploadedAt !== undefined && this.now() - entry.uploadedAt > UPLOAD_CACHE_TTL_MS) {
      this.uploads.delete(src);
      return undefined;
    }
    return entry;
  }

  private externalize(src: string): Promise<string> {
    if (!isDataUrl(src)) return Promise.resolve(src);
    const cached = this.cachedUpload(src);
    if (cached) return cached.promise;
    const entry: CachedUpload = { promise: this.upload(src) };
    entry.promise.then(
      (url) => {
        entry.url = url;
        entry.uploadedAt = this.now();
      },
      () => {
        if (this.uploads.get(src) === entry) this.uploads.delete(src);
      },
    );
    this.uploads.set(src, entry);
    return entry.promise;
  }

  private async upload(src: string): Promise<string> {
    let dataUrl = src;
    if (!UPLOADABLE_TYPES.has(dataUrlContentType(src))) {
      try {
        dataUrl = await this.convertImage(src);
      } catch {
        throw new StorageError("An image couldn't be converted for saving");
      }
    }
    let image: { bytes: Uint8Array; contentType: string };
    try {
      image = dataUrlToBytes(dataUrl);
    } catch {
      throw new StorageError("An image couldn't be read");
    }
    const response = await this.ensureOk(
      await this.request("/api/images", {
        method: "POST",
        headers: { "Content-Type": image.contentType },
        // dataUrlToBytes allocates an exact-size buffer, so it's sent without copying.
        body: image.bytes.buffer as ArrayBuffer,
      }),
      "Uploading an image",
    );
    const { url } = (await response.json()) as { url: string };
    return url;
  }

  async load(): Promise<LoadedState> {
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as {
      activeProjectId: string | null;
      projects: Array<{ id: string }>;
    };
    const loaded = await Promise.all(state.projects.map(({ id }) => this.loadOneProject(id)));
    return {
      projects: loaded.filter((project): project is Project => project !== null),
      activeProjectId: state.activeProjectId,
    };
  }

  /**
   * One project's read as part of load(). A rejection from load() means "the
   * container won't hand over its state", which sends the whole session to
   * browser storage — far too much for one project blipping, so retry once and
   * then skip it exactly as a 404 does. Skipping is safe: the project's file is
   * untouched, it never enters this session's saved baseline (so nothing
   * deletes it), and it's back on the next load.
   */
  private async loadOneProject(id: string): Promise<Project | null> {
    try {
      return await this.reloadProject(id);
    } catch {
      // A transient failure — one more try before giving up on it.
    }
    try {
      return await this.reloadProject(id);
    } catch {
      return null;
    }
  }

  async saveProject(project: Project, options: SaveOptions = {}): Promise<SaveResult> {
    const prepared = await mapProjectImages(project, (src) => this.externalize(src));
    // An unload save that's still in flight may move the revision on; never rejects.
    await this.pendingUnloadSaves.get(project.id);
    const revision = options.baseRevision ?? this.revisions.get(project.id) ?? 0;
    const ticket = this.nextTicket(project.id);
    const response = await this.request(projectUrl(project.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.preconditionHeaders(revision) },
      body: JSON.stringify({
        project: prepared,
        ...(options.pin ? { pin: true } : {}),
        ...(options.pinPrevious ? { pinPrevious: true } : {}),
        ...(options.label ? { label: options.label } : {}),
      }),
    });
    if (response.status === 409) {
      const conflict = (await response.json()) as { revision: number; savedAt: number };
      // The conflict itself is authoritative straight from the server, so it
      // resyncs the tracked revision on its own rather than leaving the
      // client stuck resending the same stale precondition.
      this.trackRevision(project.id, conflict.revision, ticket);
      return { ok: false, conflict: { revision: conflict.revision, savedAt: conflict.savedAt } };
    }
    const saved = (await (await this.ensureOk(response, "Saving")).json()) as { revision: number };
    this.trackRevision(project.id, saved.revision, ticket);
    return { ok: true };
  }

  saveProjectOnUnload(project: Project, options: { pinPrevious?: boolean } = {}): boolean {
    const prepared = mapProjectImagesSync(project, (src) =>
      isDataUrl(src) ? (this.cachedUpload(src)?.url ?? null) : src,
    );
    if (!prepared) return false;
    const body = JSON.stringify({
      project: prepared,
      ...(options.pinPrevious ? { pinPrevious: true } : {}),
    });
    // Browsers cap keepalive bodies in bytes, so measure UTF-8 bytes, not characters.
    if (new TextEncoder().encode(body).byteLength >= UNLOAD_BODY_LIMIT) return false;
    const revision = this.revisions.get(project.id) ?? 0;
    const ticket = this.nextTicket(project.id);
    const settled = this.fetchImpl(projectUrl(project.id), {
      method: "PUT",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...this.preconditionHeaders(revision) },
      body,
    })
      .then(async (response) => {
        // If the page survives (unload cancelled), later saves need the new revision.
        if (!response.ok) return;
        const saved = (await response.json()) as { revision?: unknown };
        if (typeof saved.revision === "number") this.trackRevision(project.id, saved.revision, ticket);
      })
      .catch(() => undefined);
    this.pendingUnloadSaves.set(project.id, settled);
    void settled.then(() => {
      if (this.pendingUnloadSaves.get(project.id) === settled) this.pendingUnloadSaves.delete(project.id);
    });
    return true;
  }

  async deleteProject(id: string): Promise<void> {
    const response = await this.request(projectUrl(id), { method: "DELETE" });
    if (response.status !== 404) await this.ensureOk(response, "Deleting a project");
    this.revisions.delete(id);
    this.applied.delete(id);
    this.seq.delete(id);
  }

  async saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void> {
    await this.putState(activeProjectId, projectOrder);
  }

  private async putState(activeProjectId: string | null, projectOrder: string[]): Promise<void> {
    await this.ensureOk(
      await this.request("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProjectId, projectOrder }),
      }),
      "Saving project order",
    );
  }

  async resetAll(): Promise<void> {
    this.uploads.clear();
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as { projects: Array<{ id: string }> };
    for (const { id } of state.projects) await this.deleteProject(id);
    await this.putState(null, []);
  }

  async reloadProject(id: string): Promise<Project | null> {
    const ticket = this.nextTicket(id);
    const response = await this.request(projectUrl(id));
    if (response.status === 404) {
      // Gone server-side: forget everything tracked for it, so a save right
      // after (e.g. recreating it) is treated as brand new instead of
      // conflicting against a now-meaningless revision.
      this.revisions.delete(id);
      this.applied.delete(id);
      this.seq.delete(id);
      return null;
    }
    const stored = (await (await this.ensureOk(response, "Loading a project")).json()) as {
      revision: number;
      project: Project;
    };
    this.trackRevision(id, stored.revision, ticket);
    return stored.project;
  }

  async listHistory(id: string): Promise<HistoryVersion[]> {
    const response = await this.ensureOk(await this.request(`${projectUrl(id)}/history`), "Loading history");
    return (await response.json()) as HistoryVersion[];
  }

  async addHistory(project: Project, label: string): Promise<void> {
    const prepared = await mapProjectImages(project, (src) => this.externalize(src));
    await this.ensureOk(
      await this.request(`${projectUrl(project.id)}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: prepared, label }),
      }),
      "Saving to history",
    );
  }

  async restoreVersion(id: string, version: string): Promise<Project> {
    const ticket = this.nextTicket(id);
    const response = await this.ensureOk(
      await this.request(`${projectUrl(id)}/history/${encodeURIComponent(version)}/restore`, { method: "POST" }),
      "Restoring a version",
    );
    const restored = (await response.json()) as { revision: number; project: Project };
    this.trackRevision(id, restored.revision, ticket);
    return restored.project;
  }

  inlineProjectImages(project: Project): Promise<Project> {
    return mapProjectImages(project, async (src) => {
      if (!isServerImageUrl(src)) return src;
      const response = await this.ensureOk(await this.request(src), "Loading an image");
      const contentType = response.headers.get("Content-Type") ?? "image/png";
      return bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), contentType);
    });
  }
}

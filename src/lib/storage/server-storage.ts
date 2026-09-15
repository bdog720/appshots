/**
 * ServerStorage — saves projects through the container's storage API.
 * Remembers each project's revision for conflict detection and uploads inline
 * (data URL) images once, saving /api/images URLs in their place.
 */

import type { Project } from "../../types";
import {
  bytesToDataUrl,
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

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export class ServerStorage implements ServerProjectStorage {
  readonly mode = "server" as const;
  private readonly revisions = new Map<string, number>();
  private readonly uploads = new Map<string, Promise<string>>();
  private readonly uploaded = new Map<string, string>();
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(url, { credentials: "same-origin", ...init });
    } catch {
      throw new StorageError("Can't reach the AppShots server");
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

  private externalize(src: string): Promise<string> {
    if (!isDataUrl(src)) return Promise.resolve(src);
    const existing = this.uploads.get(src);
    if (existing) return existing;
    const upload = (async () => {
      const { bytes, contentType } = dataUrlToBytes(src);
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const response = await this.ensureOk(
        await this.request("/api/images", { method: "POST", headers: { "Content-Type": contentType }, body }),
        "Uploading an image",
      );
      const { url } = (await response.json()) as { url: string };
      this.uploaded.set(src, url);
      return url;
    })();
    this.uploads.set(src, upload);
    upload.catch(() => this.uploads.delete(src));
    return upload;
  }

  async load(): Promise<LoadedState> {
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as {
      activeProjectId: string | null;
      projects: Array<{ id: string }>;
    };
    const projects: Project[] = [];
    for (const { id } of state.projects) {
      const project = await this.reloadProject(id);
      if (project) projects.push(project);
    }
    return { projects, activeProjectId: state.activeProjectId };
  }

  async saveProject(project: Project, options: SaveOptions = {}): Promise<SaveResult> {
    const prepared = await mapProjectImages(project, (src) => this.externalize(src));
    const revision = options.baseRevision ?? this.revisions.get(project.id) ?? 0;
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
      return { ok: false, conflict: { revision: conflict.revision, savedAt: conflict.savedAt } };
    }
    const saved = (await (await this.ensureOk(response, "Saving")).json()) as { revision: number };
    this.revisions.set(project.id, saved.revision);
    return { ok: true };
  }

  saveProjectOnUnload(project: Project): boolean {
    const prepared = mapProjectImagesSync(project, (src) =>
      isDataUrl(src) ? (this.uploaded.get(src) ?? null) : src,
    );
    if (!prepared) return false;
    const body = JSON.stringify({ project: prepared });
    // Browsers cap keepalive bodies in bytes, so measure UTF-8 bytes, not characters.
    if (new TextEncoder().encode(body).byteLength >= UNLOAD_BODY_LIMIT) return false;
    const revision = this.revisions.get(project.id) ?? 0;
    void this.fetchImpl(projectUrl(project.id), {
      method: "PUT",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...this.preconditionHeaders(revision) },
      body,
    }).catch(() => undefined);
    return true;
  }

  async deleteProject(id: string): Promise<void> {
    const response = await this.request(projectUrl(id), { method: "DELETE" });
    if (response.status !== 404) await this.ensureOk(response, "Deleting a project");
    this.revisions.delete(id);
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
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as { projects: Array<{ id: string }> };
    for (const { id } of state.projects) await this.deleteProject(id);
    await this.putState(null, []);
  }

  async reloadProject(id: string): Promise<Project | null> {
    const response = await this.request(projectUrl(id));
    if (response.status === 404) return null;
    const stored = (await (await this.ensureOk(response, "Loading a project")).json()) as {
      revision: number;
      project: Project;
    };
    this.revisions.set(id, stored.revision);
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
    const response = await this.ensureOk(
      await this.request(`${projectUrl(id)}/history/${encodeURIComponent(version)}/restore`, { method: "POST" }),
      "Restoring a version",
    );
    const restored = (await response.json()) as { revision: number; project: Project };
    this.revisions.set(id, restored.revision);
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

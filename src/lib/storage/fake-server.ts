/**
 * In-memory double of the storage API (server/api.ts) for client tests.
 * Mirrors the real routes, precondition headers, status codes and JSON shapes;
 * image type detection and history retention are not modelled.
 */

import type { FetchLike } from "./server-storage";

const VERSION = /^\d{13}-\d+$/;

export const createFakeServer = () => {
  const projects = new Map<string, { revision: number; project: unknown }>();
  const images = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const history = new Map<string, unknown[]>();
  const state = { activeProjectId: null as string | null, projectOrder: [] as string[] };
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];
  let failStatus: number | null = null;
  let imageCounter = 0;

  /** Revision each POSTed history body was recorded against (real server: the current one). */
  const historyMeta = new WeakMap<object, { revision: number }>();

  /** Same shape as the real server's HistorySummary (server/store.ts listHistory). */
  const summarize = (entry: unknown, index: number, fallbackRevision: number) => {
    const record = (typeof entry === "object" && entry !== null ? entry : {}) as {
      label?: unknown;
      project?: { screenshots?: Array<{ headline?: unknown }> };
    };
    const screenshots = Array.isArray(record.project?.screenshots) ? record.project.screenshots : [];
    const headline = typeof screenshots[0]?.headline === "string" ? screenshots[0].headline : "";
    const revision = (typeof entry === "object" && entry !== null && historyMeta.get(entry)?.revision) || fallbackRevision;
    const savedAt = 1_757_900_000_000 + index;
    return {
      version: `${savedAt}-${revision}`,
      revision,
      savedAt,
      pinned: true,
      ...(typeof record.label === "string" ? { label: record.label } : {}),
      screenCount: screenshots.length,
      firstHeadline: headline.replace(/<[^>]*>/g, "").slice(0, 80),
    };
  };

  const json = (status: number, body: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fetch: FetchLike = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ method, url, headers, body });

    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      return json(status, { error: "forced failure" });
    }

    const parts = url.replace(/^\/api\//, "").split("/").map(decodeURIComponent);

    if (url === "/api/state" && method === "GET") {
      const listed = state.projectOrder.filter((id) => projects.has(id));
      const rest = [...projects.keys()].filter((id) => !listed.includes(id));
      const order = [...listed, ...rest];
      return json(200, {
        activeProjectId: state.activeProjectId && projects.has(state.activeProjectId) ? state.activeProjectId : null,
        projectOrder: order,
        projects: order.map((id) => ({ id, revision: projects.get(id)!.revision, savedAt: 1 })),
      });
    }
    if (url === "/api/state" && method === "PUT") {
      Object.assign(state, body);
      return new Response(null, { status: 204 });
    }
    if (url === "/api/images" && method === "POST") {
      const bytes = new Uint8Array(init.body as ArrayBuffer);
      const name = `${String(++imageCounter).padStart(64, "0")}.png`;
      images.set(name, { bytes, contentType: headers["content-type"] ?? "image/png" });
      return json(201, { url: `/api/images/${name}` });
    }
    if (parts[0] === "images" && method === "GET") {
      const image = images.get(parts[1]);
      if (!image) return json(404, { error: "image not found" });
      const { bytes } = image;
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return new Response(buffer, { status: 200, headers: { "Content-Type": image.contentType } });
    }
    if (parts[0] === "projects") {
      const id = parts[1];
      const stored = projects.get(id);
      if (parts.length === 2 && method === "GET") {
        return stored ? json(200, { ...stored, savedAt: 1 }) : json(404, { error: "project not found" });
      }
      if (parts.length === 2 && method === "PUT") {
        const match = headers["if-match"]?.replace(/"/g, "");
        const expected = headers["if-none-match"] === "*" ? 0 : match && /^\d+$/.test(match) ? Number(match) : null;
        if (expected === null) return json(428, { error: "If-Match or If-None-Match required" });
        const current = stored?.revision ?? 0;
        if (current !== expected) return json(409, { revision: current, savedAt: 1 });
        const record = body as { project: unknown };
        projects.set(id, { revision: current + 1, project: record.project });
        return json(200, { revision: current + 1, savedAt: 1 });
      }
      if (parts.length === 2 && method === "DELETE") {
        return projects.delete(id) ? new Response(null, { status: 204 }) : json(404, { error: "project not found" });
      }
      if (parts[2] === "history" && parts.length === 3 && method === "GET") {
        if (!stored) return json(404, { error: "project not found" });
        const summaries = (history.get(id) ?? []).map((entry, index) => summarize(entry, index, stored.revision));
        return json(200, summaries.reverse());
      }
      if (parts[2] === "history" && parts.length === 3 && method === "POST") {
        if (!stored) return json(404, { error: "project not found" });
        if (typeof body === "object" && body !== null) historyMeta.set(body, { revision: stored.revision });
        history.set(id, [...(history.get(id) ?? []), body]);
        return json(201, { ok: true });
      }
      if (parts[2] === "history" && parts.length === 5 && parts[4] === "restore" && method === "POST") {
        if (!VERSION.test(parts[3])) return json(400, { error: "invalid version" });
        if (!stored) return json(404, { error: "version not found" });
        const next = { revision: stored.revision + 1, project: { id, restoredFrom: parts[3] } };
        projects.set(id, next);
        return json(200, { ...next, savedAt: 2 });
      }
    }
    return json(404, { error: "not found" });
  };

  return {
    fetch,
    calls,
    projects,
    images,
    state,
    history,
    failNext: (status: number) => {
      failStatus = status;
    },
  };
};

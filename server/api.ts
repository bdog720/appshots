/**
 * HTTP handling for the AppShots storage server. Plain Request → Response so it
 * runs under Bun in production and under Vitest in tests.
 */

import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "./store";
import {
  MAX_IMAGE_BYTES,
  MAX_JSON_BYTES,
  isValidImageName,
  isValidProjectId,
  isValidVersion,
} from "./validation";

export interface ServerConfig {
  store: FileStore;
  writable: boolean;
  password: string | null;
  distDir: string | null;
  limits?: { imageBytes: number; jsonBytes: number };
}

const MAX_LABEL_LENGTH = 100;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const IMMUTABLE = "public, max-age=31536000, immutable";

/** JSON is never cached: stale state or revisions would defeat conflict detection. */
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

const fail = (status: number, message: string): Response => json(status, { error: message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAuthorized = (request: Request, password: string | null): boolean => {
  if (!password) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const payload = header.slice("Basic ".length).trim();
  if (!BASE64.test(payload)) return false;
  // Browsers send "user:password" UTF-8 encoded; atob would yield Latin-1 and never match non-ASCII passwords.
  const decoded = Buffer.from(payload, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const supplied = createHash("sha256").update(decoded.slice(separator + 1)).digest();
  const expected = createHash("sha256").update(password).digest();
  return timingSafeEqual(supplied, expected);
};

class BodyTooLarge extends Error {}
class BadJson extends Error {}

const readBytes = async (request: Request, limit: number): Promise<Uint8Array> => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new BodyTooLarge();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) throw new BodyTooLarge();
  return bytes;
};

const readJsonBody = async (request: Request, limit: number): Promise<unknown> => {
  const bytes = await readBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BadJson();
  }
};

/** `If-None-Match: *` → 0 (must not exist); `If-Match: "N"` → N; otherwise null. */
const expectedRevisionFrom = (request: Request): number | null => {
  if (request.headers.get("if-none-match")?.trim() === "*") return 0;
  const match = request.headers.get("if-match")?.trim().replace(/^"|"$/g, "");
  if (match && /^\d+$/.test(match)) return Number(match);
  return null;
};

const validLabel = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_LABEL_LENGTH;

const handleApi = async (request: Request, pathname: string, config: ServerConfig): Promise<Response> => {
  const { store } = config;
  const limits = config.limits ?? { imageBytes: MAX_IMAGE_BYTES, jsonBytes: MAX_JSON_BYTES };
  const method = request.method;
  const parts = pathname.slice("/api/".length).split("/");
  const isWrite = method !== "GET" && method !== "HEAD";
  const notWritable = () => fail(503, "storage is not writable");

  // /api/state
  if (parts.length === 1 && parts[0] === "state") {
    if (method === "GET") return json(200, await store.getState());
    if (method !== "PUT") return fail(405, "method not allowed");
    if (!config.writable) return notWritable();
    const body = await readJsonBody(request, limits.jsonBytes);
    if (
      !isRecord(body) ||
      !(body.activeProjectId === null || (typeof body.activeProjectId === "string" && isValidProjectId(body.activeProjectId))) ||
      !Array.isArray(body.projectOrder) ||
      !body.projectOrder.every((id) => typeof id === "string" && isValidProjectId(id))
    ) {
      return fail(400, "invalid state");
    }
    await store.putState({ activeProjectId: body.activeProjectId, projectOrder: body.projectOrder as string[] });
    return new Response(null, { status: 204 });
  }

  // /api/images and /api/images/:file
  if (parts[0] === "images") {
    if (parts.length === 1) {
      if (method !== "POST") return fail(405, "method not allowed");
      if (!config.writable) return notWritable();
      const name = await store.putImage(await readBytes(request, limits.imageBytes));
      if (!name) return fail(415, "only PNG, JPEG and WebP images are supported");
      return json(201, { url: `/api/images/${name}` });
    }
    if (parts.length === 2) {
      if (method !== "GET") return fail(405, "method not allowed");
      if (!isValidImageName(parts[1])) return fail(400, "invalid image name");
      const image = await store.readImage(parts[1]);
      if (!image) return fail(404, "image not found");
      return new Response(image.bytes, {
        status: 200,
        headers: {
          "Content-Type": image.contentType,
          "Cache-Control": IMMUTABLE,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  // /api/projects/:id[/history[/:version/restore]]
  if (parts[0] === "projects" && parts.length >= 2) {
    const id = parts[1];
    if (!isValidProjectId(id)) return fail(400, "invalid project id");
    if (isWrite && !config.writable) return notWritable();

    if (parts.length === 2) {
      if (method === "GET") {
        const stored = await store.getProject(id);
        if (!stored) return fail(404, "project not found");
        return json(200, stored, { ETag: `"${stored.revision}"` });
      }
      if (method === "PUT") {
        const expectedRevision = expectedRevisionFrom(request);
        if (expectedRevision === null) return fail(428, "If-Match or If-None-Match required");
        const body = await readJsonBody(request, limits.jsonBytes);
        if (!isRecord(body) || !isRecord(body.project)) return fail(400, "body must include a project object");
        if (body.label !== undefined && !validLabel(body.label)) return fail(400, "invalid label");
        const result = await store.putProject(id, body.project, {
          expectedRevision,
          pin: body.pin === true,
          pinPrevious: body.pinPrevious === true,
          ...(typeof body.label === "string" ? { label: body.label } : {}),
        });
        if (!result.ok) return json(409, result.current);
        return json(200, { revision: result.revision, savedAt: result.savedAt });
      }
      if (method === "DELETE") {
        return (await store.deleteProject(id)) ? new Response(null, { status: 204 }) : fail(404, "project not found");
      }
      return fail(405, "method not allowed");
    }

    if (parts[2] === "history") {
      if (parts.length === 3) {
        if (method === "GET") {
          const history = await store.listHistory(id);
          return history ? json(200, history) : fail(404, "project not found");
        }
        if (method === "POST") {
          const body = await readJsonBody(request, limits.jsonBytes);
          if (!isRecord(body) || !isRecord(body.project) || !validLabel(body.label)) {
            return fail(400, "body must include a project object and a label");
          }
          return (await store.addHistory(id, body.project, body.label))
            ? json(201, { ok: true })
            : fail(404, "project not found");
        }
        return fail(405, "method not allowed");
      }
      if (parts.length === 5 && parts[4] === "restore") {
        if (method !== "POST") return fail(405, "method not allowed");
        if (!isValidVersion(parts[3])) return fail(400, "invalid version");
        const restored = await store.restoreVersion(id, parts[3]);
        return restored ? json(200, restored) : fail(404, "version not found");
      }
    }
  }

  return fail(404, "not found");
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};

const fileResponse = async (file: string, cacheControl: string): Promise<Response> =>
  new Response(new Uint8Array(await readFile(file)), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });

const isFile = (file: string): Promise<boolean> =>
  stat(file).then(
    (info) => info.isFile(),
    () => false,
  );

const serveStatic = async (pathname: string, distDir: string | null): Promise<Response> => {
  if (!distDir) return fail(404, "not found");
  const root = path.resolve(distDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return fail(400, "bad path");
  }
  const target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return fail(404, "not found");

  const indexFile = path.join(root, "index.html");
  if (target === root || target === indexFile) return fileResponse(indexFile, "no-cache");
  if (await isFile(target)) {
    const cache = decoded.startsWith("/assets/") ? IMMUTABLE : "no-cache";
    return fileResponse(target, cache);
  }
  if (decoded.startsWith("/assets/")) return fail(404, "not found");
  return fileResponse(indexFile, "no-cache");
};

export const handleRequest = async (request: Request, config: ServerConfig): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/health") {
    return json(200, { storage: "server", writable: config.writable, auth: Boolean(config.password) });
  }
  if (!isAuthorized(request, config.password)) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="AppShots"' },
    });
  }

  try {
    if (pathname.startsWith("/api/")) return await handleApi(request, pathname, config);
    return await serveStatic(pathname, config.distDir);
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail(413, "request body too large");
    if (error instanceof BadJson) return fail(400, "invalid JSON");
    console.error("Unhandled request error", error);
    return fail(500, "internal error");
  }
};

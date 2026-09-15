/** @vitest-environment node */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRequest, type ServerConfig } from "./api";
import { FileStore } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

let root: string;
let config: ServerConfig;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "appshots-api-"));
  const dataDir = path.join(root, "data");
  const distDir = path.join(root, "dist");
  await mkdir(path.join(distDir, "assets"), { recursive: true });
  await writeFile(path.join(distDir, "index.html"), "<!doctype html><title>AppShots</title>");
  await writeFile(path.join(distDir, "assets", "app-abc.js"), "console.log(1)");
  const store = new FileStore(dataDir);
  const { writable } = await store.init();
  config = { store, writable, password: null, distDir };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const call = (method: string, pathname: string, init: { body?: RequestInit["body"]; headers?: Record<string, string> } = {}) =>
  handleRequest(new Request(`http://localhost${pathname}`, { method, ...init }), config);

const putJson = (pathname: string, body: unknown, headers: Record<string, string> = {}) =>
  call("PUT", pathname, { body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });

const project = (headline: string) => ({ name: "Demo", screenshots: [{ headline }] });

describe("health and auth", () => {
  it("reports server storage", async () => {
    const response = await call("GET", "/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ storage: "server", writable: true, auth: false });
  });

  it("requires Basic auth for everything except health when a password is set", async () => {
    config.password = "s3cret";
    expect((await call("GET", "/api/health")).status).toBe(200);

    const denied = await call("GET", "/api/state");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toBe('Basic realm="AppShots"');
    expect((await call("GET", "/")).status).toBe(401);

    const wrong = { Authorization: `Basic ${btoa("me:nope")}` };
    expect((await call("GET", "/api/state", { headers: wrong })).status).toBe(401);

    const right = { Authorization: `Basic ${btoa("anyone:s3cret")}` };
    expect((await call("GET", "/api/state", { headers: right })).status).toBe(200);
  });

  it("accepts non-ASCII passwords encoded as UTF-8 the way browsers send them", async () => {
    config.password = "pässwörd";
    const header = `Basic ${Buffer.from("user:pässwörd", "utf8").toString("base64")}`;
    expect((await call("GET", "/api/state", { headers: { Authorization: header } })).status).toBe(200);

    const wrong = `Basic ${Buffer.from("user:passwort", "utf8").toString("base64")}`;
    expect((await call("GET", "/api/state", { headers: { Authorization: wrong } })).status).toBe(401);
  });

  it("rejects malformed Basic credentials", async () => {
    config.password = "s3cret";
    const attempt = (authorization: string) => call("GET", "/api/state", { headers: { Authorization: authorization } });
    expect((await attempt("Basic !!not*base64!!")).status).toBe(401);
    expect((await attempt(`Basic ${Buffer.from("s3cret", "utf8").toString("base64")}`)).status).toBe(401);
    expect((await attempt(`Bearer ${btoa("anyone:s3cret")}`)).status).toBe(401);
  });

  it("marks API JSON responses as not cacheable", async () => {
    expect((await call("GET", "/api/health")).headers.get("Cache-Control")).toBe("no-store");
    expect((await call("GET", "/api/state")).headers.get("Cache-Control")).toBe("no-store");
    expect((await call("GET", "/api/projects/missing")).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("projects", () => {
  it("creates, reads, updates and deletes with revision preconditions", async () => {
    expect((await putJson("/api/projects/p1", { project: project("v1") })).status).toBe(428);

    const created = await putJson("/api/projects/p1", { project: project("v1") }, { "If-None-Match": "*" });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ revision: 1 });

    const read = await call("GET", "/api/projects/p1");
    expect(read.headers.get("ETag")).toBe('"1"');
    expect(await read.json()).toMatchObject({ revision: 1, project: project("v1") });

    const updated = await putJson("/api/projects/p1", { project: project("v2") }, { "If-Match": '"1"' });
    expect(await updated.json()).toMatchObject({ revision: 2 });

    const stale = await putJson("/api/projects/p1", { project: project("v3") }, { "If-Match": '"1"' });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ revision: 2 });

    expect((await call("DELETE", "/api/projects/p1")).status).toBe(204);
    expect((await call("GET", "/api/projects/p1")).status).toBe(404);
    expect((await call("DELETE", "/api/projects/p1")).status).toBe(404);
  });

  it("validates ids and bodies", async () => {
    expect((await call("GET", "/api/projects/bad.id")).status).toBe(400);
    expect((await putJson("/api/projects/p1", { project: "nope" }, { "If-None-Match": "*" })).status).toBe(400);
    expect(
      (await call("PUT", "/api/projects/p1", { body: "{not json", headers: { "If-None-Match": "*" } })).status,
    ).toBe(400);
    config.limits = { imageBytes: 1000, jsonBytes: 10 };
    expect((await putJson("/api/projects/p1", { project: project("long") }, { "If-None-Match": "*" })).status).toBe(413);
  });

  it("rejects a declared Content-Length over the limit before reading the body", async () => {
    config.limits = { imageBytes: 1000, jsonBytes: 1000 };
    // The actual bodies fit the limits, so only the declared length can trigger 413.
    const image = await call("POST", "/api/images", { body: PNG, headers: { "Content-Length": "999999" } });
    expect(image.status).toBe(413);
    const state = await call("PUT", "/api/state", {
      body: JSON.stringify({ activeProjectId: null, projectOrder: [] }),
      headers: { "Content-Length": "999999" },
    });
    expect(state.status).toBe(413);
  });

  it("returns 405 for unsupported methods on known routes", async () => {
    expect((await call("POST", "/api/projects/p1")).status).toBe(405);
  });
});

describe("state", () => {
  it("round-trips active project and order", async () => {
    await putJson("/api/projects/p1", { project: project("v1") }, { "If-None-Match": "*" });
    expect((await putJson("/api/state", { activeProjectId: "../x", projectOrder: [] })).status).toBe(400);
    expect((await putJson("/api/state", { activeProjectId: "p1", projectOrder: ["p1"] })).status).toBe(204);
    const state = await (await call("GET", "/api/state")).json();
    expect(state).toMatchObject({ activeProjectId: "p1", projectOrder: ["p1"], projects: [{ id: "p1", revision: 1 }] });
  });
});

describe("images", () => {
  it("uploads and serves hashed images", async () => {
    const uploaded = await call("POST", "/api/images", { body: PNG });
    expect(uploaded.status).toBe(201);
    const { url } = (await uploaded.json()) as { url: string };
    expect(url).toMatch(/^\/api\/images\/[a-f0-9]{64}\.png$/);

    const served = await call("GET", url);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await served.arrayBuffer()))).toEqual(Array.from(PNG));
  });

  it("rejects unsupported and oversized uploads", async () => {
    expect((await call("POST", "/api/images", { body: "<svg/>" })).status).toBe(415);
    config.limits = { imageBytes: 4, jsonBytes: 1000 };
    expect((await call("POST", "/api/images", { body: PNG })).status).toBe(413);
    expect((await call("GET", `/api/images/${"f".repeat(64)}.png`)).status).toBe(404);
    expect((await call("GET", "/api/images/evil.svg")).status).toBe(400);
  });
});

describe("history", () => {
  it("lists, adds and restores versions", async () => {
    await putJson("/api/projects/p1", { project: project("first") }, { "If-None-Match": "*" });
    const list = (await (await call("GET", "/api/projects/p1/history")).json()) as Array<{ version: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ revision: 1, firstHeadline: "first", screenCount: 1 });

    const added = await call("POST", "/api/projects/p1/history", {
      body: JSON.stringify({ project: project("local"), label: "Discarded local changes" }),
    });
    expect(added.status).toBe(201);

    const restored = await call("POST", `/api/projects/p1/history/${list[0].version}/restore`);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ revision: 2, project: project("first") });

    expect((await call("POST", "/api/projects/p1/history/nope/restore")).status).toBe(400);
    expect((await call("GET", "/api/projects/missing/history")).status).toBe(404);
  });
});

describe("read-only storage", () => {
  it("refuses writes but allows reads", async () => {
    config.writable = false;
    expect((await putJson("/api/projects/p1", { project: project("x") }, { "If-None-Match": "*" })).status).toBe(503);
    expect((await call("POST", "/api/images", { body: PNG })).status).toBe(503);
    expect((await call("GET", "/api/state")).status).toBe(200);
  });
});

describe("static files", () => {
  it("serves the app with SPA fallback and caching rules", async () => {
    const index = await call("GET", "/");
    expect(index.status).toBe(200);
    expect(index.headers.get("Cache-Control")).toBe("no-cache");
    expect(await index.text()).toContain("AppShots");

    const asset = await call("GET", "/assets/app-abc.js");
    expect(asset.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(asset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    expect((await call("GET", "/assets/missing.js")).status).toBe(404);
    expect(await (await call("GET", "/some/client/route")).text()).toContain("AppShots");
    // "%2F" keeps the slash encoded through URL parsing, so the decoded path escapes dist/.
    expect((await call("GET", "/..%2Fsecret.txt")).status).toBe(404);
    expect((await call("GET", "/api/unknown")).status).toBe(404);
  });

  it("serves extra static types with nosniff", async () => {
    await writeFile(path.join(root, "dist", "sitemap.xml"), "<urlset/>");
    const sitemap = await call("GET", "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("Content-Type")).toBe("application/xml");
    expect(sitemap.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await call("GET", "/")).headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

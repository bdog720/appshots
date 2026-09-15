import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { createFakeServer } from "./fake-server";
import { ServerStorage, UNLOAD_BODY_LIMIT } from "./server-storage";
import { StorageError } from "./types";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const project = (id: string, src: string | null = null, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    screenshots: [{ devices: [{ screenshotSrc: src }], overlayImages: [] }],
    ...extra,
  }) as unknown as Project;

const setup = () => {
  const server = createFakeServer();
  return { server, storage: new ServerStorage(server.fetch) };
};

describe("ServerStorage load and save", () => {
  it("loads projects and remembers their revisions", async () => {
    const { server, storage } = setup();
    server.projects.set("a", { revision: 3, project: project("a") });
    server.projects.set("b", { revision: 1, project: project("b") });
    server.state.activeProjectId = "b";
    server.state.projectOrder = ["b", "a"];

    const loaded = await storage.load();
    expect(storage.mode).toBe("server");
    expect(loaded.activeProjectId).toBe("b");
    expect(loaded.projects.map((p) => p.id)).toEqual(["b", "a"]);

    await storage.saveProject(project("a"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"3"');
  });

  it("creates new projects and then updates them", async () => {
    const { server, storage } = setup();
    expect(await storage.saveProject(project("new"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-none-match"]).toBe("*");
    await storage.saveProject(project("new"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
    expect(server.projects.get("new")?.revision).toBe(2);
  });

  it("reports conflicts without updating the remembered revision", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    server.projects.set("p", { revision: 5, project: project("p") });
    expect(await storage.saveProject(project("p"))).toEqual({ ok: false, conflict: { revision: 5, savedAt: 1 } });
    await storage.saveProject(project("p"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
  });

  it("sends baseRevision, pin, pinPrevious and label when given", async () => {
    const { server, storage } = setup();
    server.projects.set("p", { revision: 5, project: project("p") });
    await storage.saveProject(project("p"), { baseRevision: 5, pinPrevious: true, pin: true, label: "Saved" });
    const call = server.calls.at(-1)!;
    expect(call.headers["if-match"]).toBe('"5"');
    expect(call.body).toMatchObject({ pin: true, pinPrevious: true, label: "Saved" });
  });

  it("uploads data URL images once and saves URLs, leaving the project untouched", async () => {
    const { server, storage } = setup();
    const withImage = project("p", PNG_DATA_URL);
    await storage.saveProject(withImage);
    await storage.saveProject(withImage);

    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(1);
    const saved = server.projects.get("p")!.project as Project;
    expect(saved.screenshots[0].devices[0].screenshotSrc).toMatch(/^\/api\/images\//);
    expect(withImage.screenshots[0].devices[0].screenshotSrc).toBe(PNG_DATA_URL);
    expect(server.images.values().next().value?.contentType).toBe("image/png");
  });

  it("uploads an image used twice in one save only once", async () => {
    const { server, storage } = setup();
    const twice = {
      ...project("p"),
      screenshots: [
        { devices: [{ screenshotSrc: PNG_DATA_URL }], overlayImages: [{ src: PNG_DATA_URL }] },
      ],
    } as unknown as Project;
    await storage.saveProject(twice);
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(1);
  });

  it("turns failures into StorageErrors", async () => {
    const { server, storage } = setup();
    server.failNext(500);
    await expect(storage.saveProject(project("p", PNG_DATA_URL))).rejects.toBeInstanceOf(StorageError);

    const offline = new ServerStorage(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(offline.load()).rejects.toThrow("Can't reach the AppShots server");
  });

  it("keeps the status and the server's error message", async () => {
    const { server, storage } = setup();
    server.failNext(413);
    await expect(storage.saveProject(project("p"))).rejects.toMatchObject({
      status: 413,
      message: "Saving failed: forced failure",
    });
  });

  it("retries an image upload that failed", async () => {
    const { server, storage } = setup();
    server.failNext(503);
    await expect(storage.saveProject(project("p", PNG_DATA_URL))).rejects.toBeInstanceOf(StorageError);
    expect(await storage.saveProject(project("p", PNG_DATA_URL))).toEqual({ ok: true });
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(2);
  });
});

describe("ServerStorage other operations", () => {
  it("deletes projects, saves meta and resets everything", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("a"));
    await storage.saveProject(project("b"));
    await storage.saveMeta("b", ["b", "a"]);
    expect(server.state).toEqual({ activeProjectId: "b", projectOrder: ["b", "a"] });

    await storage.deleteProject("a");
    expect(server.projects.has("a")).toBe(false);

    await storage.resetAll();
    expect(server.projects.size).toBe(0);
    expect(server.state).toEqual({ activeProjectId: null, projectOrder: [] });
  });

  it("reloads a project, lists and adds history, and restores versions", async () => {
    const { server, storage } = setup();
    server.projects.set("p", { revision: 2, project: project("p") });
    expect((await storage.reloadProject("p"))?.id).toBe("p");
    expect(await storage.reloadProject("missing")).toBeNull();

    await storage.addHistory(project("p", PNG_DATA_URL), "Discarded local changes");
    const added = server.history.get("p")?.[0] as { label: string; project: Project };
    expect(added.label).toBe("Discarded local changes");
    expect(added.project.screenshots[0].devices[0].screenshotSrc).toMatch(/^\/api\/images\//);
    expect(await storage.listHistory("p")).toHaveLength(1);

    const restored = await storage.restoreVersion("p", "1757900000000-1");
    expect(restored).toMatchObject({ id: "p", restoredFrom: "1757900000000-1" });
    await storage.saveProject(project("p"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"3"');
  });

  it("inlines server images as data URLs for export", async () => {
    const { storage } = setup();
    await storage.saveProject(project("p", PNG_DATA_URL));
    const stored = await storage.reloadProject("p");
    const inlined = await storage.inlineProjectImages(stored!);
    expect(inlined.screenshots[0].devices[0].screenshotSrc).toBe(PNG_DATA_URL);
  });

  it("saves on unload with keepalive only when it can", async () => {
    const { server, storage } = setup();
    const fetchSpy = vi.fn(server.fetch);
    const spied = new ServerStorage(fetchSpy);
    await spied.saveProject(project("p"));

    expect(spied.saveProjectOnUnload(project("p"))).toBe(true);
    expect(fetchSpy.mock.calls.at(-1)?.[1]).toMatchObject({ method: "PUT", keepalive: true });

    expect(spied.saveProjectOnUnload(project("p", "data:image/png;base64,AAAA"))).toBe(false);
    const huge = project("p", null, { notes: "x".repeat(UNLOAD_BODY_LIMIT) });
    expect(spied.saveProjectOnUnload(huge)).toBe(false);
    expect(storage.mode).toBe("server");
  });

  it("measures the unload limit in bytes, not characters", async () => {
    const { server, storage } = setup();
    // Fewer characters than the limit, but "é" is two bytes in UTF-8.
    const accented = project("p", null, { notes: "é".repeat(UNLOAD_BODY_LIMIT / 2 + 100) });
    expect(storage.saveProjectOnUnload(accented)).toBe(false);
    expect(server.calls).toHaveLength(0);
  });

  it("sends unload saves on an image already uploaded", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p", PNG_DATA_URL));
    expect(storage.saveProjectOnUnload(project("p", PNG_DATA_URL))).toBe(true);
    const body = server.calls.at(-1)?.body as { project: Project };
    expect(body.project.screenshots[0].devices[0].screenshotSrc).toMatch(/^\/api\/images\//);
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
  });
});

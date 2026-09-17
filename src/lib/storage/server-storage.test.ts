import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { createFakeServer } from "./fake-server";
import { ServerStorage, UNLOAD_BODY_LIMIT, UPLOAD_CACHE_TTL_MS, type FetchLike } from "./server-storage";
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

/** A server whose reads of one project fail with a 500 the first `times` times. */
const failingReadsOf = (
  server: ReturnType<typeof createFakeServer>,
  url: string,
  times: number,
): FetchLike => {
  let left = times;
  return async (input, init) => {
    if (input === url && left > 0) {
      left -= 1;
      return new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return server.fetch(input, init);
  };
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

  it("retries a project read that blips once during a load", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 3, project: project("a") });
    server.projects.set("b", { revision: 1, project: project("b") });
    const storage = new ServerStorage(failingReadsOf(server, "/api/projects/b", 1));

    const loaded = await storage.load();
    expect(loaded.projects.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("skips a project it can't read instead of failing the whole load", async () => {
    // A load that rejects tells the app the container won't hand over its
    // state at all, which demotes the session to browser storage; one
    // unreadable project must not do that. The file is left alone, so the
    // project is back on the next load.
    const server = createFakeServer();
    server.projects.set("a", { revision: 3, project: project("a") });
    server.projects.set("b", { revision: 1, project: project("b") });
    const storage = new ServerStorage(failingReadsOf(server, "/api/projects/b", 99));

    const loaded = await storage.load();
    expect(loaded.projects.map((p) => p.id)).toEqual(["a"]);
  });

  it("still fails the load when the state itself can't be read", async () => {
    const { server, storage } = setup();
    server.projects.set("a", { revision: 3, project: project("a") });
    server.failNext(500);
    await expect(storage.load()).rejects.toThrow(StorageError);
  });

  it("creates new projects and then updates them", async () => {
    const { server, storage } = setup();
    expect(await storage.saveProject(project("new"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-none-match"]).toBe("*");
    await storage.saveProject(project("new"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
    expect(server.projects.get("new")?.revision).toBe(2);
  });

  it("resyncs the remembered revision from a conflict's reported revision", async () => {
    // A conflict is authoritative information straight from the server, so it
    // should correct the tracked revision on its own — otherwise an ordinary
    // conflict leaves the client stuck resending the same stale If-Match
    // forever until the user explicitly resolves it (Keep mine / Load theirs).
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    server.projects.set("p", { revision: 5, project: project("p") });
    expect(await storage.saveProject(project("p"))).toEqual({ ok: false, conflict: { revision: 5, savedAt: 1 } });
    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"5"');
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
    await expect(offline.load()).rejects.toThrow("Can't reach the Breezel server");
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
    const listed = await storage.listHistory("p");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual({
      version: expect.stringMatching(/^\d{13}-\d+$/),
      revision: 2,
      savedAt: expect.any(Number),
      pinned: true,
      label: "Discarded local changes",
      screenCount: 1,
      firstHeadline: "",
    });

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
    const { server } = setup();
    const fetchSpy = vi.fn(server.fetch);
    const spied = new ServerStorage(fetchSpy);
    await spied.saveProject(project("p"));

    expect(spied.saveProjectOnUnload(project("p"))).toBe(true);
    expect(fetchSpy.mock.calls.at(-1)?.[1]).toMatchObject({ method: "PUT", keepalive: true });

    expect(spied.saveProjectOnUnload(project("p", "data:image/png;base64,AAAA"))).toBe(false);
    const huge = project("p", null, { notes: "x".repeat(UNLOAD_BODY_LIMIT) });
    expect(spied.saveProjectOnUnload(huge)).toBe(false);
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

  it("picks up the revision from an unload save before the next save", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    expect(storage.saveProjectOnUnload(project("p"))).toBe(true);

    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"2"');
    expect(server.projects.get("p")?.revision).toBe(3);
  });

  it("includes pinPrevious in an unload save when asked (e.g. unloading a live conflict)", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    expect(storage.saveProjectOnUnload(project("p"), { pinPrevious: true })).toBe(true);
    expect(server.calls.at(-1)?.body).toMatchObject({ pinPrevious: true });
  });

  it("omits pinPrevious from an ordinary unload save", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    expect(storage.saveProjectOnUnload(project("p"))).toBe(true);
    expect(server.calls.at(-1)?.body).not.toHaveProperty("pinPrevious");
  });

  it("keeps a restored revision even when a slower save's response lands after it", async () => {
    const server = createFakeServer();
    let delaySave = false;
    let releaseSave: (() => void) | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (delaySave && url === "/api/projects/p" && method === "PUT") {
        const response = await server.fetch(url, init);
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
        return response;
      }
      return server.fetch(url, init);
    };
    const storage = new ServerStorage(fetchImpl);

    await storage.saveProject(project("p")); // revision 0 -> 1

    delaySave = true;
    const delayedSave = storage.saveProject(project("p")); // sends if-match "1"; server moves to 2, response held back
    await vi.waitFor(() => expect(releaseSave).toBeDefined());

    // A restore completes first, moving the server (and the tracked revision) to 3.
    await storage.restoreVersion("p", "1757900000000-1");

    // Now the slower save's response (revision 2) arrives.
    delaySave = false;
    releaseSave!();
    expect(await delayedSave).toEqual({ ok: true });

    // The next save must use the restored revision, not the stale one from the slow save.
    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"3"');
  });

  it("lets reloadProject correct the tracked revision downward (e.g. after a backup restore)", async () => {
    // The data directory can be restored from a backup, or another client can
    // delete and recreate the same id — either way the server's revision can
    // legitimately be LOWER than what this client last saw. The guard must be
    // about response ordering, not magnitude, so a genuinely lower value from
    // a fresher request has to win.
    const { server, storage } = setup();
    await storage.saveProject(project("p")); // tracked -> 1
    await storage.saveProject(project("p")); // tracked -> 2
    server.projects.set("p", { revision: 1, project: project("p") }); // e.g. restored from backup

    expect((await storage.reloadProject("p"))?.id).toBe("p");
    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
  });

  it("lets an explicit save against a lower server revision resync the client instead of wedging it", async () => {
    // Mirrors "Keep mine" after a server rollback: tracked is far ahead (7),
    // the server is actually behind (1), and the explicit baseRevision comes
    // from the conflict payload rather than the client's stale map. Each such
    // save must correct the tracked revision immediately — not require the
    // server to "catch up" past the stale value before saves work again.
    const { server, storage } = setup();
    for (let i = 0; i < 7; i += 1) await storage.saveProject(project("p")); // tracked -> 7
    server.projects.set("p", { revision: 1, project: project("p") }); // e.g. restored from backup

    expect(await storage.saveProject(project("p"), { baseRevision: 1, pinPrevious: true })).toEqual({ ok: true });

    // Resynced to 2 (not stuck refusing to move below 7), so the very next
    // save succeeds on the first try instead of looping through more 409s.
    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"2"');
  });

  it("clears revision tracking when reloadProject finds the project already gone", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p")); // tracked -> 1
    server.projects.delete("p"); // e.g. deleted from another client

    expect(await storage.reloadProject("p")).toBeNull();

    // A recreate must be treated as brand new, not conflict against the stale
    // tracked revision (which would otherwise cost a round trip and a
    // spurious conflict banner before self-correcting).
    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-none-match"]).toBe("*");
  });

  it("clears revision tracking on delete so a recreated project starts fresh", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    await storage.saveProject(project("p")); // tracked -> 2
    await storage.deleteProject("p");

    expect(await storage.saveProject(project("p"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-none-match"]).toBe("*");
  });

  it("loads projects in parallel and keeps their order", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 1, project: project("a") });
    server.projects.set("b", { revision: 1, project: project("b") });
    server.state.projectOrder = ["b", "a"];
    const gates: Array<() => void> = [];
    const gated: FetchLike = async (url, init) => {
      if (url.startsWith("/api/projects/")) await new Promise<void>((open) => gates.push(open));
      return server.fetch(url, init);
    };

    const loading = new ServerStorage(gated).load();
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    [...gates].reverse().forEach((open) => open());
    expect((await loading).projects.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("ServerStorage upload cache", () => {
  it("re-uploads an image once its cache entry is older than the TTL", async () => {
    const server = createFakeServer();
    let clock = 1_000_000;
    const storage = new ServerStorage(server.fetch, { now: () => clock });
    await storage.saveProject(project("p", PNG_DATA_URL));
    clock += UPLOAD_CACHE_TTL_MS - 1;
    await storage.saveProject(project("p", PNG_DATA_URL));
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(1);

    clock += 2;
    await storage.saveProject(project("p", PNG_DATA_URL));
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(2);
  });

  it("treats a stale upload as missing on unload", async () => {
    const server = createFakeServer();
    let clock = 1_000_000;
    const storage = new ServerStorage(server.fetch, { now: () => clock });
    await storage.saveProject(project("p", PNG_DATA_URL));
    clock += UPLOAD_CACHE_TTL_MS + 1;
    expect(storage.saveProjectOnUnload(project("p", PNG_DATA_URL))).toBe(false);
  });

  it("forgets uploads on reset", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p", PNG_DATA_URL));
    await storage.resetAll();
    await storage.saveProject(project("p", PNG_DATA_URL));
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(2);
  });

  it("wraps an unreadable data URL in a StorageError", async () => {
    const { storage } = setup();
    await expect(storage.saveProject(project("p", "data:image/png;base64,@@@@"))).rejects.toThrow(
      new StorageError("An image couldn't be read"),
    );
    await expect(storage.saveProject(project("q", "data:image/png"))).rejects.toThrow(
      new StorageError("An image couldn't be read"),
    );
  });
});

describe("ServerStorage image conversion", () => {
  const GIF_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

  it("converts unsupported image types to PNG once before uploading", async () => {
    const server = createFakeServer();
    const convertImage = vi.fn(async () => PNG_DATA_URL);
    const storage = new ServerStorage(server.fetch, { convertImage });
    const gif = project("p", GIF_DATA_URL);

    await storage.saveProject(gif);
    await storage.saveProject(gif);

    expect(convertImage).toHaveBeenCalledTimes(1);
    expect(convertImage).toHaveBeenCalledWith(GIF_DATA_URL);
    const uploads = server.calls.filter((call) => call.url === "/api/images");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].headers["content-type"]).toBe("image/png");
    expect(Array.from(server.images.values().next().value!.bytes)).toEqual(
      Array.from(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    );
    expect(gif.screenshots[0].devices[0].screenshotSrc).toBe(GIF_DATA_URL);
  });

  it("uploads PNG, JPEG and WebP as they are", async () => {
    const server = createFakeServer();
    const convertImage = vi.fn(async () => PNG_DATA_URL);
    const storage = new ServerStorage(server.fetch, { convertImage });
    const mixed = {
      ...project("p"),
      screenshots: [
        {
          devices: [{ screenshotSrc: PNG_DATA_URL }, { screenshotSrc: "data:image/jpeg;base64,/9j/4A==" }],
          overlayImages: [{ src: "data:image/webp;base64,UklGRg==" }],
        },
      ],
    } as unknown as Project;

    await storage.saveProject(mixed);
    expect(convertImage).not.toHaveBeenCalled();
    expect(server.calls.filter((call) => call.url === "/api/images").map((call) => call.headers["content-type"])).toEqual(
      expect.arrayContaining(["image/png", "image/jpeg", "image/webp"]),
    );
  });

  it("reports an image that can't be converted", async () => {
    const server = createFakeServer();
    const storage = new ServerStorage(server.fetch, {
      convertImage: async () => {
        throw new Error("decode failed");
      },
    });
    await expect(storage.saveProject(project("p", GIF_DATA_URL))).rejects.toThrow(
      new StorageError("An image couldn't be converted for saving"),
    );
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(0);
  });
});

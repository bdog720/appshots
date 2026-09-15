/** @vitest-environment node */
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let dir: string;
let clock: number;
let store: FileStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "appshots-"));
  clock = new Date(2026, 8, 15, 8, 0).getTime();
  store = new FileStore(dir, () => clock);
  await store.init();
});

afterEach(async () => {
  await chmod(dir, 0o700).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

const listFilesRecursive = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true });
  return entries.map(String);
};

describe("FileStore init", () => {
  it("creates the data layout and reports writable", async () => {
    expect(await store.init()).toEqual({ writable: true });
    const entries = await readdir(dir);
    expect(entries).toEqual(expect.arrayContaining(["projects", "images"]));
  });

  it("reports an unwritable data directory", async () => {
    if (process.getuid?.() === 0) return; // root ignores permissions
    const locked = await mkdtemp(path.join(os.tmpdir(), "appshots-locked-"));
    await chmod(locked, 0o500);
    try {
      expect(await new FileStore(locked).init()).toEqual({ writable: false });
    } finally {
      await chmod(locked, 0o700);
      await rm(locked, { recursive: true, force: true });
    }
  });
});

describe("FileStore projects", () => {
  it("creates, reads and updates a project with revisions", async () => {
    expect(await store.putProject("p1", { name: "One" }, { expectedRevision: 0 })).toEqual({
      ok: true,
      revision: 1,
      savedAt: clock,
    });
    expect(await store.getProject("p1")).toEqual({ revision: 1, savedAt: clock, project: { name: "One" } });

    clock += 1000;
    expect(await store.putProject("p1", { name: "Two" }, { expectedRevision: 1 })).toEqual({
      ok: true,
      revision: 2,
      savedAt: clock,
    });
    expect((await store.getProject("p1"))?.project).toEqual({ name: "Two" });
  });

  it("rejects stale or conflicting writes with the current revision", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    const firstSavedAt = clock;
    expect(await store.putProject("p1", { v: 2 }, { expectedRevision: 0 })).toEqual({
      ok: false,
      current: { revision: 1, savedAt: firstSavedAt },
    });
    clock += 1000;
    await store.putProject("p1", { v: 2 }, { expectedRevision: 1 });
    expect(await store.putProject("p1", { v: 3 }, { expectedRevision: 1 })).toEqual({
      ok: false,
      current: { revision: 2, savedAt: clock },
    });
    expect(await store.putProject("missing", { v: 1 }, { expectedRevision: 4 })).toEqual({
      ok: false,
      current: { revision: 0, savedAt: 0 },
    });
  });

  it("returns null for a missing project", async () => {
    expect(await store.getProject("nope")).toBeNull();
  });

  it("leaves no temp files behind", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "p1", projectOrder: ["p1"] });
    await store.putImage(PNG);
    const files = await listFilesRecursive(dir);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("deletes a project and removes it from the order", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    await store.putProject("p2", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "p1", projectOrder: ["p1", "p2"] });
    expect(await store.deleteProject("p1")).toBe(true);
    expect(await store.getProject("p1")).toBeNull();
    const state = await store.getState();
    expect(state.projectOrder).toEqual(["p2"]);
    expect(state.activeProjectId).toBeNull();
    expect(await store.deleteProject("p1")).toBe(false);
  });
});

describe("FileStore state", () => {
  it("defaults to an empty state", async () => {
    expect(await store.getState()).toEqual({ activeProjectId: null, projectOrder: [], projects: [] });
  });

  it("lists projects in saved order, appending unknown ones by save time", async () => {
    await store.putProject("b", { v: 1 }, { expectedRevision: 0 });
    clock += 1000;
    await store.putProject("a", { v: 1 }, { expectedRevision: 0 });
    clock += 1000;
    await store.putProject("c", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "c", projectOrder: ["c", "ghost"] });

    const state = await store.getState();
    expect(state.activeProjectId).toBe("c");
    expect(state.projectOrder).toEqual(["c", "b", "a"]);
    expect(state.projects.map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(state.projects[0]).toEqual({ id: "c", revision: 1, savedAt: clock });
  });
});

describe("FileStore images", () => {
  it("stores images once by content hash", async () => {
    const name = await store.putImage(PNG);
    expect(name).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(await store.putImage(PNG)).toBe(name);
    expect(await readdir(path.join(dir, "images"))).toEqual([name]);
  });

  it("rejects unsupported bytes", async () => {
    expect(await store.putImage(new TextEncoder().encode("<svg/>"))).toBeNull();
  });

  it("reads stored images and ignores invalid names", async () => {
    const name = (await store.putImage(PNG)) as string;
    const image = await store.readImage(name);
    expect(image?.contentType).toBe("image/png");
    expect(Array.from(image?.bytes ?? [])).toEqual(Array.from(PNG));
    expect(await store.readImage("../../etc/passwd")).toBeNull();
    expect(await store.readImage(`${"f".repeat(64)}.png`)).toBeNull();
  });
});

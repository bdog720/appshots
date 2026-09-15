/** @vitest-environment node */
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileStore, IMAGE_GRACE_MS, PREVIOUS_VERSION_LABEL, RESTORE_LABEL } from "./store";

const MINUTE = 60 * 1000;
const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);
const projectWith = (headline: string, images: string[] = []) => ({
  screenshots: [{ headline, devices: images.map((name) => ({ screenshotSrc: `/api/images/${name}` })) }],
});

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
  await rm(dir, { recursive: true, force: true });
});

const save = async (id: string, headline: string, options: { pin?: boolean; pinPrevious?: boolean; label?: string } = {}) => {
  const current = await store.getProject(id);
  const result = await store.putProject(id, projectWith(headline), {
    expectedRevision: current?.revision ?? 0,
    ...options,
  });
  if (!result.ok) throw new Error("unexpected conflict");
  return result;
};

describe("history writes", () => {
  it("snapshots the first save and then at most every 10 minutes", async () => {
    await save("p", "v1");
    clock += MINUTE;
    await save("p", "v2");
    expect(await store.listHistory("p")).toHaveLength(1);

    clock += 11 * MINUTE;
    await save("p", "v3");
    const history = await store.listHistory("p");
    expect(history?.map((entry) => entry.firstHeadline)).toEqual(["v3", "v1"]);
    expect(history?.[0]).toMatchObject({ revision: 3, pinned: false, screenCount: 1, savedAt: clock });
    expect(history?.[0].version).toBe(`${clock}-3`);
  });

  it("pins Save now versions with their label even within 10 minutes", async () => {
    await save("p", "v1");
    clock += MINUTE;
    await save("p", "v2", { pin: true, label: "Saved" });
    const history = await store.listHistory("p");
    expect(history?.[0]).toMatchObject({ firstHeadline: "v2", pinned: true, label: "Saved" });
  });

  it("keeps the replaced version when pinPrevious is set", async () => {
    await save("p", "theirs");
    clock += MINUTE;
    await save("p", "mine", { pinPrevious: true });
    const history = await store.listHistory("p");
    expect(history?.find((entry) => entry.firstHeadline === "theirs")).toMatchObject({
      revision: 1,
      pinned: true,
      label: PREVIOUS_VERSION_LABEL,
    });
  });

  it("applies retention after writing", async () => {
    for (let i = 0; i < 25; i += 1) {
      await save("p", `v${i}`);
      clock += 11 * MINUTE;
    }
    expect(await store.listHistory("p")).toHaveLength(20);
  });

  it("returns null history for a missing project", async () => {
    expect(await store.listHistory("missing")).toBeNull();
  });
});

describe("addHistory and restoreVersion", () => {
  it("adds a pinned entry without changing the current project", async () => {
    await save("p", "server copy");
    clock += MINUTE;
    expect(await store.addHistory("p", projectWith("local copy"), "Discarded local changes")).toBe(true);
    expect((await store.getProject("p"))?.revision).toBe(1);
    expect((await store.listHistory("p"))?.[0]).toMatchObject({
      firstHeadline: "local copy",
      pinned: true,
      label: "Discarded local changes",
    });
    expect(await store.addHistory("missing", projectWith("x"), "label")).toBe(false);
  });

  it("restores a version after pinning the current content", async () => {
    await save("p", "old");
    const [oldVersion] = (await store.listHistory("p")) ?? [];
    clock += 11 * MINUTE;
    await save("p", "new");
    clock += MINUTE;

    const restored = await store.restoreVersion("p", oldVersion.version);
    expect(restored).toEqual({ revision: 3, savedAt: clock, project: projectWith("old") });
    expect(await store.getProject("p")).toEqual(restored);
    expect((await store.listHistory("p"))?.find((entry) => entry.label === RESTORE_LABEL)).toMatchObject({
      firstHeadline: "new",
      revision: 2,
      pinned: true,
    });
  });

  it("returns null when the project or version doesn't exist", async () => {
    await save("p", "v1");
    expect(await store.restoreVersion("p", `${clock}-99`)).toBeNull();
    expect(await store.restoreVersion("missing", `${clock}-1`)).toBeNull();
  });
});

describe("deletion and image cleanup", () => {
  it("removes history when a project is deleted", async () => {
    await save("p", "v1");
    await store.deleteProject("p");
    expect(await readdir(path.join(dir, "projects"))).toEqual([]);
  });

  it("deletes only old images that nothing references", async () => {
    const inProject = (await store.putImage(png(1))) as string;
    const inHistoryOnly = (await store.putImage(png(2))) as string;
    const unreferencedOld = (await store.putImage(png(3))) as string;
    const unreferencedNew = (await store.putImage(png(4))) as string;

    await store.putProject("p", projectWith("v1", [inHistoryOnly]), { expectedRevision: 0 });
    clock += MINUTE;
    await store.putProject("p", projectWith("v2", [inProject]), { expectedRevision: 1 });

    const old = new Date(clock - IMAGE_GRACE_MS - MINUTE);
    const recent = new Date(clock - MINUTE);
    for (const name of [inProject, inHistoryOnly, unreferencedOld]) {
      await utimes(path.join(dir, "images", name), old, old);
    }
    await utimes(path.join(dir, "images", unreferencedNew), recent, recent);

    expect(await store.collectGarbage()).toBe(1);
    expect((await readdir(path.join(dir, "images"))).sort()).toEqual(
      [inProject, inHistoryOnly, unreferencedNew].sort(),
    );
  });

  it("restarts the grace period when an already-stored image is uploaded again", async () => {
    const name = (await store.putImage(png(5))) as string;
    const old = new Date(clock - IMAGE_GRACE_MS - MINUTE);
    await utimes(path.join(dir, "images", name), old, old);

    expect(await store.putImage(png(5))).toBe(name);
    expect(await store.collectGarbage()).toBe(0);
    expect(await readdir(path.join(dir, "images"))).toEqual([name]);
  });
});

describe("corrupt files", () => {
  const historyFile = (id: string, version: string) => path.join(dir, "projects", id, "history", `${version}.json`);

  const storeOldUnreferencedImage = async () => {
    const name = (await store.putImage(png(9))) as string;
    const old = new Date(clock - IMAGE_GRACE_MS - MINUTE);
    await utimes(path.join(dir, "images", name), old, old);
    return name;
  };

  it("deletes a project whose file is corrupt, along with its history", async () => {
    await save("p", "v1");
    await writeFile(path.join(dir, "projects", "p.json"), "{trunc");

    expect(await store.deleteProject("p")).toBe(true);
    expect(await readdir(path.join(dir, "projects"))).toEqual([]);
  });

  it("skips a corrupt history file when listing and restoring", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await save("p", "v1");
    const corrupt = `${clock + MINUTE}-7`;
    await writeFile(historyFile("p", corrupt), "{trunc");

    expect((await store.listHistory("p"))?.map((entry) => entry.firstHeadline)).toEqual(["v1"]);
    expect(await store.restoreVersion("p", corrupt)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores a corrupt history file when deciding whether to snapshot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await save("p", "v1");
    await writeFile(historyFile("p", `${clock + 2 * MINUTE}-7`), "{trunc");

    clock += 11 * MINUTE;
    await save("p", "v2");
    expect((await store.listHistory("p"))?.map((entry) => entry.firstHeadline)).toEqual(["v2", "v1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("deletes no images while a project file is corrupt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const image = await storeOldUnreferencedImage();
    await writeFile(path.join(dir, "projects", "bad.json"), "{trunc");

    expect(await store.collectGarbage()).toBe(0);
    expect(await readdir(path.join(dir, "images"))).toEqual([image]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("deletes no images while a history file is corrupt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await save("p", "v1");
    const image = await storeOldUnreferencedImage();
    await writeFile(historyFile("p", `${clock + MINUTE}-7`), "{trunc");

    expect(await store.collectGarbage()).toBe(0);
    expect(await readdir(path.join(dir, "images"))).toEqual([image]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

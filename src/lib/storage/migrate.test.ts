import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { STORAGE_KEY } from "../useLocalStorage";
import { createFakeServer } from "./fake-server";
import { createMemoryStorage } from "./memory-storage";
import { MIGRATION_FLAG_KEY, MIGRATION_INCOMPLETE_KEY, migrateBrowserProjects } from "./migrate";
import { ServerStorage } from "./server-storage";
import { StorageError } from "./types";

const project = (id: string) =>
  ({ id, name: id, screenshots: [{ devices: [], overlayImages: [] }] }) as unknown as Project;

const browserWith = (projects: Project[], activeProjectId: string) => {
  const memory = createMemoryStorage();
  memory.setItem(STORAGE_KEY, JSON.stringify({ version: 2, projects, activeProjectId, lastSaved: 1 }));
  return memory;
};

describe("migrateBrowserProjects", () => {
  it("moves browser projects into an empty container once", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a"), project("b")], "b");
    const normalize = vi.fn((p: Project) => p);

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 0,
      normalize,
      localStorage: memory,
      now: () => 42,
    });

    expect(moved).toBe(2);
    expect(normalize).toHaveBeenCalledTimes(2);
    expect([...server.projects.keys()]).toEqual(["a", "b"]);
    expect(server.state).toEqual({ activeProjectId: "b", projectOrder: ["a", "b"] });
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBe("42");
    expect(memory.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("does nothing when the container already has projects or migration already ran", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a")], "a");
    const options = { server: new ServerStorage(server.fetch), normalize: (p: Project) => p, localStorage: memory };

    expect(await migrateBrowserProjects({ ...options, serverProjectCount: 3 })).toBe(0);
    memory.setItem(MIGRATION_FLAG_KEY, "1");
    expect(await migrateBrowserProjects({ ...options, serverProjectCount: 0 })).toBe(0);
    expect(server.calls).toHaveLength(0);
  });

  it("does nothing when this browser has no projects", async () => {
    const server = createFakeServer();
    const memory = createMemoryStorage();
    expect(
      await migrateBrowserProjects({
        server: new ServerStorage(server.fetch),
        serverProjectCount: 0,
        normalize: (p) => p,
        localStorage: memory,
      }),
    ).toBe(0);
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
  });

  it("stops without setting the flag if a project can't be saved", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 1, project: project("a") }); // forces a create conflict
    const memory = browserWith([project("a")], "a");
    await expect(
      migrateBrowserProjects({
        server: new ServerStorage(server.fetch),
        serverProjectCount: 0,
        normalize: (p) => p,
        localStorage: memory,
      }),
    ).rejects.toBeInstanceOf(StorageError);
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
  });

  it("sets the incomplete marker (and not the flag) when a save fails", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 1, project: project("a") }); // forces a create conflict
    const memory = browserWith([project("a")], "a");
    await expect(
      migrateBrowserProjects({
        server: new ServerStorage(server.fetch),
        serverProjectCount: 0,
        normalize: (p) => p,
        localStorage: memory,
      }),
    ).rejects.toBeInstanceOf(StorageError);
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
    expect(memory.getItem(MIGRATION_INCOMPLETE_KEY)).toBe("1");
  });

  it("proceeds on the next load despite a nonzero server project count, once the incomplete marker is set", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a")], "a");
    memory.setItem(MIGRATION_INCOMPLETE_KEY, "1");

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 5, // would normally block a retry
      normalize: (p) => p,
      localStorage: memory,
    });

    expect(moved).toBe(1);
    expect(memory.getItem(MIGRATION_INCOMPLETE_KEY)).toBeNull();
    expect(memory.getItem(MIGRATION_FLAG_KEY)).not.toBeNull();
  });

  it("skips projects already saved on the server when resuming, and migrates only the rest", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 1, project: project("a") }); // already migrated in a prior run
    const memory = browserWith([project("a"), project("b")], "b");
    memory.setItem(MIGRATION_INCOMPLETE_KEY, "1");
    const normalize = vi.fn((p: Project) => p);

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 1,
      serverProjectIds: ["a"],
      normalize,
      localStorage: memory,
    });

    expect(moved).toBe(1);
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(normalize).toHaveBeenCalledWith(project("b"));
    expect([...server.projects.keys()]).toEqual(["a", "b"]);
    expect(server.state).toEqual({ activeProjectId: "b", projectOrder: ["a", "b"] });
    expect(memory.getItem(MIGRATION_FLAG_KEY)).not.toBeNull();
    expect(memory.getItem(MIGRATION_INCOMPLETE_KEY)).toBeNull();
  });

  it("never throws when the migration flag can't be read (it just proceeds as if absent)", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a")], "a");
    const blockedKeys = new Set([MIGRATION_FLAG_KEY, MIGRATION_INCOMPLETE_KEY]);
    const storage: Storage = {
      ...memory,
      getItem: (key: string) => {
        if (blockedKeys.has(key)) throw new DOMException("blocked", "SecurityError");
        return memory.getItem(key);
      },
    };

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 0,
      normalize: (p) => p,
      localStorage: storage,
    });

    expect(moved).toBe(1);
    expect([...server.projects.keys()]).toEqual(["a"]);
  });

  it("never throws when writing the migration flag fails, and still returns the count", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a")], "a");
    const storage: Storage = {
      ...memory,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 0,
      normalize: (p) => p,
      localStorage: storage,
    });

    expect(moved).toBe(1);
    // The write silently failed, so the underlying store never actually recorded the flag.
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
  });
});

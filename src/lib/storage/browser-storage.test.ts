import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { CURRENT_VERSION, STORAGE_KEY } from "../useLocalStorage";
import { BrowserStorage } from "./browser-storage";
import { createMemoryStorage } from "./memory-storage";
import { StorageError } from "./types";

const project = (id: string, name = id) => ({ id, name, screenshots: [] }) as unknown as Project;

const blob = (storage: Storage) => JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");

const empty = { projects: [], activeProjectId: null };

/** A Storage whose every call fails the way it does when site data is blocked. */
const blockedStorage = (): Storage => {
  const blocked = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    get length() {
      return blocked();
    },
    clear: blocked,
    getItem: blocked,
    key: blocked,
    removeItem: blocked,
    setItem: blocked,
  };
};

/** Memory storage whose writes always fail with `error`. */
const failingWrites = (error: unknown): Storage => {
  const memory = createMemoryStorage();
  memory.setItem = () => {
    throw error;
  };
  return memory;
};

describe("BrowserStorage", () => {
  it("is browser mode and loads empty storage", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    expect(storage.mode).toBe("browser");
    expect(await storage.load()).toEqual({ projects: [], activeProjectId: null });
  });

  it("loads an existing saved blob", async () => {
    const memory = createMemoryStorage();
    memory.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, projects: [project("a"), project("b")], activeProjectId: "b", lastSaved: 1 }),
    );
    const loaded = await new BrowserStorage(memory).load();
    expect(loaded.projects.map((p) => p.id)).toEqual(["a", "b"]);
    expect(loaded.activeProjectId).toBe("b");
  });

  it("saves new and updated projects into the blob", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    expect(await storage.saveProject(project("a"))).toEqual({ ok: true });
    await storage.saveProject(project("b"));
    await storage.saveProject(project("a", "renamed"));

    const saved = blob(memory);
    expect(saved.version).toBe(CURRENT_VERSION);
    expect(saved.projects.map((p: Project) => [p.id, p.name])).toEqual([
      ["a", "renamed"],
      ["b", "b"],
    ]);
  });

  it("deletes projects and saves meta", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.saveProject(project("b"));
    await storage.saveProject(project("c"));
    await storage.saveMeta("c", ["c", "a", "b"]);
    expect(blob(memory)).toMatchObject({ activeProjectId: "c" });
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["c", "a", "b"]);

    await storage.deleteProject("c");
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["a", "b"]);
    expect(blob(memory).activeProjectId).toBe("a");
  });

  it("rejects with a StorageError when browser storage is full, and recovers once space is freed", async () => {
    const memory = createMemoryStorage({ quotaChars: 500 });
    const storage = new BrowserStorage(memory);
    await storage.load();
    expect(await storage.saveProject(project("a"))).toEqual({ ok: true });

    const huge = project("huge", "x".repeat(1000));
    await expect(storage.saveProject(huge)).rejects.toBeInstanceOf(StorageError);
    await expect(storage.saveProject(huge)).rejects.toThrow("Browser storage is full");

    await storage.deleteProject("huge");
    expect(await storage.saveProject(project("b"))).toEqual({ ok: true });
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["a", "b"]);
  });

  it.each([
    ["legacy Firefox error name", new DOMException("Quota reached", "NS_ERROR_DOM_QUOTA_REACHED")],
    ["legacy Firefox error code", Object.defineProperty(new DOMException("Quota reached"), "code", { value: 1014 })],
  ])("treats a %s as full storage", async (_label, error) => {
    const storage = new BrowserStorage(failingWrites(error));
    await storage.load();
    await expect(storage.saveProject(project("a"))).rejects.toThrow("Browser storage is full");
  });

  it("does not read window.localStorage on construction, and treats a blocked one as unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      const storage = new BrowserStorage();
      expect(await storage.load()).toEqual(empty);
      await expect(storage.saveProject(project("a"))).rejects.toBeInstanceOf(StorageError);
      await expect(storage.saveProject(project("a"))).rejects.toThrow("Browser storage is unavailable");
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
      else Reflect.deleteProperty(window, "localStorage");
    }
  });

  it("loads empty and rejects writes when injected storage is blocked", async () => {
    const storage = new BrowserStorage(blockedStorage());
    expect(await storage.load()).toEqual(empty);
    await expect(storage.saveProject(project("a"))).rejects.toThrow("Browser storage is unavailable");
  });

  it("keeps stored projects when saving before load", async () => {
    const memory = createMemoryStorage();
    memory.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: CURRENT_VERSION, projects: [project("a"), project("b")], activeProjectId: "b", lastSaved: 1 }),
    );
    await new BrowserStorage(memory).saveProject(project("c"));
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["a", "b", "c"]);
    expect(blob(memory).activeProjectId).toBe("b");
  });

  it("ignores duplicate ids in the saved project order", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.saveProject(project("b"));
    await storage.saveMeta("b", ["b", "b", "a", "a"]);
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["b", "a"]);
  });

  it("resets all saved data", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.resetAll();
    expect(memory.getItem(STORAGE_KEY)).toBeNull();
    expect(await storage.load()).toEqual(empty);
  });
});

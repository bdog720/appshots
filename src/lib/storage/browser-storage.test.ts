import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { CURRENT_VERSION, STORAGE_KEY } from "../useLocalStorage";
import { BrowserStorage } from "./browser-storage";
import { createMemoryStorage } from "./memory-storage";
import { StorageError } from "./types";

const project = (id: string, name = id) => ({ id, name, screenshots: [] }) as unknown as Project;

const blob = (storage: Storage) => JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");

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

  it("rejects with a StorageError when browser storage is full", async () => {
    const storage = new BrowserStorage(createMemoryStorage({ quotaChars: 50 }));
    await storage.load();
    const huge = { ...project("a"), name: "x".repeat(200) } as Project;
    await expect(storage.saveProject(huge)).rejects.toBeInstanceOf(StorageError);
    await expect(storage.saveProject(huge)).rejects.toThrow("Browser storage is full");
  });

  it("resets all saved data", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.resetAll();
    expect(memory.getItem(STORAGE_KEY)).toBeNull();
    expect(await storage.load()).toEqual({ projects: [], activeProjectId: null });
  });
});

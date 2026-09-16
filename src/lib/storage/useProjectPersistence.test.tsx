import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { StorageError, type ProjectStorage, type SaveResult } from "./types";
import { useProjectPersistence } from "./useProjectPersistence";

const project = (id: string, name = id) =>
  ({ id, name, screenshots: [], updatedAt: 1 }) as unknown as Project;

const createStorage = (mode: "browser" | "server" = "browser") => {
  const saveProject = vi.fn(async (_project: Project, _options?: unknown): Promise<SaveResult> => ({ ok: true }));
  const deleteProject = vi.fn(async () => {});
  const saveMeta = vi.fn(async () => {});
  const saveProjectOnUnload = vi.fn(() => true);
  const storage = {
    mode,
    load: vi.fn(),
    resetAll: vi.fn(),
    saveProject,
    deleteProject,
    saveMeta,
    saveProjectOnUnload,
    reloadProject: vi.fn(),
    listHistory: vi.fn(),
    addHistory: vi.fn(),
    restoreVersion: vi.fn(),
    inlineProjectImages: vi.fn(),
  } as unknown as ProjectStorage;
  return { storage, saveProject, deleteProject, saveMeta, saveProjectOnUnload };
};

const initial = [project("a"), project("b")];

const setup = (mode: "browser" | "server" = "browser") => {
  const mocks = createStorage(mode);
  const hook = renderHook(
    ({ projects, activeProjectId }: { projects: Project[]; activeProjectId: string }) =>
      useProjectPersistence({
        storage: mocks.storage,
        projects,
        activeProjectId,
        initialProjects: initial,
        initialActiveProjectId: "a",
        now: () => 123,
      }),
    { initialProps: { projects: initial, activeProjectId: "a" } },
  );
  return { ...mocks, hook };
};

const flushTimers = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProjectPersistence", () => {
  it("does not save right after loading", async () => {
    const { hook, saveProject } = setup();
    hook.rerender({ projects: [{ ...initial[0], updatedAt: 999 } as Project, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).not.toHaveBeenCalled();
    expect(hook.result.current.status).toEqual({ kind: "saved", at: null });
  });

  it("marks changes dirty, then autosaves only changed projects", async () => {
    const { hook, saveProject } = setup();
    const renamed = project("a", "Renamed");
    hook.rerender({ projects: [renamed, initial[1]], activeProjectId: "a" });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0]).toBe(renamed);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("debounces rapid edits into one save of the latest version", async () => {
    const { hook, saveProject } = setup();
    hook.rerender({ projects: [project("a", "A1"), initial[1]], activeProjectId: "a" });
    await flushTimers(500);
    const latest = project("a", "A2");
    hook.rerender({ projects: [latest, initial[1]], activeProjectId: "a" });
    await flushTimers(1000);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0]).toBe(latest);
  });

  it("deletes removed projects and saves meta changes", async () => {
    const { hook, deleteProject, saveMeta } = setup();
    hook.rerender({ projects: [initial[0]], activeProjectId: "a" });
    await flushTimers();
    expect(deleteProject).toHaveBeenCalledWith("b");
    expect(saveMeta).toHaveBeenCalledWith("a", ["a"]);
  });

  it("saves immediately on Save now and pins the active project in server mode", async () => {
    const { hook, saveProject } = setup("server");
    await act(async () => {
      await hook.result.current.saveNow();
    });
    expect(saveProject).toHaveBeenCalledWith(initial[0], { pin: true, label: "Saved" });
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("does not force a save on Save now in browser mode when nothing changed", async () => {
    const { hook, saveProject } = setup("browser");
    await act(async () => {
      await hook.result.current.saveNow();
    });
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("shows errors and recovers on retry", async () => {
    const { hook, saveProject } = setup();
    saveProject.mockRejectedValueOnce(new StorageError("Browser storage is full"));
    hook.rerender({ projects: [project("a", "big"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "error", message: "Browser storage is full" });

    await act(async () => {
      await hook.result.current.retry();
    });
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("pauses on conflict until Keep mine", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    const mine = project("a", "mine");
    hook.rerender({ projects: [mine, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    hook.rerender({ projects: [project("a", "mine again"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "mine again" }),
      { baseRevision: 7, pinPrevious: true },
    );
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("resets the baseline with markSaved", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();

    const theirs = project("a", "theirs");
    act(() => {
      hook.result.current.markSaved([theirs, initial[1]], "a");
    });
    hook.rerender({ projects: [theirs, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("guards page unload", async () => {
    const server = setup("server");
    server.hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const serverEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(serverEvent);
    expect(serverEvent.defaultPrevented).toBe(true);
    expect(server.saveProjectOnUnload).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
    server.hook.unmount();

    const browser = setup("browser");
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    browser.hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const browserEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(browserEvent);
    expect(browserEvent.defaultPrevented).toBe(false);
    expect(browser.saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
  });
});

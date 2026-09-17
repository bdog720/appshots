import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { STORAGE_KEY } from "../useLocalStorage";
import { BrowserStorage } from "./browser-storage";
import { createMemoryStorage } from "./memory-storage";
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

/** Makes the next save hang so a test can act while it is in flight. */
const holdNextSave = (saveProject: ReturnType<typeof createStorage>["saveProject"]) => {
  let release!: (result: SaveResult) => void;
  saveProject.mockImplementationOnce(() => new Promise<SaveResult>((resolve) => (release = resolve)));
  return async (result: SaveResult) => {
    await act(async () => {
      release(result);
      await vi.advanceTimersByTimeAsync(0);
    });
  };
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

  it("advances the baseline only for the project whose save landed", async () => {
    const { hook, saveProject } = setup();
    const mineA = project("a", "mine A");
    const mineB = project("b", "mine B");
    saveProject
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new StorageError("Browser storage is full"));
    hook.rerender({ projects: [mineA, mineB], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "error", message: "Browser storage is full" });
    expect(saveProject).toHaveBeenCalledTimes(2);

    await act(async () => {
      await hook.result.current.retry();
    });
    // A already landed, so the retry re-sends exactly B.
    expect(saveProject).toHaveBeenCalledTimes(3);
    expect(saveProject.mock.calls[2][0]).toBe(mineB);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("saves an edit that arrives while a save is in flight", async () => {
    const { hook, saveProject } = setup();
    const release = holdNextSave(saveProject);
    hook.rerender({ projects: [project("a", "A1"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "saving" });

    const newer = project("a", "A2");
    hook.rerender({ projects: [newer, initial[1]], activeProjectId: "a" });
    await release({ ok: true });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject.mock.calls[1][0]).toBe(newer);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("pauses on conflict until Keep mine", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    const mine = project("a", "mine");
    hook.rerender({ projects: [mine, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });
    // The conflict is carried on its own, so the status is free to say the
    // plain truth: this project's changes are not saved.
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

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

  it("keeps autosaving other projects while one is in conflict", async () => {
    // Otherwise every other project silently stops saving behind the banner,
    // with the indicator reading "Changed elsewhere" rather than "Unsaved
    // changes" — so nothing tells the user those edits are at risk.
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    const mineA = project("a", "mine A");
    hook.rerender({ projects: [mineA, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });
    expect(saveProject).toHaveBeenCalledTimes(1);

    const mineB = project("b", "mine B");
    hook.rerender({ projects: [mineA, mineB], activeProjectId: "a" });
    await flushTimers();

    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject.mock.calls[1][0]).toBe(mineB);
    // Only the conflicted project waits, and its banner stays up.
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });
    // A is still unsaved, so this reads "Unsaved changes" rather than "Saved".
    expect(hook.result.current.status).toEqual({ kind: "dirty" });
  });

  it("reports a sibling's failed save while the conflict stays live", async () => {
    // The conflict is carried separately from the status, so a sibling's
    // failure doesn't have to be swallowed to keep the banner alive: hiding it
    // left the user with no message, no Retry button and no re-armed flush.
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    const mineA = project("a", "mine A");
    hook.rerender({ projects: [mineA, initial[1]], activeProjectId: "a" });
    await flushTimers();

    saveProject.mockRejectedValueOnce(new StorageError("Can't reach the Breezel server"));
    const mineB = project("b", "mine B");
    hook.rerender({ projects: [mineA, mineB], activeProjectId: "a" });
    await flushTimers();

    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(hook.result.current.status).toEqual({
      kind: "error",
      message: "Can't reach the Breezel server",
    });
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    // And the Retry the error status offers actually re-sends the sibling.
    await act(async () => {
      await hook.result.current.retry();
    });
    expect(saveProject).toHaveBeenCalledTimes(3);
    expect(saveProject.mock.calls[2][0]).toBe(mineB);
    // A is still held and still unsaved, so this is "Unsaved changes", not "Saved".
    expect(hook.result.current.status).toEqual({ kind: "dirty" });
  });

  it("holds every conflicted project, not just the one it shows", async () => {
    // A 409 resyncs the client's tracked revision, so a conflicted project
    // that isn't held would sail through on its very next save — landing on
    // top of the other writer with no banner, no prompt and no pinPrevious.
    const { hook, saveProject } = setup("server");
    saveProject
      .mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } })
      .mockResolvedValueOnce({ ok: false, conflict: { revision: 9, savedAt: 80 } });
    const mineA = project("a", "mine A");
    const mineB = project("b", "mine B");
    hook.rerender({ projects: [mineA, mineB], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(2);
    // One of them is on display; both are held.
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    hook.rerender({ projects: [mineA, project("b", "mine B2")], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(2);

    // Resolving the displayed one must not release the other.
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(saveProject).toHaveBeenCalledTimes(3);
    expect(saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "a" }),
      { baseRevision: 7, pinPrevious: true },
    );
    expect(saveProject.mock.calls.filter((call) => call[0].id === "b")).toHaveLength(1);
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "b", revision: 9, savedAt: 80 });
  });

  it("doesn't delete the container's copy when Keep mine finds the project deleted here", async () => {
    // "Keep mine" on a project deleted in this tab has no copy to keep — and
    // must not turn into "delete theirs": the other writer's version is the
    // only one left.
    const { hook, saveProject, deleteProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();

    hook.rerender({ projects: [initial[1]], activeProjectId: "b" });
    await flushTimers();
    expect(deleteProject).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.current.keepMine();
    });
    await flushTimers();
    expect(deleteProject).not.toHaveBeenCalled();
    expect(hook.result.current.conflict).toBeNull();
  });

  it("keeps the conflict live and reports why when Keep mine fails", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    saveProject.mockRejectedValueOnce(new StorageError("Can't reach the Breezel server"));
    await act(async () => {
      // Thrown rather than swallowed: the banner shows this beside its own
      // buttons, which is where the user is looking and where the retry is.
      await expect(hook.result.current.keepMine()).rejects.toThrow("Can't reach the Breezel server");
    });
    // The conflict is still live, so the affordance survives the failure.
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    // The affordance is still live: a second attempt saves on the same revision.
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "mine" }),
      { baseRevision: 7, pinPrevious: true },
    );
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("resets one project's baseline with markSaved", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();

    const theirs = project("a", "theirs");
    hook.rerender({ projects: [theirs, initial[1]], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(theirs);
    });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);
    // markSaved means storage already holds this copy — written on the server
    // or in another tab, never in this tick. So: "Saved", with no save time.
    expect(hook.result.current.status).toEqual({ kind: "saved", at: null });
  });

  it("settles the status when markSaved lands before the editor re-renders", async () => {
    const { hook, saveProject } = setup("server");
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });

    // The editor loads another copy and marks it saved in the same tick, so
    // latestRef still holds the pre-load copy and markSaved reports dirty.
    const theirs = project("a", "theirs");
    act(() => {
      hook.result.current.markSaved(theirs);
    });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    // React applies the loaded copy. Nothing is pending now, so a "dirty" the
    // editor can never clear would be a lie — it has to settle. No write
    // happened in this tick, though, so it carries no save time: "Saved", not
    // "Saved · just now".
    hook.rerender({ projects: [theirs, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "saved", at: null });
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("keeps a sibling's edits plannable when markSaved resolves a conflict", async () => {
    const { hook, saveProject } = setup("server");
    saveProject
      .mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } })
      // B does go out now (see "keeps autosaving other projects while one is
      // in conflict"), so its save has to fail for it to still be pending here.
      .mockRejectedValueOnce(new StorageError("Can't reach the Breezel server"));
    const mineA = project("a", "mine A");
    const mineB = project("b", "mine B");
    hook.rerender({ projects: [mineA, mineB], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });
    // B's failure is reported rather than hidden behind the conflict.
    expect(hook.result.current.status).toEqual({
      kind: "error",
      message: "Can't reach the Breezel server",
    });

    const theirsA = project("a", "theirs A");
    hook.rerender({ projects: [theirsA, mineB], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(theirsA);
    });
    await flushTimers();
    // markSaved rewrites one project's baseline entry, so B — whose save never
    // landed — is still plannable and goes out.
    expect(saveProject).toHaveBeenCalledTimes(3);
    expect(saveProject.mock.calls[2][0]).toBe(mineB);
  });

  it("ignores a flush that markSaved superseded", async () => {
    const { hook, saveProject } = setup("server");
    const release = holdNextSave(saveProject);
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "saving" });

    const theirs = project("a", "theirs");
    hook.rerender({ projects: [theirs, initial[1]], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(theirs);
    });
    // A save of the pre-load copy is still in flight, so this is not settled yet.
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    // The superseded save must not re-open the conflict the user just resolved.
    await release({ ok: false, conflict: { revision: 9, savedAt: 80 } });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });
  });

  it("re-sends the editor's copy when markSaved lands during a save", async () => {
    const { hook, saveProject } = setup("server");
    const release = holdNextSave(saveProject);
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "saving" });

    const restored = project("a", "restored");
    hook.rerender({ projects: [restored, initial[1]], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(restored);
    });
    await release({ ok: true });
    // Storage may have applied the pre-load copy last, so "Saved" would be a lie.
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject.mock.calls[1][0]).toBe(restored);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });

    // The force is cleared once its save lands, so nothing is re-sent forever.
    await act(async () => {
      await hook.result.current.retry();
    });
    expect(saveProject).toHaveBeenCalledTimes(2);
  });

  it("still deletes a project removed after markSaved forced a re-send", async () => {
    const { hook, saveProject, deleteProject } = setup("server");
    const release = holdNextSave(saveProject);
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();

    const restored = project("a", "restored");
    hook.rerender({ projects: [restored, initial[1]], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(restored);
    });

    // The user deletes the project before the forced re-send goes out.
    hook.rerender({ projects: [initial[1]], activeProjectId: "b" });
    await release({ ok: true });
    await flushTimers();

    expect(deleteProject).toHaveBeenCalledWith("a");
  });

  it("still deletes a project the user removed while a restore was landing", async () => {
    // No conflict anywhere in this test. markSaved is simply how a load or a
    // restore hands the editor back its saved copy, and it must not cancel a
    // delete the user asked for in the meantime — the project would stay in
    // the container and come back on the next load.
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    const pa = project("a");
    const pb = project("b");
    await storage.saveProject(pa);
    await storage.saveProject(pb);
    await storage.saveMeta("a", ["a", "b"]);
    const deleteProject = vi.spyOn(storage, "deleteProject");

    const hook = renderHook(
      ({ projects, activeProjectId }: { projects: Project[]; activeProjectId: string }) =>
        useProjectPersistence({
          storage,
          projects,
          activeProjectId,
          initialProjects: [pa, pb],
          initialActiveProjectId: "a",
          now: () => 123,
        }),
      { initialProps: { projects: [pa, pb], activeProjectId: "a" } },
    );

    // The user deletes "a" while a restore of it is still on its way back…
    hook.rerender({ projects: [pb], activeProjectId: "b" });
    // …and the restored copy lands afterwards.
    act(() => {
      hook.result.current.markSaved(project("a", "restored"));
    });
    await flushTimers();

    expect(deleteProject).toHaveBeenCalledWith("a");
    const persisted = JSON.parse(memory.getItem(STORAGE_KEY) ?? "{}") as {
      projects: Array<{ id: string }>;
    };
    expect(persisted.projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("removes a deleted project from browser storage after a forced re-send", async () => {
    const memory = createMemoryStorage();
    const inner = new BrowserStorage(memory);
    const pa = project("a");
    const pb = project("b");
    await inner.saveProject(pa);
    await inner.saveProject(pb);
    await inner.saveMeta("a", ["a", "b"]);

    // A real BrowserStorage behind a gate, so a save can be held mid-flight.
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const storage = {
      mode: "browser",
      load: () => inner.load(),
      saveProject: async (p: Project) => {
        await gate;
        return inner.saveProject(p);
      },
      deleteProject: (id: string) => inner.deleteProject(id),
      saveMeta: (active: string, order: string[]) => inner.saveMeta(active, order),
      resetAll: () => inner.resetAll(),
    } as unknown as ProjectStorage;

    const hook = renderHook(
      ({ projects, activeProjectId }: { projects: Project[]; activeProjectId: string }) =>
        useProjectPersistence({
          storage,
          projects,
          activeProjectId,
          initialProjects: [pa, pb],
          initialActiveProjectId: "a",
          now: () => 123,
        }),
      { initialProps: { projects: [pa, pb], activeProjectId: "a" } },
    );

    hook.rerender({ projects: [project("a", "mine"), pb], activeProjectId: "a" });
    await flushTimers();

    const restored = project("a", "restored");
    hook.rerender({ projects: [restored, pb], activeProjectId: "a" });
    act(() => {
      hook.result.current.markSaved(restored);
    });

    hook.rerender({ projects: [pb], activeProjectId: "b" });
    await act(async () => {
      openGate();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushTimers();

    const persisted = JSON.parse(memory.getItem(STORAGE_KEY) ?? "{}") as {
      projects: Array<{ id: string }>;
    };
    expect(persisted.projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("guards page unload", async () => {
    const server = setup("server");
    server.hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const serverEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(serverEvent);
    expect(serverEvent.defaultPrevented).toBe(true);
    expect(server.saveProjectOnUnload).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
    // No synchronous fallback in server mode.
    expect(server.saveProject).not.toHaveBeenCalled();
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
    expect(browser.saveProjectOnUnload).not.toHaveBeenCalled();
  });

  it("pins the previous version when unloading a project with a live conflict", async () => {
    // Resyncing on a 409 (a separate fix) makes this reachable: closing the
    // tab on an unresolved "Changed elsewhere" banner must not let the
    // keepalive save silently pick a winner between this tab's edits and
    // whatever is on the server — pinning keeps both for the user to choose
    // between later.
    const { hook, saveProject, saveProjectOnUnload } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.conflict).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(saveProjectOnUnload).toHaveBeenCalledWith(
      expect.objectContaining({ name: "mine" }),
      { pinPrevious: true },
    );
  });

  it("does not pin an ordinary unload save with no live conflict", async () => {
    const { hook, saveProjectOnUnload } = setup("server");
    hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(saveProjectOnUnload).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
  });

  it("asks for the leave-page prompt even when the keepalive save can't be sent", async () => {
    const { hook, saveProject, saveProjectOnUnload } = setup("server");
    saveProjectOnUnload.mockReturnValue(false);
    hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(saveProjectOnUnload).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("saves pending edits when the editor unmounts mid-debounce", () => {
    const browser = setup("browser");
    const unsaved = project("a", "unsaved");
    browser.hook.rerender({ projects: [unsaved, initial[1]], activeProjectId: "a" });
    browser.hook.unmount();
    expect(browser.saveProject).toHaveBeenCalledWith(unsaved);

    const server = setup("server");
    const pending = project("a", "pending");
    server.hook.rerender({ projects: [pending, initial[1]], activeProjectId: "a" });
    server.hook.unmount();
    expect(server.saveProjectOnUnload).toHaveBeenCalledWith(pending);
    expect(server.saveProject).not.toHaveBeenCalled();
  });

  it("removes the unload listener on unmount", () => {
    const { hook, saveProject } = setup("browser");
    hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    // Unmounting writes once; the teardown does not advance the baseline, so a
    // listener that outlived the hook would write a second time.
    hook.unmount();
    expect(saveProject).toHaveBeenCalledTimes(1);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });
});

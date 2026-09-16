import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import type { ProjectStorage, SaveResult } from "../lib/storage/types";
import { EditorProvider, prepareInitialState, useEditor } from "./EditorContext";

/** A project shaped like one persisted before global defaults existed. */
const legacyProject = (id: string, name = id) =>
  ({
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
    screenshots: [{ id: `${id}-s`, headline: `${id} headline` }],
  }) as unknown as Project;

const createStorage = (mode: "browser" | "server") => {
  const saveProject = vi.fn(
    async (_project: Project, _options?: unknown): Promise<SaveResult> => ({ ok: true }),
  );
  const deleteProject = vi.fn(async (_id: string) => {});
  const saveMeta = vi.fn(async (_active: string, _order: string[]) => {});
  const resetAll = vi.fn(async () => {});
  const reloadProject = vi.fn(async (_id: string): Promise<Project | null> => null);
  const restoreVersion = vi.fn(async (_id: string, _version: string): Promise<Project> => {
    throw new Error("not stubbed");
  });
  const addHistory = vi.fn(async (_project: Project, _label: string) => {});
  const listHistory = vi.fn(async (_id: string) => []);
  const inlineProjectImages = vi.fn(async (project: Project) => project);
  const storage = {
    mode,
    load: vi.fn(),
    saveProject,
    deleteProject,
    saveMeta,
    resetAll,
    reloadProject,
    restoreVersion,
    addHistory,
    listHistory,
    inlineProjectImages,
    saveProjectOnUnload: vi.fn(() => true),
  } as unknown as ProjectStorage;
  return {
    storage,
    saveProject,
    deleteProject,
    saveMeta,
    resetAll,
    reloadProject,
    restoreVersion,
    addHistory,
    listHistory,
    inlineProjectImages,
  };
};

let editor: ReturnType<typeof useEditor>;

const Probe = () => {
  editor = useEditor();
  return <div>{editor.activeScreenshot.headline}</div>;
};

const renderEditor = (
  options: {
    mode?: "browser" | "server";
    projects?: Project[];
    activeProjectId?: string | null;
  } = {},
) => {
  const mocks = createStorage(options.mode ?? "browser");
  const initialState = prepareInitialState({
    projects: options.projects ?? [legacyProject("a"), legacyProject("b")],
    activeProjectId: options.activeProjectId ?? "a",
  });
  render(
    <EditorProvider
      storage={mocks.storage}
      initialState={initialState}
      startupNotice={{ unwritable: false, migratedCount: 0 }}
    >
      <Probe />
    </EditorProvider>,
  );
  return { ...mocks, initialState };
};

/** Makes the next save hang so a test can act while it is in flight. */
const holdNextSave = (saveProject: ReturnType<typeof createStorage>["saveProject"]) => {
  let release!: (result: SaveResult) => void;
  saveProject.mockImplementationOnce(
    () => new Promise<SaveResult>((resolve) => (release = resolve)),
  );
  return async (result: SaveResult) => {
    await act(async () => {
      release(result);
      await vi.advanceTimersByTimeAsync(0);
    });
  };
};

const settle = async (ms = 1500) => {
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

describe("EditorProvider storage wiring", () => {
  it("writes nothing when a loaded project is only rendered", async () => {
    const { saveProject, saveMeta, deleteProject } = renderEditor();
    await settle();
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveMeta).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
    expect(editor.saveStatus).toEqual({ kind: "saved", at: null });
  });

  it("autosaves only the project that changed", async () => {
    const { saveProject } = renderEditor();
    act(() => {
      editor.renameProject("a", "Renamed");
    });
    await settle();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0].name).toBe("Renamed");
  });

  it("switching projects saves the new active id without re-saving either project", async () => {
    const { saveProject, saveMeta } = renderEditor();
    act(() => {
      editor.switchProject("b");
    });
    await settle();
    expect(saveMeta).toHaveBeenCalledWith("b", ["a", "b"]);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("embeds container images in an exported backup", async () => {
    const createObjectURL = vi.fn(() => "blob:stub");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { inlineProjectImages } = renderEditor({ mode: "server" });

    await act(async () => {
      await editor.exportProject("a");
    });

    expect(inlineProjectImages).toHaveBeenCalledTimes(1);
    expect(inlineProjectImages.mock.calls[0][0].id).toBe("a");
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it("takes their version on a conflict, keeping the local copy in history", async () => {
    const { saveProject, reloadProject, addHistory } = renderEditor({ mode: "server" });
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    act(() => {
      editor.renameProject("a", "Mine");
    });
    await settle();
    expect(editor.saveStatus).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    const theirs = { ...editor.projects[0], name: "Theirs" };
    reloadProject.mockResolvedValueOnce(theirs);
    await act(async () => {
      await editor.loadTheirVersion();
    });
    await settle();

    expect(addHistory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mine" }),
      "Discarded local changes",
    );
    expect(editor.activeProject.name).toBe("Theirs");
    // Their copy is now the saved one, so nothing is re-sent for it — and the
    // write happened in the other tab, so this carries no save time.
    expect(editor.saveStatus).toEqual({ kind: "saved", at: null });
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it("saves pending edits before restoring a version, then loads the restored copy", async () => {
    const { saveProject, restoreVersion, addHistory } = renderEditor({ mode: "server" });
    act(() => {
      editor.renameProject("a", "Pending");
    });
    restoreVersion.mockImplementationOnce(async () => ({
      ...editor.projects[0],
      name: "Restored",
    }));

    await act(async () => {
      await editor.restoreProjectVersion("1757900000000-3");
    });
    await settle();

    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0].name).toBe("Pending");
    // Belt-and-braces even on the happy path: the in-memory copy is pinned
    // directly rather than trusting that the save above already reached the
    // server (see the conflict/error cases below, where it hasn't).
    expect(addHistory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pending" }),
      "Before restore (unsaved edits)",
    );
    expect(restoreVersion).toHaveBeenCalledWith("a", "1757900000000-3");
    expect(editor.activeProject.name).toBe("Restored");
    // The restore was written by the server, not by a save in this tick.
    expect(editor.saveStatus).toEqual({ kind: "saved", at: null });
  });

  it("has no history outside container mode", async () => {
    const { listHistory } = renderEditor({ mode: "browser" });
    await expect(editor.listProjectHistory()).resolves.toEqual([]);
    expect(listHistory).not.toHaveBeenCalled();
    expect(editor.storageMode).toBe("browser");
  });

  it("clears saved projects when the editor is reset", async () => {
    const { resetAll } = renderEditor();
    act(() => {
      editor.resetEditor();
    });
    expect(resetAll).toHaveBeenCalledTimes(1);
  });

  it("keeps the replaced content in history even while a save is in flight", async () => {
    const { saveProject, addHistory } = renderEditor({ mode: "server" });
    const release = holdNextSave(saveProject);
    act(() => {
      editor.renameProject("a", "Edited");
    });
    await settle();
    expect(editor.saveStatus).toEqual({ kind: "saving" });

    await act(async () => {
      editor.applyAgentImport(legacyProject("imported", "Imported"), "replace");
    });

    // A pinning save would have queued behind the in-flight one and captured
    // the imported content instead of the content it replaced.
    expect(addHistory).toHaveBeenCalledTimes(1);
    expect(addHistory.mock.calls[0][0].screenshots[0].headline).toBe("a headline");
    expect(addHistory.mock.calls[0][1]).toBe("Before replace");

    await release({ ok: true });
    await settle();
    expect(editor.activeScreenshot.headline).toBe("imported headline");
  });

  it("pins current edits to history before restoring when a conflict is already pending", async () => {
    // retry() is a no-op while a conflict is pending, so the edited copy
    // would never reach the server on its own — the restore's confirmation
    // promises it's saved to history regardless, so it must be pinned
    // explicitly rather than relying on retry() having succeeded.
    const { saveProject, restoreVersion, addHistory } = renderEditor({ mode: "server" });
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    act(() => {
      editor.renameProject("a", "Mine");
    });
    await settle();
    expect(editor.saveStatus).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    restoreVersion.mockResolvedValueOnce({ ...editor.projects[0], name: "Restored" });
    await act(async () => {
      await editor.restoreProjectVersion("1757900000000-3");
    });

    // Distinct from the server's own auto-pinned "Before restore" entry (the
    // stale server copy) so the row holding the user's actual unsaved edits
    // — the one that matters here — can be told apart in the history list.
    expect(addHistory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mine" }),
      "Before restore (unsaved edits)",
    );
    expect(restoreVersion).toHaveBeenCalledWith("a", "1757900000000-3");
    expect(editor.activeProject.name).toBe("Restored");
  });

  it("surfaces an error and does not restore when pinning current edits fails", async () => {
    const { addHistory, restoreVersion } = renderEditor({ mode: "server" });
    addHistory.mockRejectedValueOnce(new Error("boom"));

    await expect(editor.restoreProjectVersion("1757900000000-3")).rejects.toThrow("boom");
    expect(restoreVersion).not.toHaveBeenCalled();
  });

  it("throws rather than restoring without pinning when the active project can't be found locally", async () => {
    // Defensive guard: restoreProjectVersion must never silently skip its
    // safety-net pin just because the id it's looking for isn't there. This
    // constructs that inconsistent state directly (bypassing the normal
    // prepareInitialState validation, which never lets activeProjectId point
    // at a missing project) since the app doesn't otherwise reach it today.
    const mocks = createStorage("server");
    // Normalized (valid) projects, but with activeProjectId overridden after
    // the fact — prepareInitialState itself never lets that point at a
    // missing project, so this bypasses it deliberately.
    const normalized = prepareInitialState({
      projects: [legacyProject("a"), legacyProject("b")],
      activeProjectId: "a",
    });
    render(
      <EditorProvider
        storage={mocks.storage}
        initialState={{ ...normalized, activeProjectId: "missing" }}
        startupNotice={{ unwritable: false, migratedCount: 0 }}
      >
        <Probe />
      </EditorProvider>,
    );

    await expect(editor.restoreProjectVersion("1757900000000-3")).rejects.toThrow();
    expect(mocks.addHistory).not.toHaveBeenCalled();
    expect(mocks.restoreVersion).not.toHaveBeenCalled();
  });

  it("doesn't pull the user back when they switch projects mid-restore", async () => {
    const { restoreVersion } = renderEditor({ mode: "server" });
    let release!: (project: Project) => void;
    restoreVersion.mockImplementationOnce(
      () => new Promise<Project>((resolve) => (release = resolve)),
    );
    const restored = {
      ...editor.projects[0],
      screenshots: [{ ...editor.projects[0].screenshots[0], headline: "restored headline" }],
    };

    let pending!: Promise<void>;
    act(() => {
      pending = editor.restoreProjectVersion("1757900000000-3");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      editor.switchProject("b");
    });

    await act(async () => {
      release(restored);
      await pending;
    });

    // The version the user asked about is still the one restored…
    expect(restoreVersion.mock.calls[0][0]).toBe("a");
    expect(editor.projects.find((p) => p.id === "a")?.screenshots[0].headline).toBe(
      "restored headline",
    );
    // …but they stay where they navigated to.
    expect(editor.activeProjectId).toBe("b");
  });
});

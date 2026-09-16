import { describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import { BrowserStorage } from "../lib/storage/browser-storage";
import { createFakeServer } from "../lib/storage/fake-server";
import { createMemoryStorage } from "../lib/storage/memory-storage";
import { ServerStorage } from "../lib/storage/server-storage";
import { StorageError, type ProjectStorage } from "../lib/storage/types";
import { bootstrapEditor } from "./bootstrap-editor";
import { prepareInitialState } from "./EditorContext";

const legacyProject = (id: string) =>
  ({
    id,
    name: id,
    createdAt: 1,
    updatedAt: 1,
    screenshots: [{ id: `${id}-s`, headline: "Hi" }],
  }) as unknown as Project;

describe("prepareInitialState", () => {
  it("creates a default project when nothing was saved", () => {
    const state = prepareInitialState({ projects: [], activeProjectId: null });
    expect(state.projects).toHaveLength(1);
    expect(state.activeProjectId).toBe(state.projects[0].id);
  });

  it("normalizes projects and falls back to the first project", () => {
    const state = prepareInitialState({
      projects: [legacyProject("a"), legacyProject("b")],
      activeProjectId: "gone",
    });
    expect(state.activeProjectId).toBe("a");
    expect(state.projects[0].screenshots[0].devices.length).toBeGreaterThan(0);
    expect(state.projects[0].textDefaults).toBeDefined();
  });
});

describe("bootstrapEditor", () => {
  it("loads browser storage without migrating", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    const migrate = vi.fn();
    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate,
    });
    expect(migrate).not.toHaveBeenCalled();
    expect(result.storage).toBe(storage);
    expect(result.notice).toEqual({ unwritable: false, migratedCount: 0 });
    expect(result.initialState.projects).toHaveLength(1);
  });

  it("passes the unwritable notice through", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: "unwritable" }),
      migrateBrowserProjects: vi.fn(),
    });
    expect(result.notice.unwritable).toBe(true);
  });

  it("migrates into an empty container and reloads", async () => {
    const server = createFakeServer();
    const storage = new ServerStorage(server.fetch);
    const progress = vi.fn();
    const migrate = vi.fn(async (options: { server: typeof storage; serverProjectCount: number }) => {
      expect(options.serverProjectCount).toBe(0);
      server.projects.set("moved", { revision: 1, project: legacyProject("moved") });
      server.state.activeProjectId = "moved";
      return 1;
    });

    const result = await bootstrapEditor(progress, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate as never,
    });

    expect(progress).toHaveBeenCalledWith("Moving projects into the container…");
    expect(result.notice.migratedCount).toBe(1);
    expect(result.initialState.activeProjectId).toBe("moved");
  });

  it("tells a resumed migration which projects are already in the container", async () => {
    const server = createFakeServer();
    server.projects.set("half", { revision: 1, project: legacyProject("half") });
    const storage = new ServerStorage(server.fetch);
    const migrate = vi.fn(async () => 0);

    await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate as never,
    });

    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({ serverProjectCount: 1, serverProjectIds: ["half"] }),
    );
  });

  it("keeps the container's projects when moving the browser's in fails", async () => {
    const server = createFakeServer();
    server.projects.set("kept", { revision: 1, project: legacyProject("kept") });
    server.state.activeProjectId = "kept";
    const storage = new ServerStorage(server.fetch);

    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: async () => {
        throw new StorageError('Couldn\'t move "Habitly" into the container');
      },
    });

    // The browser copy is untouched, so the next load retries; the editor opens
    // on what the container does have rather than refusing to start.
    expect(result.notice.migrationError).toMatch(/Habitly/);
    expect(result.storage).toBe(storage);
    expect(result.initialState.activeProjectId).toBe("kept");
  });

  it("falls back to this browser when the reload after migrating fails", async () => {
    const fallback = new BrowserStorage(createMemoryStorage());
    let loads = 0;
    const storage = {
      mode: "server",
      load: async () => {
        loads += 1;
        if (loads === 1) return { projects: [], activeProjectId: null };
        throw new StorageError("Loading projects failed (500)");
      },
    } as unknown as ProjectStorage;

    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: async () => 1,
      createBrowserStorage: () => fallback,
    });

    expect(result.storage).toBe(fallback);
    expect(result.notice.unwritable).toBe(true);
    expect(result.notice.migratedCount).toBe(1);
  });

  it("falls back to this browser when the container's state can't be loaded", async () => {
    const storage = new ServerStorage(async () => {
      throw new Error("offline");
    });
    const fallback = new BrowserStorage(createMemoryStorage());
    const migrate = vi.fn();

    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate,
      createBrowserStorage: () => fallback,
    });

    expect(result.storage).toBe(fallback);
    expect(result.notice.unwritable).toBe(true);
    expect(migrate).not.toHaveBeenCalled();
    expect(result.initialState.projects).toHaveLength(1);
  });
});

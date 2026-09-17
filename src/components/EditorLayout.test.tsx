/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useEditorMock = vi.fn();
vi.mock("../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

const useKeyboardShortcutsMock = vi.fn();
vi.mock("../lib/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: (handlers: unknown) => useKeyboardShortcutsMock(handlers),
}));

// This test only cares about the keyboard-shortcut handler map EditorLayout
// itself builds, not what any descendant renders — every descendant reads the
// same mocked useEditor and would need its own full context to render for
// real, which is a much bigger scaffold than the one line this guards. Stub
// them all out instead.
vi.mock("./LeftSidebar", () => ({ LeftSidebar: () => null }));
vi.mock("./RightSidebar", () => ({ RightSidebar: () => null }));
vi.mock("./CanvasPreview", () => ({ CanvasPreview: () => null }));
vi.mock("./FontPicker", () => ({ FontPicker: () => null }));
vi.mock("./GitHubStarModal", () => ({ GitHubStarModal: () => null }));
vi.mock("./NarrowScreenNotice", () => ({ NarrowScreenNotice: () => null }));
vi.mock("./ShortcutsModal", () => ({ ShortcutsModal: () => null }));
vi.mock("./AgentImport/AgentImportModal", () => ({ AgentImportModal: () => null }));
vi.mock("./ExportProgressOverlay", () => ({ ExportProgressOverlay: () => null }));
vi.mock("./Storage/StorageBanners", () => ({ StorageBanners: () => null }));

import { EditorLayout } from "./EditorLayout";

const baseContext = (storageMode: "server" | "browser") => ({
  isFontPickerOpen: false,
  setIsFontPickerOpen: vi.fn(),
  fontPickerScope: "screenshot" as const,
  isStarModalOpen: false,
  setIsStarModalOpen: vi.fn(),
  isShortcutsOpen: false,
  setIsShortcutsOpen: vi.fn(),
  isAgentImportOpen: false,
  setIsAgentImportOpen: vi.fn(),
  activeScreenshot: { fontFamily: "Inter" },
  textDefaults: { fontFamily: "Inter" },
  setTextDefault: vi.fn(),
  setActiveScreenshotText: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  selectedElement: null,
  removeDevice: vi.fn(),
  removeOverlayImage: vi.fn(),
  handleExport: vi.fn(),
  projects: [],
  saveNow: vi.fn(),
  saveStatus: { kind: "saved", at: null },
  saveConflict: null,
  startupNotice: { unwritable: false, migratedCount: 0 },
  dismissStartupNotice: vi.fn(),
  keepMyVersion: vi.fn(),
  loadTheirVersion: vi.fn(),
  // Not read by EditorLayout today. Included so a future change that starts
  // reading it doesn't need this test's mock updated to notice a regression.
  storageMode,
});

describe("EditorLayout keyboard wiring", () => {
  beforeEach(() => {
    useKeyboardShortcutsMock.mockClear();
  });

  it.each(["server", "browser"] as const)(
    "registers a save handler in %s storage mode, so Ctrl/Cmd+S never falls through to the browser's own dialog",
    (storageMode) => {
      useEditorMock.mockReturnValue(baseContext(storageMode));
      render(<EditorLayout />);

      expect(useKeyboardShortcutsMock).toHaveBeenCalledTimes(1);
      const handlers = useKeyboardShortcutsMock.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof handlers.save).toBe("function");
    },
  );
});

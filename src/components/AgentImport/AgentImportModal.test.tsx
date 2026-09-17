import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

const runAgentImportMock = vi.fn();
vi.mock("../../lib/agent-import/pipeline", () => ({
  runAgentImport: (...args: unknown[]) => runAgentImportMock(...args),
  readImageFile: vi.fn(),
}));

import { AgentImportModal } from "./AgentImportModal";

const project = {
  id: "p1",
  name: "Habitly",
  screenshots: [
    { id: "s1", devices: [{ screenshotSrc: "data:image/png;base64,AAA" }] },
    { id: "s2", devices: [{ screenshotSrc: null }] },
  ],
} as unknown as Project;

const writeText = vi.fn();
const applyAgentImport = vi.fn();

const pickFiles = () => {
  const file = new File(["{}"], "breezel.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [file] } });
  return file;
};

const dropZone = () => screen.getByText(/Drop the folder with/).closest("div")!;

describe("AgentImportModal", () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    applyAgentImport.mockReset();
    runAgentImportMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText } });
    useEditorMock.mockReturnValue({ projects: [], applyAgentImport, storageMode: "browser" });
  });

  it("doesn't measure browser storage when projects live in the container", async () => {
    useEditorMock.mockReturnValue({ projects: [], applyAgentImport, storageMode: "server" });
    runAgentImportMock.mockResolvedValue({ ok: true, project, warnings: [], storageWarning: null });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();
    await screen.findByText("Habitly");
    expect(runAgentImportMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ existingStorageChars: null }),
    );
  });

  it("renders nothing when closed", () => {
    render(<AgentImportModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("copies the agent prompt", async () => {
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy agent prompt/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("breezel.json")),
    );
    expect(await screen.findByRole("button", { name: /copied/i })).not.toBeNull();
  });

  it("lists blocking errors with paths and copies them", async () => {
    runAgentImportMock.mockResolvedValue({
      ok: false,
      errors: [{ path: "screens[0].layout", message: "bad layout" }],
    });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    const file = pickFiles();

    expect(await screen.findByText("screens[0].layout: bad layout")).not.toBeNull();
    expect(runAgentImportMock).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({ existingStorageChars: expect.any(Number) }),
    );

    fireEvent.click(screen.getByRole("button", { name: /copy errors/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("screens[0].layout: bad layout"));

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByLabelText("Choose files")).not.toBeNull();
  });

  it("summarizes and creates a new project", async () => {
    const onClose = vi.fn();
    runAgentImportMock.mockResolvedValue({
      ok: true,
      project,
      warnings: [{ path: "exportSize", message: "platform mismatch" }],
    });
    render(<AgentImportModal isOpen onClose={onClose} />);
    pickFiles();

    expect(await screen.findByText("Habitly")).not.toBeNull();
    expect(screen.getByText("2 screens")).not.toBeNull();
    expect(screen.getByText("exportSize: platform mismatch")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /create new project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "new");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls out the storage warning above the actions, apart from other warnings", async () => {
    const storageMessage = "Breezel may stop saving your work";
    runAgentImportMock.mockResolvedValue({
      ok: true,
      project,
      warnings: [{ path: "exportSize", message: "platform mismatch" }],
      storageWarning: { path: "", message: storageMessage },
    });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();

    const callout = await screen.findByRole("alert");
    expect(callout.textContent).toContain("This import may not save");
    expect(callout.textContent).toContain(storageMessage);
    expect(screen.getByText("1 warning")).not.toBeNull();
    const warningList = screen.getByText("exportSize: platform mismatch").closest("ul")!;
    expect(warningList.textContent).not.toContain(storageMessage);
    // Directly above the action buttons.
    const createButton = screen.getByRole("button", { name: /create new project/i });
    expect(callout.nextElementSibling?.contains(createButton)).toBe(true);
  });

  it("can replace the current project", async () => {
    runAgentImportMock.mockResolvedValue({ ok: true, project, warnings: [] });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();

    fireEvent.click(await screen.findByRole("button", { name: /replace current project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "replace");
  });

  it("ignores an import result that arrives after the modal was closed", async () => {
    let resolveImport!: (value: unknown) => void;
    runAgentImportMock.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );
    const onClose = vi.fn();
    const { rerender } = render(<AgentImportModal isOpen onClose={onClose} />);
    pickFiles();
    expect(await screen.findByRole("status")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /close import from agent/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<AgentImportModal isOpen={false} onClose={onClose} />);

    await act(async () => {
      resolveImport({ ok: true, project, warnings: [] });
    });

    rerender(<AgentImportModal isOpen onClose={onClose} />);
    expect(screen.getByLabelText("Choose files")).not.toBeNull();
    expect(screen.queryByText("Habitly")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a folder-walk failure as an import error", async () => {
    const entry = {
      isFile: true,
      isDirectory: false,
      name: "breezel.json",
      file: (_success: (file: File) => void, error: (err: unknown) => void) =>
        error(new Error("boom")),
    };
    render(<AgentImportModal isOpen onClose={vi.fn()} />);

    fireEvent.drop(dropZone(), {
      dataTransfer: { items: [{ webkitGetAsEntry: () => entry }], files: [] },
    });

    expect(await screen.findByText("boom")).not.toBeNull();
    expect(runAgentImportMock).not.toHaveBeenCalled();
  });

  it("returns to the drop step when a drop yields no files", async () => {
    render(<AgentImportModal isOpen onClose={vi.fn()} />);

    fireEvent.drop(dropZone(), { dataTransfer: { items: [], files: [] } });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByLabelText("Choose files")).not.toBeNull();
    expect(runAgentImportMock).not.toHaveBeenCalled();
  });

  it("swallows drops that miss the drop zone so the browser doesn't navigate", () => {
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    expect(fireEvent.dragOver(dialog)).toBe(false);
    expect(fireEvent.drop(dialog)).toBe(false);
    expect(runAgentImportMock).not.toHaveBeenCalled();
  });
});

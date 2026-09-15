import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const file = new File(["{}"], "appshots.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [file] } });
  return file;
};

describe("AgentImportModal", () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    applyAgentImport.mockReset();
    runAgentImportMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText } });
    useEditorMock.mockReturnValue({ projects: [], applyAgentImport });
  });

  it("renders nothing when closed", () => {
    render(<AgentImportModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("copies the agent prompt", async () => {
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy agent prompt/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("appshots.json")),
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

    fireEvent.click(screen.getByRole("button", { name: /create new project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "new");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can replace the current project", async () => {
    runAgentImportMock.mockResolvedValue({ ok: true, project, warnings: [] });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();

    fireEvent.click(await screen.findByRole("button", { name: /replace current project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "replace");
  });
});

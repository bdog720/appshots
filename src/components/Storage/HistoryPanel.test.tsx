import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryVersion } from "../../lib/storage/types";
import { HistoryPanel, formatVersionTime } from "./HistoryPanel";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();
const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).getTime();

const versions: HistoryVersion[] = [
  { version: `${at(15, 11)}-9`, revision: 9, savedAt: at(15, 11), pinned: true, label: "Saved", screenCount: 9, firstHeadline: "Build habits that stick" },
  { version: `${at(14, 9)}-4`, revision: 4, savedAt: at(14, 9), pinned: false, screenCount: 1, firstHeadline: "" },
];

const renderPanel = (overrides: Partial<Parameters<typeof HistoryPanel>[0]> = {}) => {
  const props = {
    isOpen: true,
    projectId: "p1",
    onClose: vi.fn(),
    loadHistory: vi.fn(async () => versions),
    onRestore: vi.fn(async () => {}),
    now: () => NOW,
    ...overrides,
  };
  render(<HistoryPanel {...props} />);
  return props;
};

describe("formatVersionTime", () => {
  it("uses Today, Yesterday or a date", () => {
    expect(formatVersionTime(at(15, 11), NOW)).toMatch(/^Today /);
    expect(formatVersionTime(at(14, 9), NOW)).toMatch(/^Yesterday /);
    expect(formatVersionTime(at(12, 16), NOW)).not.toMatch(/^(Today|Yesterday)/);
  });
});

describe("HistoryPanel", () => {
  it("renders nothing when closed", () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists versions with screens, headline, pin and label", async () => {
    renderPanel();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/9 screens/)).not.toBeNull();
    expect(within(items[0]).getByText("“Build habits that stick”")).not.toBeNull();
    expect(within(items[0]).getByLabelText("Pinned")).not.toBeNull();
    // role="img" so assistive tech that ignores a bare span's aria-label
    // still announces it.
    expect(within(items[0]).getByRole("img", { name: "Pinned" })).not.toBeNull();
    expect(within(items[0]).getByText("Saved")).not.toBeNull();
    expect(within(items[1]).getByText(/1 screen$/)).not.toBeNull();
    expect(within(items[1]).queryByLabelText("Pinned")).toBeNull();
  });

  it("shows an empty state", async () => {
    renderPanel({ loadHistory: vi.fn(async () => []) });
    expect(await screen.findByText("No versions yet. Versions are saved as you work.")).not.toBeNull();
  });

  it("shows load errors and retries", async () => {
    const loadHistory = vi
      .fn<() => Promise<HistoryVersion[]>>()
      .mockRejectedValueOnce(new Error("Loading history failed (500)"))
      .mockResolvedValueOnce(versions);
    renderPanel({ loadHistory });
    expect(await screen.findByText("Loading history failed (500)")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("confirms before restoring, then closes", async () => {
    const props = renderPanel();
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[1]).getByRole("button", { name: "Restore" }));
    expect(screen.getByText("Replace current content with this version? Your current state is saved to history first.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Replace current content/)).toBeNull();

    fireEvent.click(within(items[1]).getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    await waitFor(() => expect(props.onRestore).toHaveBeenCalledWith(versions[1].version));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the panel open and shows the error when restore fails", async () => {
    const props = renderPanel({
      onRestore: vi.fn(async () => {
        throw new Error("Restoring a version failed (404)");
      }),
    });
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[0]).getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    expect(await screen.findByText("Restoring a version failed (404)")).not.toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("loads once per open, not on every render", async () => {
    const loadHistory = vi.fn(async () => versions);
    const props = { isOpen: true, projectId: "p1", onClose: vi.fn(), onRestore: vi.fn(async () => {}), now: () => NOW };
    const { rerender } = render(<HistoryPanel {...props} loadHistory={loadHistory} />);
    await screen.findAllByRole("listitem");
    rerender(<HistoryPanel {...props} loadHistory={vi.fn(async () => versions)} />);
    rerender(<HistoryPanel {...props} loadHistory={vi.fn(async () => versions)} />);
    expect(loadHistory).toHaveBeenCalledTimes(1);
  });

  it("doesn't flash the previous project's list when switching to a different project", async () => {
    const props = { isOpen: true, onClose: vi.fn(), onRestore: vi.fn(async () => {}), now: () => NOW };
    const { rerender } = render(
      <HistoryPanel {...props} projectId="p1" loadHistory={vi.fn(async () => versions)} />,
    );
    await screen.findAllByRole("listitem");

    let resolveSecond!: (loaded: HistoryVersion[]) => void;
    const second = vi.fn(() => new Promise<HistoryVersion[]>((resolve) => (resolveSecond = resolve)));
    rerender(<HistoryPanel {...props} projectId="p2" loadHistory={second} />);

    // Before the new project's own load resolves, "p1"'s list must be gone —
    // not left on screen alongside (or instead of) a loading state.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Loading versions…")).not.toBeNull();

    resolveSecond(versions);
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });
});

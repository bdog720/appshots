import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BROWSER_STORAGE_FULL_MESSAGE } from "../../lib/storage/browser-storage";
import type { SaveConflict, SaveStatus } from "../../lib/storage/useProjectPersistence";
import { SaveIndicator, formatSavedAt } from "./SaveIndicator";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();

const CONFLICT: SaveConflict = { kind: "conflict", projectId: "p", revision: 3, savedAt: 1 };

const renderIndicator = (
  status: SaveStatus,
  storageMode: "server" | "browser" = "server",
  conflict: SaveConflict | null = null,
) => {
  const handlers = { onSaveNow: vi.fn(), onRetry: vi.fn(), onOpenHistory: vi.fn() };
  render(
    <SaveIndicator
      status={status}
      conflict={conflict}
      activeProjectId="p"
      storageMode={storageMode}
      now={() => NOW}
      {...handlers}
    />,
  );
  return handlers;
};

describe("formatSavedAt", () => {
  it("describes how long ago the last save was", () => {
    expect(formatSavedAt(null, NOW)).toBe("Saved");
    expect(formatSavedAt(NOW - 10_000, NOW)).toBe("Saved · just now");
    expect(formatSavedAt(NOW - 5 * 60_000, NOW)).toBe("Saved · 5 min ago");
    expect(formatSavedAt(NOW - 3 * 3_600_000, NOW)).toMatch(/^Saved · \d{1,2}:\d{2}/);
  });
});

describe("SaveIndicator", () => {
  it("shows each save state", () => {
    const { unmount } = render(
      <SaveIndicator
        status={{ kind: "dirty" }}
        conflict={null}
        activeProjectId="p"
        storageMode="browser"
        onSaveNow={vi.fn()}
        onRetry={vi.fn()}
        onOpenHistory={vi.fn()}
      />,
    );
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    unmount();

    renderIndicator({ kind: "saving" });
    expect(screen.getByText("Saving…")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Retry only after an error", () => {
    const handlers = renderIndicator({ kind: "error", message: BROWSER_STORAGE_FULL_MESSAGE });
    expect(screen.getByText("Couldn't save")).not.toBeNull();
    expect(screen.getByTitle(BROWSER_STORAGE_FULL_MESSAGE)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("announces the error reason and hint within the same live region as the label", () => {
    renderIndicator({ kind: "error", message: BROWSER_STORAGE_FULL_MESSAGE }, "browser");
    // The whole point of making this visible was that a tooltip alone isn't
    // reliably announced — so the detail and hint must live inside the same
    // accessible live region as "Couldn't save", not merely be visible text
    // somewhere on the page.
    const region = screen.getByRole("status");
    expect(within(region).getByText("Couldn't save")).not.toBeNull();
    expect(within(region).getByText(BROWSER_STORAGE_FULL_MESSAGE)).not.toBeNull();
    expect(within(region).getByText(/delete or shrink a project/i)).not.toBeNull();
    // One coherent announcement: the label isn't repeated.
    expect(region.textContent?.match(/Couldn't save/g)?.length).toBe(1);
  });

  it("does not add the storage-full hint for other browser-mode error messages", () => {
    renderIndicator({ kind: "error", message: "Can't reach the AppShots server" }, "browser");
    const region = screen.getByRole("status");
    expect(within(region).getByText("Can't reach the AppShots server")).not.toBeNull();
    expect(within(region).queryByText(/delete or shrink a project/i)).toBeNull();
  });

  it("keeps the announced text stable across the periodic re-render tick", async () => {
    vi.useFakeTimers();
    try {
      renderIndicator({ kind: "error", message: BROWSER_STORAGE_FULL_MESSAGE }, "browser");
      const region = screen.getByRole("status");
      const before = region.textContent;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      // Same text in, same text out: nothing re-announces on the unrelated tick.
      expect(region.textContent).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the conflict when it's the project on screen, and holds Save now", () => {
    renderIndicator({ kind: "dirty" }, "server", CONFLICT);
    expect(screen.getByText("Changed elsewhere")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves Save now alive when the conflict belongs to another project", () => {
    // Only the conflicted project is held back; the one on screen still saves,
    // so a dead Save now button here would be a lie about this project.
    renderIndicator({ kind: "dirty" }, "server", { ...CONFLICT, projectId: "other" });
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("still reports a failed save while a conflict is live", () => {
    // The failure is the more urgent of the two, and it's the only one whose
    // fix — Retry — lives in this indicator; the conflict has its own banner.
    const handlers = renderIndicator(
      { kind: "error", message: "Can't reach the AppShots server" },
      "server",
      CONFLICT,
    );
    expect(screen.getByText("Couldn't save")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("saves now and opens history in container mode only", () => {
    const handlers = renderIndicator({ kind: "saved", at: NOW });
    expect(screen.getByText("Saved · just now")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(handlers.onSaveNow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(handlers.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("hides history in browser mode", () => {
    renderIndicator({ kind: "saved", at: null }, "browser");
    expect(screen.queryByRole("button", { name: "Version history" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("renders plain 'Saved' when there is no save timestamp", () => {
    renderIndicator({ kind: "saved", at: null });
    expect(screen.getByText("Saved")).not.toBeNull();
  });
});

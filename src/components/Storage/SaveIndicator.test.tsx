import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";
import { SaveIndicator, formatSavedAt } from "./SaveIndicator";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();

const renderIndicator = (status: SaveStatus, storageMode: "server" | "browser" = "server") => {
  const handlers = { onSaveNow: vi.fn(), onRetry: vi.fn(), onOpenHistory: vi.fn() };
  render(<SaveIndicator status={status} storageMode={storageMode} now={() => NOW} {...handlers} />);
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
      <SaveIndicator status={{ kind: "dirty" }} storageMode="browser" onSaveNow={vi.fn()} onRetry={vi.fn()} onOpenHistory={vi.fn()} />,
    );
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    unmount();

    renderIndicator({ kind: "saving" });
    expect(screen.getByText("Saving…")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Retry only after an error", () => {
    const handlers = renderIndicator({ kind: "error", message: "Browser storage is full" });
    expect(screen.getByText("Couldn't save")).not.toBeNull();
    expect(screen.getByTitle("Browser storage is full")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows conflicts", () => {
    renderIndicator({ kind: "conflict", projectId: "p", revision: 3, savedAt: 1 });
    expect(screen.getByText("Changed elsewhere")).not.toBeNull();
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
});

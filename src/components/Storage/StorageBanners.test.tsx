import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageBanners } from "./StorageBanners";

const baseProps = {
  notice: { unwritable: false, migratedCount: 0 },
  conflict: null,
  conflictProjectName: null,
  onDismissNotice: vi.fn(),
  onKeepMine: vi.fn(async () => {}),
  onLoadTheirs: vi.fn(async () => {}),
};

describe("StorageBanners", () => {
  it("renders nothing without notices or conflicts", () => {
    const { container } = render(<StorageBanners {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("explains unwritable container storage", () => {
    const onDismissNotice = vi.fn();
    render(<StorageBanners {...baseProps} notice={{ unwritable: true, migratedCount: 0 }} onDismissNotice={onDismissNotice} />);
    expect(screen.getByText("Couldn't use container storage — saving to this browser instead.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("reports migrated projects with correct plurals", () => {
    const { unmount } = render(<StorageBanners {...baseProps} notice={{ unwritable: false, migratedCount: 1 }} />);
    expect(screen.getByText("Moved 1 project from this browser into the container.")).not.toBeNull();
    unmount();
    render(<StorageBanners {...baseProps} notice={{ unwritable: false, migratedCount: 3 }} />);
    expect(screen.getByText("Moved 3 projects from this browser into the container.")).not.toBeNull();
  });

  it("surfaces a migration error without alarming about the browser copy", () => {
    const onDismissNotice = vi.fn();
    render(
      <StorageBanners
        {...baseProps}
        notice={{ unwritable: false, migratedCount: 0, migrationError: "Can't reach the AppShots server" }}
        onDismissNotice={onDismissNotice}
      />,
    );
    expect(
      screen.getByText("Couldn't move your projects into the container — they're still saved in this browser."),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("resolves conflicts and shows failures", async () => {
    const onKeepMine = vi.fn(async () => {});
    const onLoadTheirs = vi.fn(async () => {
      throw new Error("Can't reach the AppShots server");
    });
    render(
      <StorageBanners
        {...baseProps}
        conflict={{ kind: "conflict", projectId: "p", revision: 2, savedAt: 1 }}
        conflictProjectName="Habitly"
        onKeepMine={onKeepMine}
        onLoadTheirs={onLoadTheirs}
      />,
    );
    expect(screen.getByText("“Habitly” was changed in another tab or device.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(onKeepMine).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Load their version" }));
    expect(await screen.findByText("Can't reach the AppShots server")).not.toBeNull();
  });
});

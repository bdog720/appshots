/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useEditorMock = vi.fn();
vi.mock("../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { ExportProgressOverlay } from "./ExportProgressOverlay";

describe("ExportProgressOverlay", () => {
  it("renders nothing when no export is in progress", () => {
    useEditorMock.mockReturnValue({ exportProgress: null });
    const { container } = render(<ExportProgressOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the rendered/total count and fills the bar proportionally", () => {
    useEditorMock.mockReturnValue({ exportProgress: { rendered: 2, total: 5 } });
    render(<ExportProgressOverlay />);

    expect(screen.getByText(/2 of 5 rendered/i)).not.toBeNull();

    const status = screen.getByRole("status");
    const bar = status.querySelector<HTMLElement>("[style*='scaleX']");
    expect(bar?.style.transform).toBe("scaleX(0.4)");
  });
});

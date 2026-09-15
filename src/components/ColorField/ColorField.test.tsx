/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { ColorField } from "./ColorField";

describe("ColorField", () => {
  beforeEach(() => {
    useEditorMock.mockReturnValue({
      savedColors: ["#111111"],
      addSavedColor: vi.fn(),
      removeSavedColor: vi.fn(),
    });
  });

  it("does not show the popover until the trigger is clicked", () => {
    render(<ColorField value="#ffffff" onChange={vi.fn()} label="Fill" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the popover on trigger click", () => {
    render(<ColorField value="#ffffff" onChange={vi.fn()} label="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(screen.getByRole("dialog", { name: "Fill" })).toBeTruthy();
  });

  it("closes the popover on Escape", () => {
    render(<ColorField value="#ffffff" onChange={vi.fn()} label="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the popover on outside click", () => {
    render(<ColorField value="#ffffff" onChange={vi.fn()} label="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the popover after picking a saved swatch, and calls onChange", () => {
    const onChange = vi.fn();
    render(<ColorField value="#ffffff" onChange={onChange} label="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: "Use #111111" }));
    expect(onChange).toHaveBeenCalledWith("#111111");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the default trigger with the current value as its background", () => {
    render(<ColorField value="#8b5cf6" onChange={vi.fn()} label="Fill" />);
    const trigger = screen.getByRole("button", { name: "Fill" });
    expect(trigger.style.backgroundColor).toBe("rgb(139, 92, 246)");
  });

  it("uses a custom trigger via renderTrigger", () => {
    render(
      <ColorField
        value="#ffffff"
        onChange={vi.fn()}
        label="Fill"
        renderTrigger={({ open, isOpen }) => (
          <button onClick={open}>{isOpen ? "open!" : "custom trigger"}</button>
        )}
      />,
    );
    expect(screen.getByText("custom trigger")).toBeTruthy();
    fireEvent.click(screen.getByText("custom trigger"));
    expect(screen.getByText("open!")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

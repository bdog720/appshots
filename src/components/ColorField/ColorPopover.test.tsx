/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { ColorPopover } from "./ColorPopover";

describe("ColorPopover", () => {
  const addSavedColor = vi.fn();
  const removeSavedColor = vi.fn();

  beforeEach(() => {
    addSavedColor.mockClear();
    removeSavedColor.mockClear();
    useEditorMock.mockReturnValue({
      savedColors: ["#111111", "#222222"],
      addSavedColor,
      removeSavedColor,
    });
  });

  afterEach(() => {
    delete window.EyeDropper;
  });

  it("renders as a labeled dialog", () => {
    render(
      <ColorPopover
        value="#ffffff"
        onChange={vi.fn()}
        onClose={vi.fn()}
        label="Text color"
      />,
    );
    expect(screen.getByRole("dialog", { name: "Text color" })).toBeTruthy();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ColorPopover value="#ffffff" onChange={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(<ColorPopover value="#ffffff" onChange={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("presentation"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("typing a valid hex calls onChange", () => {
    const onChange = vi.fn();
    render(<ColorPopover value="#ffffff" onChange={onChange} onClose={vi.fn()} />);

    const hexInput = screen.getByLabelText("Hex color") as HTMLInputElement;
    fireEvent.change(hexInput, { target: { value: "#123abc" } });

    expect(onChange).toHaveBeenCalledWith("#123abc");
  });

  it("renders the saved-swatch palette and clicking a swatch calls onChange and closes", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<ColorPopover value="#ffffff" onChange={onChange} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Use #111111" }));

    expect(onChange).toHaveBeenCalledWith("#111111");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("+ saves the current color to the palette", () => {
    render(<ColorPopover value="#654321" onChange={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save color to palette" }));

    expect(addSavedColor).toHaveBeenCalledWith("#654321");
  });

  it("✕ removes a swatch from the palette", () => {
    render(<ColorPopover value="#ffffff" onChange={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove #111111" }));

    expect(removeSavedColor).toHaveBeenCalledWith("#111111");
  });

  it("hides the saved-swatch palette when showSavedColors is false", () => {
    render(
      <ColorPopover
        value="#ffffff"
        onChange={vi.fn()}
        onClose={vi.fn()}
        showSavedColors={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Use #111111" })).toBeNull();
  });

  it("omits the eyedropper button when window.EyeDropper is undefined", () => {
    render(<ColorPopover value="#ffffff" onChange={vi.fn()} onClose={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /eyedropper/i }),
    ).toBeNull();
  });

  it("wires the eyedropper button when window.EyeDropper is supported", () => {
    window.EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#abcdef" });
      }
    };
    render(<ColorPopover value="#ffffff" onChange={vi.fn()} onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /eyedropper/i }),
    ).toBeTruthy();
  });
});

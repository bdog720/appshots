/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { ColorPicker } from "./ColorPicker";

describe("ColorPicker", () => {
  beforeEach(() => {
    useEditorMock.mockReturnValue({
      savedColors: [],
      addSavedColor: vi.fn(),
      removeSavedColor: vi.fn(),
    });
  });

  it("renders a trigger labeled by the tooltip text, with no dialog until clicked", () => {
    render(
      <ColorPicker value="#ffffff" onChange={vi.fn()} onMouseDown={vi.fn()} tooltip="Text Color" />,
    );
    expect(screen.getByLabelText("Text Color")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the color popover on click", () => {
    render(
      <ColorPicker value="#ffffff" onChange={vi.fn()} onMouseDown={vi.fn()} tooltip="Text Color" />,
    );
    fireEvent.click(screen.getByLabelText("Text Color"));
    expect(screen.getByRole("dialog", { name: "Text Color" })).toBeTruthy();
  });

  it("adapts hex entry to the input-event onChange signature", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker value="#ffffff" onChange={onChange} onMouseDown={vi.fn()} tooltip="Text Color" />,
    );
    fireEvent.click(screen.getByLabelText("Text Color"));

    const hexInput = screen.getByLabelText("Hex color");
    fireEvent.change(hexInput, { target: { value: "#123abc" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0][0];
    expect(event.target.value).toBe("#123abc");
  });

  it("calls onMouseDown on the trigger for toolbar focus management", () => {
    const onMouseDown = vi.fn();
    render(
      <ColorPicker value="#ffffff" onChange={vi.fn()} onMouseDown={onMouseDown} tooltip="Text Color" />,
    );
    fireEvent.mouseDown(screen.getByLabelText("Text Color"));
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });
});

/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FontPicker } from "./FontPicker";

function renderPicker(onClose = vi.fn()) {
  render(
    <FontPicker
      isOpen
      onClose={onClose}
      selectedFontFamily="Inter"
      onSelect={vi.fn()}
    />,
  );
  return onClose;
}

describe("FontPicker accessibility", () => {
  it("exposes the modal as a dialog", () => {
    renderPicker();
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = renderPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = renderPicker();
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the dialog body is clicked", () => {
    const onClose = renderPicker();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

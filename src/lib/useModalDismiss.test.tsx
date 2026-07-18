/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalDismiss } from "./useModalDismiss";

afterEach(cleanup);

function Modal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalDismiss({ isOpen, onClose, containerRef: ref });
  if (!isOpen) return null;
  return (
    <div ref={ref} tabIndex={-1} data-testid="modal">
      <button>inside</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe("useModalDismiss", () => {
  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not respond to Escape when closed", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the modal on open and restores it to the trigger on close", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByTestId("modal"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
});

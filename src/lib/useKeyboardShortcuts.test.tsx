import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function Harness({ onSave }: { onSave: () => void }) {
  useKeyboardShortcuts({ save: onSave });
  return <input data-testid="field" />;
}

describe("useKeyboardShortcuts", () => {
  it("prevents the browser's own Save dialog on Ctrl/Cmd+S", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    // fireEvent returns the result of dispatchEvent: false once a handler
    // has called preventDefault() on a cancelable event.
    const notPrevented = fireEvent.keyDown(window, { key: "s", metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("still prevents the Save dialog while a text field is focused", () => {
    const onSave = vi.fn();
    const { getByTestId } = render(<Harness onSave={onSave} />);
    const field = getByTestId("field");

    const notPrevented = fireEvent.keyDown(field, { key: "s", metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("leaves a bare 's' while typing alone", () => {
    const onSave = vi.fn();
    const { getByTestId } = render(<Harness onSave={onSave} />);
    const field = getByTestId("field");

    const notPrevented = fireEvent.keyDown(field, { key: "s" });

    expect(onSave).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });
});

/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EyedropperButton } from "./EyedropperButton";

describe("EyedropperButton", () => {
  afterEach(() => {
    delete window.EyeDropper;
  });

  it("renders nothing when window.EyeDropper is undefined", () => {
    const { container } = render(<EyedropperButton onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a button when window.EyeDropper is supported", () => {
    window.EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#123456" });
      }
    };
    render(<EyedropperButton onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /eyedropper/i })).toBeTruthy();
  });

  it("calls onChange with the sampled hex on click", async () => {
    window.EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#123456" });
      }
    };
    const onChange = vi.fn();
    render(<EyedropperButton onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /eyedropper/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("#123456"));
  });

  it("does not call onChange when the sample is cancelled", async () => {
    window.EyeDropper = class {
      open() {
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }
    };
    const onChange = vi.fn();
    render(<EyedropperButton onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /eyedropper/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

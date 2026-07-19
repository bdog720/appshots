/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Screenshot } from "../../types";
import { bestReadableText } from "../../lib/design-guidance";
import { ContrastIndicator } from "./ContrastIndicator";

function makeScreenshot(overrides: Partial<Screenshot> = {}): Screenshot {
  return {
    id: "s1",
    headline: "Headline",
    subheadline: "Subheadline",
    backgroundColor: "#ffffff",
    backgroundMode: "solid",
    gradientPresetId: null,
    textColor: "#000000",
    headlineX: 0,
    headlineY: 0,
    headlineWidth: 80,
    subheadlineX: 0,
    subheadlineY: 0,
    subheadlineWidth: 80,
    fontFamily: "Inter",
    headlineFontSize: 72,
    subheadlineFontSize: 42,
    textOverrides: [],
    overlayImages: [],
    devices: [],
    activeDeviceId: "",
    ...overrides,
  };
}

describe("ContrastIndicator", () => {
  it("renders nothing when the background has no measurable base color", () => {
    const { container } = render(
      <ContrastIndicator
        textColor="#ffffff"
        screenshot={makeScreenshot({ backgroundMode: "image" })}
        onFix={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a positive readout and no Fix button when contrast is good", () => {
    render(
      <ContrastIndicator
        textColor="#000000"
        screenshot={makeScreenshot({ backgroundColor: "#ffffff" })}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/contrast/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /fix/i })).toBeNull();
  });

  it("warns and offers a Fix when contrast is too low", () => {
    render(
      <ContrastIndicator
        textColor="#ffffff"
        screenshot={makeScreenshot({ backgroundColor: "#ffffff" })}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/low contrast/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /fix/i })).toBeTruthy();
  });

  it("shows the contrast ratio", () => {
    render(
      <ContrastIndicator
        textColor="#000000"
        screenshot={makeScreenshot({ backgroundColor: "#ffffff" })}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/21(\.0)?:1/)).toBeTruthy();
  });

  it("calls onFix with the suggested readable color", () => {
    const onFix = vi.fn();
    render(
      <ContrastIndicator
        textColor="#ffffff"
        screenshot={makeScreenshot({ backgroundColor: "#ffffff" })}
        onFix={onFix}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fix/i }));
    expect(onFix).toHaveBeenCalledWith(bestReadableText("#ffffff"));
  });
});

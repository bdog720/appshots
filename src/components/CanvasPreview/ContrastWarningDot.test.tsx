/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Screenshot } from "../../types";
import { ContrastWarningDot } from "./ContrastWarningDot";

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

describe("ContrastWarningDot", () => {
  it("renders nothing when the screenshot text is readable", () => {
    const { container } = render(
      <ContrastWarningDot
        screenshot={makeScreenshot({ textColor: "#000000", backgroundColor: "#ffffff" })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a warning marker when the screenshot has a contrast issue", () => {
    render(
      <ContrastWarningDot
        screenshot={makeScreenshot({ textColor: "#ffffff", backgroundColor: "#ffffff" })}
      />,
    );
    expect(screen.getByRole("img", { name: /contrast/i })).toBeTruthy();
  });

  it("renders nothing for image-mode backgrounds (nothing measurable)", () => {
    const { container } = render(
      <ContrastWarningDot
        screenshot={makeScreenshot({ textColor: "#ffffff", backgroundMode: "image" })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

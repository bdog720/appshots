import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { gradientPresets } from "../../constants";
import type { Screenshot } from "../../types";

// AppearanceSection renders BackgroundPicker -> SwatchColorInput, which reads
// the saved-colors palette off EditorContext directly. Mock it the same way
// DesignCheckSection.test.tsx does, since there's no EditorProvider in this test.
const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { AppearanceSection } from "./AppearanceSection";

const makeScreenshot = (over: Partial<Screenshot> = {}): Screenshot =>
  ({
    id: "s1",
    headline: "H",
    subheadline: "S",
    backgroundColor: "#8b5cf6",
    backgroundMode: "solid",
    gradientPresetId: null,
    textColor: "#ffffff",
    headlineX: 50, headlineY: 10, headlineWidth: 80,
    subheadlineX: 50, subheadlineY: 18, subheadlineWidth: 80,
    fontFamily: "Inter", headlineFontSize: 72, subheadlineFontSize: 42,
    textOverrides: [], overlayImages: [], devices: [], activeDeviceId: "d1",
    backgroundOverride: true,
    ...over,
  }) as Screenshot;

describe("AppearanceSection scope", () => {
  beforeEach(() => {
    useEditorMock.mockReturnValue({
      savedColors: [],
      addSavedColor: vi.fn(),
      removeSavedColor: vi.fn(),
    });
  });

  it("routes edits to the global default in Global scope", () => {
    const onSetDefault = vi.fn();
    const onSetScreenshot = vi.fn();
    render(
      <AppearanceSection
        screenshot={makeScreenshot()}
        gradientPresets={gradientPresets}
        onSetBackgroundDefault={onSetDefault}
        onSetScreenshotBackground={onSetScreenshot}
        onResetScreenshotBackground={vi.fn()}
        onFixTextColor={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /gradient/i }));
    // Global is the default scope → default handler used, not the screenshot one.
    expect(onSetDefault).toHaveBeenCalledWith({ backgroundMode: "gradient" });
    expect(onSetScreenshot).not.toHaveBeenCalled();
  });

  it("shows Reset when the active screenshot overrides its background", () => {
    render(
      <AppearanceSection
        screenshot={makeScreenshot({ backgroundOverride: true })}
        gradientPresets={gradientPresets}
        onSetBackgroundDefault={vi.fn()}
        onSetScreenshotBackground={vi.fn()}
        onResetScreenshotBackground={vi.fn()}
        onFixTextColor={vi.fn()}
      />,
    );
    // Switch to This-screenshot scope to reveal the reset control.
    fireEvent.click(screen.getByRole("button", { name: /this screenshot/i }));
    expect(screen.getByRole("button", { name: /reset/i })).toBeTruthy();
  });
});

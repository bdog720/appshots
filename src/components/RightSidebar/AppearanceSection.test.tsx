import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { gradientPresets } from "../../constants";
import type { Screenshot, BackgroundSettings } from "../../types";
import { DEFAULT_BACKGROUND_SETTINGS } from "../../lib/background-settings";

// AppearanceSection renders BackgroundPicker -> ColorField -> ColorPopover,
// which reads the saved-colors palette off EditorContext directly. Mock it
// the same way DesignCheckSection.test.tsx does, since there's no
// EditorProvider in this test.
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
        backgroundDefaults={DEFAULT_BACKGROUND_SETTINGS}
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
        backgroundDefaults={DEFAULT_BACKGROUND_SETTINGS}
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

  it("shows the project's background default (not the screenshot's) in Global scope", () => {
    // The active screenshot is solid and overridden (as every migrated
    // screenshot is); the project default is a gradient. Global-scope edits
    // route to the default, so the picker must render the default's mode, not
    // the screenshot's — otherwise a global edit gives no visible feedback.
    const gradientDefaults: BackgroundSettings = {
      backgroundMode: "gradient",
      backgroundColor: "#8b5cf6",
      gradientPresetId: gradientPresets[0].id,
    };
    render(
      <AppearanceSection
        screenshot={makeScreenshot({
          backgroundMode: "solid",
          backgroundOverride: true,
        })}
        gradientPresets={gradientPresets}
        backgroundDefaults={gradientDefaults}
        onSetBackgroundDefault={vi.fn()}
        onSetScreenshotBackground={vi.fn()}
        onResetScreenshotBackground={vi.fn()}
        onFixTextColor={vi.fn()}
      />,
    );
    // Global scope is the default. The Gradient mode button should read as
    // active, and the gradient-preset swatches (not the solid-color swatch)
    // should be showing — both driven by the default, not the screenshot.
    const gradientButton = screen.getByRole("button", { name: /^gradient$/i });
    expect(gradientButton.className).toMatch(/bg-white/);
    expect(
      screen.getByRole("button", { name: `${gradientPresets[0].label} gradient` }),
    ).toBeTruthy();
  });
});

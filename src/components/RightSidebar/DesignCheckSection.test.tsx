/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Screenshot } from "../../types";
import { bestReadableText } from "../../lib/design-guidance";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

import { DesignCheckSection } from "./DesignCheckSection";

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

function mockEditor(screenshots: Screenshot[]) {
  const setScreenshots = vi.fn();
  const setActiveScreenshotId = vi.fn();
  useEditorMock.mockReturnValue({
    screenshots,
    setScreenshots,
    setActiveScreenshotId,
    activeScreenshotId: screenshots[0]?.id ?? "",
  });
  return { setScreenshots, setActiveScreenshotId };
}

const readable = makeScreenshot({ id: "ok", textColor: "#000000", backgroundColor: "#ffffff" });
const unreadable = makeScreenshot({ id: "bad", textColor: "#ffffff", backgroundColor: "#ffffff" });

describe("DesignCheckSection", () => {
  it("shows a positive empty state when every screenshot is readable", () => {
    mockEditor([readable, makeScreenshot({ id: "ok2" })]);
    render(<DesignCheckSection />);
    expect(screen.getByText(/readable on every screenshot/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /fix/i })).toBeNull();
  });

  it("lists a row with the ratio for each screenshot that has an issue", () => {
    mockEditor([readable, unreadable]);
    render(<DesignCheckSection />);
    expect(screen.getByText(/1\.0:1/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /fix/i })).toHaveLength(1);
  });

  it("fixes the offending screenshot's text color when Fix is clicked", () => {
    const { setScreenshots } = mockEditor([readable, unreadable]);
    render(<DesignCheckSection />);
    fireEvent.click(screen.getByRole("button", { name: /fix/i }));

    expect(setScreenshots).toHaveBeenCalledTimes(1);
    const next = setScreenshots.mock.calls[0][0] as Screenshot[];
    const fixed = next.find((s) => s.id === "bad")!;
    expect(fixed.textColor).toBe(bestReadableText("#ffffff"));
    expect(fixed.textOverrides).toContain("textColor");
    // The already-readable screenshot is untouched.
    expect(next.find((s) => s.id === "ok")!.textColor).toBe("#000000");
  });

  it("activates the screenshot when its row is clicked", () => {
    const { setActiveScreenshotId } = mockEditor([readable, unreadable]);
    render(<DesignCheckSection />);
    fireEvent.click(screen.getByRole("button", { name: /go to/i }));
    expect(setActiveScreenshotId).toHaveBeenCalledWith("bad");
  });

  it("collapses and expands its body", () => {
    mockEditor([unreadable]);
    render(<DesignCheckSection />);
    const toggle = screen.getByRole("button", { name: /design check/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /fix/i })).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandGuideSection } from "./BrandGuideSection";

const editor = {
  screenshots: [],
  backgroundDefaults: { backgroundMode: "solid", backgroundColor: "#8b5cf6", gradientPresetId: null },
  savedColors: [] as string[],
  setTextDefault: vi.fn(),
  applyBrandBackground: vi.fn(),
};

vi.mock("../../context/EditorContext", () => ({
  useEditor: () => editor,
}));

beforeEach(() => vi.clearAllMocks());

describe("BrandGuideSection guided flow", () => {
  it("recommends a vibe from the two axis answers", () => {
    render(<BrandGuideSection />);
    fireEvent.click(screen.getByRole("button", { name: /^classic$/i }));
    fireEvent.click(screen.getByRole("button", { name: /calm/i }));
    // Elegant is Classic + Calm; its card is marked selected.
    const card = screen.getByRole("button", { name: /elegant/i });
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a vibe card selects it directly", () => {
    render(<BrandGuideSection />);
    fireEvent.click(screen.getByRole("button", { name: /playful/i }));
    expect(
      screen.getByRole("button", { name: /playful/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("BrandGuideSection apply", () => {
  it("applies text defaults and brand background after confirming", () => {
    editor.screenshots = [{ id: "a" }, { id: "b" }] as never;
    render(<BrandGuideSection />);
    fireEvent.click(screen.getByRole("button", { name: /^minimal$/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply brand to project/i }));
    // Inline confirm appears; click it.
    fireEvent.click(screen.getByRole("button", { name: /apply to 2 screenshots/i }));

    expect(editor.setTextDefault).toHaveBeenCalledWith("fontFamily", "Inter");
    expect(editor.setTextDefault).toHaveBeenCalledWith("textColor", expect.any(String));
    expect(editor.applyBrandBackground).toHaveBeenCalledTimes(1);
    const arg = editor.applyBrandBackground.mock.calls[0][0];
    expect(arg.backgroundMode).toBe("solid");
  });
});

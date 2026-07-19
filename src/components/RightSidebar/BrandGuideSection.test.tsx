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

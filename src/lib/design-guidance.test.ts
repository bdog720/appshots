import { describe, expect, test } from "vitest";
import type { Screenshot } from "../types";
import {
  assessScreenshotContrast,
  backgroundContrast,
  bestReadableText,
  classifyContrast,
  contrastRatio,
  evaluateProjectContrast,
  evaluateScreenshotContrast,
  isLargeText,
  readableTextOptions,
  relativeLuminance,
} from "./design-guidance";

/** Build a valid Screenshot, overriding only the fields a test cares about. */
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

describe("relativeLuminance", () => {
  test("black is 0", () => {
    expect(relativeLuminance("#000000")).toBe(0);
  });

  test("white is 1", () => {
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  test("mid gray #767676 is ~0.18", () => {
    expect(relativeLuminance("#767676")).toBeCloseTo(0.181, 2);
  });

  test("accepts hex without a leading hash", () => {
    expect(relativeLuminance("ffffff")).toBe(1);
  });

  test("accepts 3-digit shorthand and is case-insensitive", () => {
    expect(relativeLuminance("#FFF")).toBe(1);
    expect(relativeLuminance("#000")).toBe(0);
  });
});

describe("contrastRatio", () => {
  test("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  test("is symmetric (order does not matter)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  test("identical colors are 1:1", () => {
    expect(contrastRatio("#3366cc", "#3366cc")).toBeCloseTo(1, 5);
  });

  test("#767676 on white is ~4.54 (WCAG AA normal boundary)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });

  test("#595959 on white is ~7.0 (WCAG AAA normal boundary)", () => {
    expect(contrastRatio("#595959", "#ffffff")).toBeCloseTo(7.0, 1);
  });
});

describe("isLargeText", () => {
  test("24px normal is large", () => {
    expect(isLargeText(24)).toBe(true);
  });

  test("just under 24px normal is not large", () => {
    expect(isLargeText(23.9)).toBe(false);
  });

  test("a 72px headline is large", () => {
    expect(isLargeText(72)).toBe(true);
  });

  test("18.66px bold is large", () => {
    expect(isLargeText(18.66, true)).toBe(true);
  });

  test("18px bold is not large", () => {
    expect(isLargeText(18, true)).toBe(false);
  });

  test("20px non-bold is not large", () => {
    expect(isLargeText(20, false)).toBe(false);
  });
});

describe("classifyContrast", () => {
  test("large text: >=4.5 is AAA", () => {
    expect(classifyContrast(4.5, true)).toBe("AAA");
    expect(classifyContrast(21, true)).toBe("AAA");
  });

  test("large text: >=3 and <4.5 is AA", () => {
    expect(classifyContrast(3, true)).toBe("AA");
    expect(classifyContrast(4.49, true)).toBe("AA");
  });

  test("large text: <3 fails", () => {
    expect(classifyContrast(2.99, true)).toBe("fail");
  });

  test("normal text: >=7 is AAA", () => {
    expect(classifyContrast(7, false)).toBe("AAA");
  });

  test("normal text: >=4.5 and <7 is AA", () => {
    expect(classifyContrast(4.5, false)).toBe("AA");
    expect(classifyContrast(6.99, false)).toBe("AA");
  });

  test("normal text: <4.5 fails", () => {
    expect(classifyContrast(4.49, false)).toBe("fail");
  });
});

describe("bestReadableText", () => {
  test("returns a light color on a dark background", () => {
    const best = bestReadableText("#141E30");
    expect(relativeLuminance(best)).toBeGreaterThan(0.5);
  });

  test("returns a dark color on a light background", () => {
    const best = bestReadableText("#f4c4f3");
    expect(relativeLuminance(best)).toBeLessThan(0.5);
  });

  test("never returns pure black or pure white", () => {
    expect(bestReadableText("#000000").toLowerCase()).not.toBe("#000000");
    expect(bestReadableText("#ffffff").toLowerCase()).not.toBe("#ffffff");
  });

  test("picks the higher-contrast of the two options", () => {
    const bg = "#222222";
    const best = bestReadableText(bg);
    const options = readableTextOptions(bg);
    const bestRatio = contrastRatio(best, bg);
    for (const option of options) {
      expect(bestRatio).toBeGreaterThanOrEqual(contrastRatio(option, bg));
    }
  });

  test("the chosen color is highly readable on a dark background", () => {
    expect(contrastRatio(bestReadableText("#141E30"), "#141E30")).toBeGreaterThan(
      7,
    );
  });
});

describe("readableTextOptions", () => {
  test("offers two options", () => {
    expect(readableTextOptions("#123456")).toHaveLength(2);
  });

  test("first option is the best readable text", () => {
    const bg = "#123456";
    expect(readableTextOptions(bg)[0]).toBe(bestReadableText(bg));
  });

  test("options are ordered by descending contrast against the background", () => {
    const bg = "#888888";
    const [first, second] = readableTextOptions(bg);
    expect(contrastRatio(first, bg)).toBeGreaterThanOrEqual(
      contrastRatio(second, bg),
    );
  });

  test("neither option is pure black or white", () => {
    for (const option of readableTextOptions("#345678")) {
      expect(["#000000", "#ffffff"]).not.toContain(option.toLowerCase());
    }
  });
});

describe("backgroundContrast", () => {
  test("solid background uses the background color", () => {
    const screenshot = makeScreenshot({
      backgroundMode: "solid",
      backgroundColor: "#ffffff",
    });
    expect(backgroundContrast("#000000", screenshot)).toBeCloseTo(21, 5);
  });

  test("gradient background returns the worst-case (minimum) ratio across stops", () => {
    // berry: from #e1eec3 (light) to #f05053 (mid). White text has its lowest
    // contrast against the lighter stop.
    const screenshot = makeScreenshot({
      backgroundMode: "gradient",
      gradientPresetId: "berry",
    });
    const worst = Math.min(
      contrastRatio("#ffffff", "#e1eec3"),
      contrastRatio("#ffffff", "#f05053"),
    );
    expect(backgroundContrast("#ffffff", screenshot)).toBeCloseTo(worst, 5);
  });

  test("gradient mode with an unknown preset falls back to the first preset (matching preview/export)", () => {
    // resolveGradientStops falls back to gradientPresets[0] for an unresolved
    // preset id, same as the live preview and export pipelines — so the
    // contrast engine must agree rather than falling back to the solid color.
    const screenshot = makeScreenshot({
      backgroundMode: "gradient",
      gradientPresetId: "does-not-exist",
      backgroundColor: "#000000",
    });
    const worst = Math.min(
      contrastRatio("#ffffff", "#ff7e5f"),
      contrastRatio("#ffffff", "#feb47b"),
    );
    expect(backgroundContrast("#ffffff", screenshot)).toBeCloseTo(worst, 5);
  });
});

describe("evaluateScreenshotContrast", () => {
  test("flags both headline and subheadline when text is unreadable", () => {
    const screenshot = makeScreenshot({
      textColor: "#ffffff",
      backgroundColor: "#ffffff",
    });
    const issues = evaluateScreenshotContrast(screenshot);
    expect(issues.map((i) => i.element)).toEqual(["headline", "subheadline"]);
    expect(issues.every((i) => i.level === "fail")).toBe(true);
  });

  test("returns no issues when contrast is good", () => {
    const screenshot = makeScreenshot({
      textColor: "#000000",
      backgroundColor: "#ffffff",
    });
    expect(evaluateScreenshotContrast(screenshot)).toEqual([]);
  });

  test("carries the screenshot id, ratio, and a readable suggestion on each issue", () => {
    const screenshot = makeScreenshot({
      id: "abc",
      textColor: "#ffffff",
      backgroundColor: "#ffffff",
    });
    const [issue] = evaluateScreenshotContrast(screenshot);
    expect(issue.screenshotId).toBe("abc");
    expect(issue.ratio).toBeCloseTo(1, 5);
    expect(issue.suggestedTextColor).toBe(bestReadableText("#ffffff"));
  });

  test("uses per-element font size for the size-aware threshold", () => {
    // #808080 on white is ~3.95: passes as large text (>=3) but fails as normal
    // text (<4.5). Headline stays large (72px); subheadline is normal (18px).
    const screenshot = makeScreenshot({
      textColor: "#808080",
      backgroundColor: "#ffffff",
      headlineFontSize: 72,
      subheadlineFontSize: 18,
    });
    const issues = evaluateScreenshotContrast(screenshot);
    expect(issues.map((i) => i.element)).toEqual(["subheadline"]);
  });

  test("evaluates the worst-case stop of a gradient background", () => {
    const screenshot = makeScreenshot({
      textColor: "#ffffff",
      backgroundMode: "gradient",
      gradientPresetId: "berry",
    });
    const issues = evaluateScreenshotContrast(screenshot);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("skips image-mode backgrounds (no measurable base color)", () => {
    const screenshot = makeScreenshot({
      textColor: "#ffffff",
      backgroundMode: "image",
      backgroundColor: "#ffffff",
    });
    expect(evaluateScreenshotContrast(screenshot)).toEqual([]);
  });

  test("does not flag an element whose text is empty (nothing to read)", () => {
    const screenshot = makeScreenshot({
      textColor: "#ffffff",
      backgroundColor: "#ffffff",
      subheadline: "   ",
    });
    expect(evaluateScreenshotContrast(screenshot).map((i) => i.element)).toEqual([
      "headline",
    ]);
  });

  test("returns no issues when both text elements are empty", () => {
    const screenshot = makeScreenshot({
      textColor: "#ffffff",
      backgroundColor: "#ffffff",
      headline: "",
      subheadline: "",
    });
    expect(evaluateScreenshotContrast(screenshot)).toEqual([]);
  });
});

describe("assessScreenshotContrast", () => {
  test("assesses an arbitrary text color, not the screenshot's stored color", () => {
    // Stored text is readable black, but we assess a white candidate color.
    const screenshot = makeScreenshot({
      textColor: "#000000",
      backgroundColor: "#ffffff",
    });
    const assessment = assessScreenshotContrast("#ffffff", screenshot);
    expect(assessment?.passes).toBe(false);
    expect(assessment?.ratio).toBeCloseTo(1, 5);
  });

  test("reports the passing level and ratio for good contrast", () => {
    const screenshot = makeScreenshot({ backgroundColor: "#ffffff" });
    const assessment = assessScreenshotContrast("#000000", screenshot);
    expect(assessment).toMatchObject({ level: "AAA", passes: true });
    expect(assessment?.ratio).toBeCloseTo(21, 5);
  });

  test("takes the worst level across the two text elements", () => {
    // #808080 on white ~3.95: large headline passes (AA), normal subheadline fails.
    const screenshot = makeScreenshot({
      backgroundColor: "#ffffff",
      headlineFontSize: 72,
      subheadlineFontSize: 18,
    });
    const assessment = assessScreenshotContrast("#808080", screenshot);
    expect(assessment?.level).toBe("fail");
    expect(assessment?.passes).toBe(false);
  });

  test("passes when both elements clear their size-aware threshold", () => {
    // Same ratio, but both elements are large text (>=24px).
    const screenshot = makeScreenshot({
      backgroundColor: "#ffffff",
      headlineFontSize: 72,
      subheadlineFontSize: 42,
    });
    const assessment = assessScreenshotContrast("#808080", screenshot);
    expect(assessment?.level).toBe("AA");
    expect(assessment?.passes).toBe(true);
  });

  test("suggests a readable color derived from the background", () => {
    const screenshot = makeScreenshot({ backgroundColor: "#141E30" });
    const assessment = assessScreenshotContrast("#141E30", screenshot);
    expect(assessment?.suggestedTextColor).toBe(bestReadableText("#141E30"));
  });

  test("returns null for image-mode backgrounds (no measurable base color)", () => {
    const screenshot = makeScreenshot({ backgroundMode: "image" });
    expect(assessScreenshotContrast("#ffffff", screenshot)).toBeNull();
  });

  test("ignores an empty element when judging the worst level", () => {
    // The 18px subheadline would fail as normal text, but it's empty, so only
    // the large 72px headline is judged → passes.
    const screenshot = makeScreenshot({
      backgroundColor: "#ffffff",
      headlineFontSize: 72,
      subheadlineFontSize: 18,
      subheadline: "",
    });
    expect(assessScreenshotContrast("#808080", screenshot)?.passes).toBe(true);
  });

  test("falls back to all elements for guidance when no text has been added", () => {
    // With no text at all the chip is pure color guidance: judge every
    // configured size, so the strict 18px size still drives a fail.
    const screenshot = makeScreenshot({
      backgroundColor: "#ffffff",
      headlineFontSize: 72,
      subheadlineFontSize: 18,
      headline: "",
      subheadline: "",
    });
    expect(assessScreenshotContrast("#808080", screenshot)?.level).toBe("fail");
  });
});

describe("evaluateProjectContrast", () => {
  test("collects issues across every screenshot", () => {
    const bad = makeScreenshot({
      id: "bad",
      textColor: "#ffffff",
      backgroundColor: "#ffffff",
    });
    const good = makeScreenshot({
      id: "good",
      textColor: "#000000",
      backgroundColor: "#ffffff",
    });
    const issues = evaluateProjectContrast([bad, good]);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.screenshotId === "bad")).toBe(true);
  });

  test("returns no issues for a clean project", () => {
    const clean = makeScreenshot({
      textColor: "#000000",
      backgroundColor: "#ffffff",
    });
    expect(evaluateProjectContrast([clean, clean])).toEqual([]);
  });
});

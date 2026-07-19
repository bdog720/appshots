import { describe, it, expect } from "vitest";
import {
  VIBES,
  vibeForAxes,
  generateBrandLook,
  type Character,
  type Energy,
} from "./brand-guide";
import { resolveGradientStops } from "./background-settings";
import { contrastRatio, isLargeText, classifyContrast } from "./design-guidance";

describe("vibe grid", () => {
  it("has all six Character x Energy cells filled with unique ids", () => {
    const chars: Character[] = ["modern", "friendly", "classic"];
    const energies: Energy[] = ["calm", "bold"];
    const ids = new Set<string>();
    for (const c of chars)
      for (const e of energies) {
        const v = vibeForAxes(c, e);
        expect(v.character).toBe(c);
        expect(v.energy).toBe(e);
        ids.add(v.id);
      }
    expect(ids.size).toBe(6);
    expect(VIBES).toHaveLength(6);
  });

  it("maps known cells to expected vibes", () => {
    expect(vibeForAxes("modern", "calm").id).toBe("minimal");
    expect(vibeForAxes("modern", "bold").id).toBe("bold");
    expect(vibeForAxes("classic", "calm").id).toBe("elegant");
  });
});

describe("generateBrandLook", () => {
  it("Minimal yields Inter, solid light tint, sizes 60/36", () => {
    const look = generateBrandLook("#8b5cf6", "minimal");
    expect(look.fontFamily).toBe("Inter");
    expect(look.headlineFontSize).toBe(60);
    expect(look.subheadlineFontSize).toBe(36);
    expect(look.background.backgroundMode).toBe("solid");
  });

  it("Bold yields a gradient with custom stops", () => {
    const look = generateBrandLook("#8b5cf6", "bold");
    expect(look.background.backgroundMode).toBe("gradient");
    const stops = resolveGradientStops(look.background);
    expect(stops).not.toBeNull();
    expect(stops!.from).toBe("#8b5cf6");
  });

  it("every vibe produces AA-passing headline text across a hue spread", () => {
    for (const vibe of VIBES) {
      for (let h = 0; h < 360; h += 30) {
        // deterministic mid-saturation brand color per hue
        const brand = hueHex(h);
        const look = generateBrandLook(brand, vibe.id);
        const stops = resolveGradientStops(look.background) ?? {
          from: look.background.backgroundColor,
          to: look.background.backgroundColor,
        };
        const worst = Math.min(
          contrastRatio(look.textColor, stops.from),
          contrastRatio(look.textColor, stops.to),
        );
        const level = classifyContrast(worst, isLargeText(look.headlineFontSize));
        expect(level, `${vibe.id} @ hue ${h}`).not.toBe("fail");
      }
    }
  });
});

// Minimal HSL->hex for test brand colors (s=70%, l=55%).
function hueHex(h: number): string {
  const s = 0.7, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

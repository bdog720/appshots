# Brand guide (Phase 2) — design spec

**Status:** approved for build. Brainstormed 2026-07-19. Follows Phase 1 (live contrast guidance), which is complete and committed.
**Register:** product (a tool). Editor chrome + pure logic + a background-defaults foundation. It never touches the device-frame geometry, but it *does* touch background resolution in both the preview and export pipelines (they must stay pixel-identical).
**Depends on:** the Phase 1 engine `src/lib/design-guidance.ts` (`bestReadableText`, `backgroundContrast`, `assessScreenshotContrast`, `contrastRatio`).

## Problem

AppShots users are indie developers, not designers. Phase 1 warns about unreadable text and offers one-click fixes. Phase 2 goes proactive: let a user define their **brand once** (a color + a "vibe", or manual control) and generate a coordinated, self-validated look — background, readable text color, font, and size scale — applied across the whole project's defaults. It reuses the Phase 1 "design brain" so every generated look is guaranteed readable.

## Goals

- A **Brand guide** panel that turns a brand color + a chosen vibe into a coordinated look and applies it to the project in one click (reversible).
- A **guided narrowing flow** (two axis questions) that recommends a vibe, plus a grid of vibe cards the user can pick directly.
- An **advanced mode** for design-savvy users to skip the vibe flow and set the brand parts directly, still validated live by the Phase 1 contrast engine.
- A **global background-defaults + override system** mirroring the existing text-defaults model, so "apply a background across screenshots" has a first-class mechanism (and brand-derived custom gradients can exist).

## Non-goals (deferred)

- Harmony / "colors clash" detection (Phase 1.5 — same engine, later).
- Heading+body font pairing (one font per vibe; the model stays single-`fontFamily`).
- Per-span rich-text color validation, overlay-image contrast (unchanged from Phase 1).
- Multiple brands per project / brand presets library.

---

## Decisions (from brainstorming)

- **Apply model:** one-click "Apply to project" with a live preview. Reversible (single undo). Not live-auto-apply, not suggestions-only.
- **Vibes:** a **3×2 grid** (Character × Energy) = 6 vibes; the questionnaire's two axes *are* the grid axes, so answers map to exactly one vibe. Declarative (adding a vibe is data).
- **Font per vibe:** one font each (no model change). All six fonts already exist in `google-fonts.ts`.
- **Backgrounds:** introduce a **global background default + per-screenshot override**, mirroring text. Apply sets the default; its confirm clears the N screenshots' background overrides so the coordinated background lands everywhere. Text still respects existing per-screenshot text overrides.
- **Advanced mode:** a toggle that swaps the guided questionnaire for direct controls writing the *same* `BackgroundSettings` + text defaults, still validated by the Phase 1 chip.

---

## Part A — Foundation: global background defaults + override

Today text has `Project.textDefaults` + per-screenshot `textOverrides[]`, and `setTextDefault` propagates to non-overriding screenshots (`applyTextDefaultToScreenshots`, `src/lib/text-settings.ts`). Backgrounds have **no** such concept: each `Screenshot` stores its own `backgroundMode` / `backgroundColor` / `gradientPresetId`, and gradients resolve **only** by preset id in two places — `getBackgroundStyle` (`EditorContext.tsx:1224`) and `export-utils.ts:935`.

### New type

```ts
// src/lib/background-settings.ts  (new, mirrors text-settings.ts)
export interface BackgroundSettings {
  backgroundMode: "solid" | "gradient" | "image";
  backgroundColor: string;          // used when solid
  gradientPresetId: string | null;  // named preset when gradient & no custom stops
  gradientFrom?: string;            // custom gradient start (brand-derived)
  gradientTo?: string;              // custom gradient end
}
```

`gradientFrom` / `gradientTo` are the mechanism that lets a **brand-derived** gradient (e.g. brand→darker) exist without inventing a named preset entry.

### Resolution rule (applied identically in BOTH pipelines)

For `backgroundMode === "gradient"`:
1. If `gradientFrom` **and** `gradientTo` are present → use them.
2. Else → look up `gradientPresets` by `gradientPresetId` (existing behaviour; named presets keep working untouched).

This rule is implemented once (a shared helper `resolveGradientStops(bg): {from, to} | null` in `background-settings.ts`) and called from `getBackgroundStyle` and `export-utils.ts`. **The preview and export must produce the identical gradient** — same discipline the CLAUDE.md mandates for device visuals.

### State model changes

- `Project.backgroundDefaults: BackgroundSettings` — source of truth for inheriting screenshots.
- `Screenshot.backgroundOverride: boolean` — when `true`, the screenshot keeps its own background and ignores the default (parallel to `textOverrides`). `Screenshot` keeps its existing `backgroundMode` / `backgroundColor` / `gradientPresetId` fields, plus the new optional `gradientFrom` / `gradientTo`.
- EditorContext gains:
  - `setBackgroundDefault(patch: Partial<BackgroundSettings>)` — updates `backgroundDefaults` and propagates to all screenshots where `backgroundOverride === false` (copies resolved values onto them, mirroring `applyTextDefaultToScreenshots`).
  - Editing a single screenshot's background (via `BackgroundPicker` in "This screenshot" scope) sets `backgroundOverride = true`.
  - `resetScreenshotBackground(id)` — clears the override and re-inherits the default.

### Migration (CRITICAL — real users have saved projects)

`src/lib/device-instances.ts` (and any shape normalization for persisted projects) must:
- Default `Project.backgroundDefaults` from the app's baseline background if absent.
- For every **existing** screenshot lacking `backgroundOverride`, set `backgroundOverride = true`.

This guarantees **zero visual change** on load: existing screenshots keep their exact stored backgrounds; only new or explicitly-inheriting screenshots follow the default. `gradientFrom`/`gradientTo` default to `undefined` (falls back to preset lookup), so old gradient screenshots are unaffected. Keep `bulk-import.ts` producing override-flagged screenshots consistent with this.

### UI

`BackgroundPicker` gains a **scope toggle** (Global default / This screenshot) + a reset button when overridden — exactly like `TextSection` already does for text. Global scope calls `setBackgroundDefault`; screenshot scope sets the override.

### Tests (Part A)

- `resolveGradientStops`: custom stops win; falls back to preset; null for solid/image.
- `setBackgroundDefault` propagation: updates non-overriding screenshots, skips overridden ones.
- Migration: an existing project (screenshots with no `backgroundOverride`) → all become overridden, no visual change; `backgroundDefaults` seeded.
- Both `getBackgroundStyle` and the export gradient path return identical stops for the same `BackgroundSettings` (guard against pipeline divergence).

---

## Part B — Brand-guide engine (`src/lib/brand-guide.ts`, pure, TDD)

Structured like `design-guidance.ts` — pure functions, unit-tested against fixed values, no React.

### Color helpers (`src/lib/color-utils.ts`, new — extract shared color math)

`design-guidance.ts` already tints toward hue; extract/centralize:
```ts
hexToHsl(hex): {h, s, l}
hslToHex({h, s, l}): string
adjustLightness(hex, deltaL): string     // deltaL in [-100,100] on L%
rotateHue(hex, deg): string
mix(a, b, t): string                      // linear RGB mix, t in [0,1]
```
Tested against known conversions (e.g. `#8b5cf6` round-trips; `mix(#000,#fff,0.5)` ≈ grey).

### Vibe catalog (declarative — 3×2 grid)

```ts
type Character = "modern" | "friendly" | "classic";
type Energy = "calm" | "bold";

interface VibeRecipe {
  id: string;                 // "minimal" | "bold" | "warm" | "playful" | "elegant" | "editorial"
  label: string;
  character: Character;
  energy: Energy;
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  background(brand: string): BackgroundSettings;  // derives from brand color
}
```

| Character ＼ Energy | **Calm** | **Bold** |
|---|---|---|
| **Modern** | **Minimal** — Inter, 60/36, solid `mix(brand, near-white, 0.86)` (soft tint) | **Bold** — Poppins, 72/42, gradient `brand → adjustLightness(brand, −22)` |
| **Friendly** | **Warm** — Nunito, 64/40, solid warm tint `mix(brand, warm-cream, 0.8)` | **Playful** — Quicksand, 76/44, gradient `brand → rotateHue(brand, +32)` |
| **Classic** | **Elegant** — Playfair Display, 66/38, solid `adjustLightness(brand, −35)` (deep tone) | **Editorial** — Lora, 70/40, deep gradient `adjustLightness(brand, −45) → adjustLightness(brand, −32)` |

All six fonts confirmed present in `google-fonts.ts` (Inter, Poppins, Nunito, Quicksand, Playfair Display, Lora).

### Public API

```ts
interface BrandLook {
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  textColor: string;
  background: BackgroundSettings;
}

vibeForAxes(character: Character, energy: Energy): VibeRecipe   // grid lookup (never null — all 6 cells filled)
generateBrandLook(brandColor: string, vibeId: string): BrandLook
```

### Self-validation (reuse Phase 1)

`textColor` is chosen with `bestReadableText` against the generated background and validated with `backgroundContrast` (worst-case across gradient stops, using a `Screenshot`-shaped probe or a small internal helper). If the primary pick fails AA for the vibe's headline size, fall back to the opposite pole. **Invariant:** for every vibe × a spread of brand hues, the generated `textColor` passes WCAG AA at the vibe's headline size. This is a test.

### Tests (Part B)

- `color-utils` conversions & operations against fixed values.
- `vibeForAxes` returns the right vibe for all 6 grid cells.
- `generateBrandLook` recipe outputs (font, sizes, background mode + derived stops) for known brand colors.
- The readability invariant across vibes × brand hues.

---

## Part C — UI surface (`src/components/RightSidebar/BrandGuideSection.tsx`)

A collapsible section placed at the **top of `RightSidebar`** (above `DesignCheckSection`), same collapsible pattern as `DesignCheckSection`.

### Layout

1. **Mode toggle:** *Guided* ↔ *Advanced ("I'll set it myself")*.
2. **Brand color picker** (shared by both modes) — seeded from the project's current default background / `savedColors`.
3. **Guided mode:**
   - Two questions — **Character** (Modern / Friendly / Classic) and **Energy** (Calm & minimal / Bold & vivid).
   - Answers highlight the recommended vibe via `vibeForAxes`. A grid of the **6 vibe cards** is shown; the user can accept the recommendation or click any card. Selecting a card back-fills the two axis answers.
4. **Advanced mode:** collapses the questionnaire; exposes direct controls for font, background (solid/gradient with custom stops), and the size scale — all writing the same `BackgroundSettings` + text-default shape a `BrandLook` produces.
5. **Live preview:** a mini card rendering the generated background + font + "Aa" headline/subheadline at scale, with a contrast chip reusing `assessScreenshotContrast` / `ContrastIndicator` — the user sees readability before applying.
6. **Apply:** "Apply brand to project" →
   - sets `textDefaults` (fontFamily, headline/subheadline sizes, textColor) via `setTextDefault`, respecting existing per-screenshot **text** overrides;
   - sets `backgroundDefaults` via `setBackgroundDefault`;
   - a **confirm** ("Apply the brand background to all N screenshots?") clears the N screenshots' `backgroundOverride` flags so the coordinated background lands everywhere.
   - Reversible with a single undo.

### Tests (Part C)

- Unit: guided answers → recommended vibe card highlighted; card click back-fills axes; preview reflects `generateBrandLook`; Apply calls `setTextDefault` + `setBackgroundDefault` with the generated values.
- In-browser (manual): set brand + vibe → preview readable → Apply → inheriting screenshots update, text overrides preserved, background overrides cleared, contrast clean; advanced mode sets custom gradient stops that match between preview and export.

---

## Task breakdown (one per session; cheap models where mechanical)

1. **Part A.1** — `background-settings.ts` (type + `resolveGradientStops` + `applyBackgroundDefaultToScreenshots`) + tests. Pure, no UI.
2. **Part A.2** — Wire background defaults into `EditorContext` (`backgroundDefaults`, `setBackgroundDefault`, `resetScreenshotBackground`, override flag) + migration in `device-instances.ts` / `bulk-import.ts` + update **both** resolvers (`getBackgroundStyle`, `export-utils.ts`). Tests for propagation, migration, pipeline parity.
3. **Part A.3** — `BackgroundPicker` scope toggle + reset (mirror `TextSection`).
4. **Part B** — `color-utils.ts` + `brand-guide.ts` engine (vibe catalog, `vibeForAxes`, `generateBrandLook`, self-validation) + tests.
5. **Part C.1** — `BrandGuideSection`: guided questionnaire + 6 vibe cards + live preview.
6. **Part C.2** — Advanced mode controls + Apply/confirm wiring.
7. **Polish + verify** — full in-browser pass on a multi-screenshot project (guided apply, advanced apply, overrides, undo, export parity). Run `bun run build`.

Each task builds on the prior and can be a fresh session against this spec.

---

## Constraints & gotchas (carried from CLAUDE.md)

- ❌ Don't let the background gradient diverge between `getBackgroundStyle` and `export-utils.ts` — resolve via the one shared `resolveGradientStops` helper in both.
- ❌ Don't break `device-instances.ts` normalization or bump persisted shapes without a migration — the `backgroundOverride` default of `true` for existing screenshots is what protects saved projects.
- ✅ Run `bun run build` (vite + tsc) before claiming done.
- ✅ Keep the generated look flowing through the Phase 1 engine for validation — the brand brain never emits an unreadable result.

## Decisions log

- Apply: **one-click with live preview**, reversible (not auto-apply, not suggestions-only).
- Vibes: **6 in a 3×2 Character×Energy grid**; questionnaire axes = grid axes; declarative.
- Fonts: **one per vibe**, all already in `google-fonts.ts` (no model change).
- Backgrounds: **global default + per-screenshot override**, mirroring text; brand gradients via custom `gradientFrom`/`gradientTo` stops.
- Advanced mode: **skip the vibe flow**, set brand parts directly, still contrast-validated.
- Migration preserves existing backgrounds by flagging all existing screenshots as overridden.

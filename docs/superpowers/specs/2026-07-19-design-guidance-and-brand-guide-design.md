# Design guidance + brand guide — design spec

**Status:** approved for Phase 1 build. Brainstormed 2026-07-19.
**Register:** product (a tool). All work is editor chrome + pure logic; it never touches the device-frame / export pixel pipelines.

## Problem

AppShots users are indie developers, not designers. Given raw color/font/size controls, it's easy to make store screenshots that are hard to read (poor contrast) or that clash. The tool should actively help them reach a good, accessible result and teach good habits along the way.

## Vision (whole feature)

One underlying **"design brain"** (pure functions that encode good color/type rules) feeding progressively more proactive surfaces:

1. **Live guidance** in the existing editor: warn about problems and offer one-click fixes. *(Phase 1 — this spec.)*
2. **Guided brand guide**: define a brand once (colors, fonts, sizes); the tool generates a coordinated, self-validated look and applies it across screenshots. *(Phase 2 — sketched below, separate spec later.)*

The user chose the most hands-on end of the spectrum ("guide me from the start"), and chose to **build the foundation + live guidance first** because it delivers value in the current editor immediately and is the base the brand guide reuses.

---

## Phase 1 — Foundation + live contrast guidance (this spec)

### Scope

- **Hard check: contrast (readability).** Objective and measurable via WCAG. This is the lead feature.
- **Fixes/suggestions:** one-click "use readable text color" derived from the background.
- **Two surfaces (user chose both):**
  1. **Contextual** — a readability chip + Fix button next to the Text Color / Background controls, and a small warning dot on any canvas tile with an issue.
  2. **Design check panel** — a collapsible list of every issue across all screenshots, each with a Fix and jump-to.

### Non-goals for Phase 1 (deliberately deferred)

- The brand guide section and palette/font/size generation (Phase 2).
- Harmony / "colors clash" detection and complementary-color suggestions (Phase 1.5 — the engine is designed to grow into this, but contrast ships first).
- Contrast of per-span rich-text colors and of overlay images (checks the screenshot's base text color only).

### The rules we encode ("what's good")

- **Contrast standard: WCAG AA**, size-aware. Large text needs ratio ≥ 3:1; normal text ≥ 4.5:1. WCAG "large" = ≥ 24px (or ≥ 18.66px bold). Most screenshot headlines/subheadlines are large, so 3:1 usually applies; the check reads each element's actual configured font size. AAA (7:1 / 4.5:1) is reported as a bonus but not required.
- **Readable text auto-pick:** choose near-white or near-black (tinted toward the brand hue, never pure `#000`/`#fff`, matching DESIGN.md) whichever has the higher contrast against the background.
- **Gradient backgrounds:** evaluate worst-case contrast across both gradient stops.

### Engine — `src/lib/design-guidance.ts` (pure, TDD)

```ts
relativeLuminance(hex: string): number
contrastRatio(a: string, b: string): number            // 1..21

type WcagLevel = "AAA" | "AA" | "fail"
isLargeText(fontSizePx: number, bold?: boolean): boolean
classifyContrast(ratio: number, largeText: boolean): WcagLevel

bestReadableText(background: string): string            // tinted near-black|near-white, best contrast
readableTextOptions(background: string): string[]

// background may be a solid color or a gradient (from/to); returns worst-case ratio
backgroundContrast(textColor: string, screenshot: Screenshot): number

interface ContrastIssue {
  screenshotId: string
  element: "headline" | "subheadline"
  ratio: number
  level: WcagLevel                                       // only "fail" surfaces as a warning
  suggestedTextColor: string
}
evaluateScreenshotContrast(screenshot: Screenshot): ContrastIssue[]
evaluateProjectContrast(screenshots: Screenshot[]): ContrastIssue[]
```

Text color resolution for Phase 1: use `screenshot.textColor` (the base) for both headline and subheadline; background from `backgroundMode` (`backgroundColor` or the gradient preset's `from`/`to`). Font sizes from `headlineFontSize` / `subheadlineFontSize`.

Colors are tested against known values (black/white = 21:1, equal colors = 1:1, plus a few fixed pairs) so the math is verifiably correct.

### Surfaces

- **`ContrastIndicator`** (in `RightSidebar/TextSection`, near Text Color): shows the worst-case level for the active screenshot ("Good" / "Low contrast" + the ratio). When failing, a **Fix** button applies `bestReadableText(...)` via the section's current scope (global default vs this screenshot). A matching indicator can sit in the Background section.
- **Tile warning dot** (in `CanvasPreview/ScreenshotCard`): a small amber dot (chrome overlay, like the remove button — not exported) when `evaluateScreenshotContrast(screenshot)` is non-empty.
- **`DesignCheckSection`** (right sidebar, collapsible): lists `evaluateProjectContrast(screenshots)` grouped by screenshot, each row with the issue, a **Fix**, and a click-to-activate that screenshot. Positive empty state when clean ("Text is readable on every screenshot").

### Testing

- Engine: comprehensive unit tests (TDD) — ratios, thresholds, size classification, readable-color pick, gradient worst-case, issue evaluation.
- UI: verified in-browser (set unreadable text, confirm chip + dot + panel appear, Fix resolves them).

### Suggested task breakdown (one per session)

1. **Engine** (`design-guidance.ts` + tests) — pure, no UI. Self-contained.
2. **Contextual indicator + Fix** in the Text/Background controls.
3. **Tile warning dots** on screenshot cards.
4. **Design check panel** (project-wide list + fixes + jump-to).
5. **Polish + verify** across a multi-screenshot project.

Each task builds on the engine and can be a fresh session against this spec.

---

## Phase 2 — Guided brand guide (sketch only; separate spec later)

A per-project **Brand guide** (projects already model "one app each") where the user sets a primary brand color and a "vibe", and the tool generates a coordinated set: background/gradient, readable text color (via the Phase 1 engine), a font (or curated heading/body pairing), and a size scale, applied to the project's global text defaults + backgrounds. The brand-guide screen self-validates using the same engine (contrast) plus harmony checks added in Phase 1.5. Relates to existing `textDefaults`, `savedColors`, and `gradientPresets` in EditorContext.

Open questions for the Phase 2 spec: how many/which vibes and what each generates; single font vs heading+body pairing; how aggressively it auto-applies vs suggests; how the brand guide coexists with per-screenshot overrides.

---

## Decisions log

- Proactiveness: **guide from the start** (warnings + suggestions + guided setup all in scope; stacked).
- Build order: **foundation + live guidance first**, brand guide second.
- Contrast standard: **WCAG AA, size-aware** (3:1 large / 4.5:1 normal); AAA reported as bonus.
- Guidance surfaces: **both** contextual (chips + tile dots) **and** a design-check panel.
- Lead with contrast (objective); harmony is a later layer on the same engine.
- Workflow: document as this spec, execute each task in a fresh session.

# Brand Guide (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user define a brand once (color + a guided "vibe", or manual controls) and generate a coordinated, contrast-validated look — background, readable text color, font, size scale — applied across the project in one click.

**Architecture:** A pure "design brain" (`brand-guide.ts` + `color-utils.ts`) generates a `BrandLook` from a brand color and a vibe, self-validated by the Phase 1 contrast engine. It lands via a new **global background-defaults + per-screenshot-override** foundation that mirrors the existing text-defaults model, so backgrounds inherit/override exactly like text. Brand-derived gradients are stored as custom stops (`gradientFrom`/`gradientTo`) resolved through one shared helper used by every consumer (preview, export, and contrast).

**Tech Stack:** React 19 + TypeScript + Vite (run with Bun); Vitest + jsdom + Testing Library; Tailwind classes via `STYLES`; lucide-react icons.

## Global Constraints

- Test a single file: `bunx vitest run <path>`; by name: `bunx vitest run -t "<name>"`. Full gate: `bun run build` (vite build THEN tsc — must be green before "done").
- **Two rendering pipelines must stay pixel-identical:** live preview (`getBackgroundStyle` in `EditorContext.tsx`) and export (`export-utils.ts`). Every background change goes through the ONE shared `resolveGradientStops` helper in both, plus the contrast consumer `design-guidance.ts`.
- **Never break persisted-shape backward compatibility.** New fields `Screenshot.backgroundOverride` and `Project.backgroundDefaults` are **optional**; migration in `normalizeScreenshot`/`normalizeProject` fills them (`?? true` / `?? DEFAULT_BACKGROUND_SETTINGS`) so existing saved projects keep their exact backgrounds (all existing screenshots become overridden).
- Camera/button/device geometry is untouched. All six vibe fonts already exist in `src/lib/google-fonts.ts` (Inter, Poppins, Nunito, Quicksand, Playfair Display, Lora) — do NOT add fonts.
- Commit messages end with the repo trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EsMSYrQSWYtUXLEThQMufe
  ```
- Branch: `design/impeccable-overnight-audit` (keep all work here).

---

## Task 1: Background-settings pure module

**Files:**
- Create: `src/lib/background-settings.ts`
- Test: `src/lib/background-settings.test.ts`

**Interfaces:**
- Consumes: `gradientPresets` from `src/constants.ts`.
- Produces:
  - `interface BackgroundSettings { backgroundMode: "solid"|"gradient"|"image"; backgroundColor: string; gradientPresetId: string|null; gradientFrom?: string; gradientTo?: string }`
  - `DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings`
  - `resolveGradientStops(bg): { from: string; to: string } | null`
  - `pickBackgroundSettings(source: BackgroundSettings): BackgroundSettings`
  - `type BackgroundOverrideCarrier = BackgroundSettings & { backgroundOverride?: boolean }`
  - `applyBackgroundDefaultToScreenshots(screenshots, settings)`
  - `overrideScreenshotBackground(item, patch)`
  - `resetScreenshotBackground(item, defaults)`

- [ ] **Step 1: Write the failing test**

Create `src/lib/background-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  resolveGradientStops,
  applyBackgroundDefaultToScreenshots,
  overrideScreenshotBackground,
  resetScreenshotBackground,
  type BackgroundSettings,
} from "./background-settings";

const solid = (color: string): BackgroundSettings => ({
  backgroundMode: "solid",
  backgroundColor: color,
  gradientPresetId: null,
});

describe("resolveGradientStops", () => {
  it("returns null for solid and image backgrounds", () => {
    expect(resolveGradientStops(solid("#123456"))).toBeNull();
    expect(
      resolveGradientStops({ ...solid("#000"), backgroundMode: "image" }),
    ).toBeNull();
  });

  it("uses custom stops when both are present", () => {
    expect(
      resolveGradientStops({
        backgroundMode: "gradient",
        backgroundColor: "#000",
        gradientPresetId: null,
        gradientFrom: "#111111",
        gradientTo: "#222222",
      }),
    ).toEqual({ from: "#111111", to: "#222222" });
  });

  it("falls back to a named preset when custom stops are absent", () => {
    const stops = resolveGradientStops({
      backgroundMode: "gradient",
      backgroundColor: "#000",
      gradientPresetId: "berry",
    });
    expect(stops).toEqual({ from: "#e1eec3", to: "#f05053" });
  });
});

describe("applyBackgroundDefaultToScreenshots", () => {
  const brand: BackgroundSettings = {
    backgroundMode: "gradient",
    backgroundColor: "#8b5cf6",
    gradientPresetId: null,
    gradientFrom: "#8b5cf6",
    gradientTo: "#5a3ba0",
  };

  it("updates inheriting screenshots and skips overridden ones", () => {
    const screens = [
      { id: "a", ...solid("#fff"), backgroundOverride: false },
      { id: "b", ...solid("#000"), backgroundOverride: true },
    ];
    const result = applyBackgroundDefaultToScreenshots(screens, brand);
    expect(result[0].gradientTo).toBe("#5a3ba0");
    expect(result[0].backgroundMode).toBe("gradient");
    expect(result[1].backgroundColor).toBe("#000"); // overridden, untouched
  });

  it("treats a missing override flag as inheriting", () => {
    const screens = [{ id: "a", ...solid("#fff") }];
    const result = applyBackgroundDefaultToScreenshots(screens, brand);
    expect(result[0].backgroundMode).toBe("gradient");
  });
});

describe("override / reset helpers", () => {
  it("override sets the flag and patches fields", () => {
    const s = { id: "a", ...solid("#fff"), backgroundOverride: false };
    const next = overrideScreenshotBackground(s, { backgroundColor: "#abcabc" });
    expect(next.backgroundColor).toBe("#abcabc");
    expect(next.backgroundOverride).toBe(true);
  });

  it("reset restores defaults and clears the flag", () => {
    const s = { id: "a", ...solid("#abcabc"), backgroundOverride: true };
    const next = resetScreenshotBackground(s, DEFAULT_BACKGROUND_SETTINGS);
    expect(next.backgroundColor).toBe(DEFAULT_BACKGROUND_SETTINGS.backgroundColor);
    expect(next.backgroundOverride).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/background-settings.test.ts`
Expected: FAIL — cannot find module `./background-settings`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/background-settings.ts`:

```ts
/**
 * Background settings — global defaults with a per-screenshot override, mirroring
 * text-settings.ts. A background can be a solid color, a named-preset gradient, or
 * a custom gradient (brand-derived) carried as explicit from/to stops. The
 * concrete values live on each screenshot so the preview and export pipelines read
 * them directly; `backgroundOverride` marks a screenshot that has pinned its own
 * background rather than inheriting the project default.
 */

import { gradientPresets } from "../constants";

export interface BackgroundSettings {
  backgroundMode: "solid" | "gradient" | "image";
  backgroundColor: string;
  gradientPresetId: string | null;
  /** Custom gradient start (used before falling back to a named preset). */
  gradientFrom?: string;
  /** Custom gradient end. */
  gradientTo?: string;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  backgroundMode: "solid",
  backgroundColor: "#8b5cf6",
  gradientPresetId: null,
};

type GradientResolvable = Pick<
  BackgroundSettings,
  "backgroundMode" | "gradientPresetId" | "gradientFrom" | "gradientTo"
>;

/**
 * The two color stops a background presents behind text, or null for
 * solid/image. Custom stops win; otherwise fall back to the named preset (and,
 * as a last resort, the first preset — matching the render pipelines' behavior).
 */
export const resolveGradientStops = (
  bg: GradientResolvable,
): { from: string; to: string } | null => {
  if (bg.backgroundMode !== "gradient") return null;
  if (bg.gradientFrom && bg.gradientTo) {
    return { from: bg.gradientFrom, to: bg.gradientTo };
  }
  const preset =
    gradientPresets.find((p) => p.id === bg.gradientPresetId) ??
    gradientPresets[0];
  return { from: preset.from, to: preset.to };
};

/** Extracts only the background fields from a larger object. */
export const pickBackgroundSettings = (
  source: BackgroundSettings,
): BackgroundSettings => ({
  backgroundMode: source.backgroundMode,
  backgroundColor: source.backgroundColor,
  gradientPresetId: source.gradientPresetId,
  gradientFrom: source.gradientFrom,
  gradientTo: source.gradientTo,
});

/** Anything carrying background fields plus the optional override flag. */
export type BackgroundOverrideCarrier = BackgroundSettings & {
  backgroundOverride?: boolean;
};

/** Propagate a changed default to every non-overriding screenshot. */
export const applyBackgroundDefaultToScreenshots = <
  T extends BackgroundOverrideCarrier,
>(
  screenshots: T[],
  settings: BackgroundSettings,
): T[] =>
  screenshots.map((s) =>
    s.backgroundOverride ? s : { ...s, ...pickBackgroundSettings(settings) },
  );

/** Patch a screenshot's background and record it as an override. */
export const overrideScreenshotBackground = <
  T extends BackgroundOverrideCarrier,
>(
  item: T,
  patch: Partial<BackgroundSettings>,
): T => ({ ...item, ...patch, backgroundOverride: true });

/** Restore a screenshot to the default background and clear the override. */
export const resetScreenshotBackground = <T extends BackgroundOverrideCarrier>(
  item: T,
  defaults: BackgroundSettings,
): T => ({
  ...item,
  ...pickBackgroundSettings(defaults),
  backgroundOverride: false,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/background-settings.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/background-settings.ts src/lib/background-settings.test.ts
git commit -m "Add background-settings module (global default + override)"
```

---

## Task 2: Add background fields to types; route all three consumers through resolveGradientStops

**Files:**
- Modify: `src/types/index.ts` (add fields to `Screenshot` and `Project`)
- Modify: `src/context/EditorContext.tsx:1224-1232` (`getBackgroundStyle`)
- Modify: `src/lib/export-utils.ts:932-944` (gradient fill)
- Modify: `src/lib/design-guidance.ts:161-170` (`backgroundStops`)
- Test: `src/lib/background-parity.test.ts` (new)

**Interfaces:**
- Consumes: `resolveGradientStops`, `BackgroundSettings` from Task 1.
- Produces: `Screenshot.gradientFrom?`, `Screenshot.gradientTo?`, `Screenshot.backgroundOverride?`, `Project.backgroundDefaults?: BackgroundSettings`.

- [ ] **Step 1: Add the optional fields to the types**

In `src/types/index.ts`, add an import near the other lib type imports:

```ts
import type { BackgroundSettings } from "../lib/background-settings";
```

In the `Screenshot` type, after `gradientPresetId: string | null;` add:

```ts
  /** Custom gradient start (brand-derived; overrides the named preset). */
  gradientFrom?: string;
  /** Custom gradient end. */
  gradientTo?: string;
```

At the end of the `Screenshot` type (after `activeDeviceId: string;`) add:

```ts
  /** True when this screenshot pins its own background instead of inheriting. */
  backgroundOverride?: boolean;
```

In the `Project` type, after `textDefaults: TextSettings;` (line ~141) add:

```ts
  /** Project-level background default that inheriting screenshots follow. */
  backgroundDefaults?: BackgroundSettings;
```

- [ ] **Step 2: Write the failing parity test**

Create `src/lib/background-parity.test.ts` — proves the preview string and the export stops derive from the same resolver, so the two pipelines cannot diverge:

```ts
import { describe, it, expect } from "vitest";
import { resolveGradientStops } from "./background-settings";
import type { Screenshot } from "../types";

const base = {
  backgroundColor: "#8b5cf6",
  gradientPresetId: null,
} as Pick<Screenshot, "backgroundColor" | "gradientPresetId">;

describe("background pipeline parity", () => {
  it("custom brand gradient resolves to identical stops for preview and export", () => {
    const bg = {
      ...base,
      backgroundMode: "gradient" as const,
      gradientFrom: "#8b5cf6",
      gradientTo: "#5a3ba0",
    };
    const stops = resolveGradientStops(bg);
    expect(stops).toEqual({ from: "#8b5cf6", to: "#5a3ba0" });
    // The preview builds `linear-gradient(180deg, from, to)` and the export
    // builds a vertical canvas gradient from the SAME stops.
    const previewCss = `linear-gradient(180deg, ${stops!.from}, ${stops!.to})`;
    expect(previewCss).toBe("linear-gradient(180deg, #8b5cf6, #5a3ba0)");
  });
});
```

- [ ] **Step 3: Run test to verify it passes once types compile**

Run: `bunx vitest run src/lib/background-parity.test.ts`
Expected: PASS (this test only exercises the resolver). Then wire the consumers below so real rendering uses it.

- [ ] **Step 4: Route `getBackgroundStyle` through the resolver**

In `src/context/EditorContext.tsx`, add to the imports from background-settings (create the import if absent):

```ts
import { resolveGradientStops } from "../lib/background-settings";
```

Replace `getBackgroundStyle` (lines 1224-1232) with:

```ts
  const getBackgroundStyle = (screenshot: Screenshot) => {
    const stops = resolveGradientStops(screenshot);
    if (stops) {
      return `linear-gradient(180deg, ${stops.from}, ${stops.to})`;
    }
    return screenshot.backgroundColor;
  };
```

- [ ] **Step 5: Route the export fill through the resolver**

In `src/lib/export-utils.ts`, add near the top imports:

```ts
import { resolveGradientStops } from "./background-settings";
```

Replace the gradient block (lines 932-944) with:

```ts
    // Draw background
    const stops = resolveGradientStops(screenshot);
    if (stops) {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, stops.from);
      gradient.addColorStop(1, stops.to);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = screenshot.backgroundColor;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 6: Route the contrast engine through the resolver**

In `src/lib/design-guidance.ts`, add to imports:

```ts
import { resolveGradientStops } from "./background-settings";
```

Replace `backgroundStops` (lines 161-170) with:

```ts
/** Resolve the color stops a background presents behind text. */
function backgroundStops(screenshot: Screenshot): string[] {
  const stops = resolveGradientStops(screenshot);
  if (stops) return [stops.from, stops.to];
  return [screenshot.backgroundColor];
}
```

- [ ] **Step 7: Run the full type-checked build + affected suites**

Run: `bun run build`
Expected: PASS (no type errors — new fields are optional so existing literals still compile).
Run: `bunx vitest run src/lib/design-guidance.test.ts src/lib/background-parity.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/context/EditorContext.tsx src/lib/export-utils.ts src/lib/design-guidance.ts src/lib/background-parity.test.ts
git commit -m "Route background gradients through shared resolveGradientStops (preview/export/contrast)"
```

---

## Task 3: EditorContext background-defaults state, actions, and migration

**Files:**
- Modify: `src/context/EditorContext.tsx` (context type ~67-182; factories 213-245 & 352-369; migration 247-296 & 331-349; new state + actions near the text-default actions ~560-599)
- Modify: `src/lib/bulk-import.ts:45-56` (set `backgroundOverride: false` on new tiles)
- Test: `src/context/background-defaults.test.tsx` (new — exercises migration + propagation via the pure helpers as used by the context)

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces on the context value:
  - `backgroundDefaults: BackgroundSettings`
  - `setBackgroundDefault(patch: Partial<BackgroundSettings>): void`
  - `setActiveScreenshotBackground(patch: Partial<BackgroundSettings>): void`
  - `resetActiveScreenshotBackground(): void`
  - `applyBrandBackground(settings: BackgroundSettings): void`

- [ ] **Step 1: Write the failing migration test**

Create `src/context/background-defaults.test.tsx`. It verifies the migration contract at the unit level (the helpers the context uses), so it needs no React render:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  applyBackgroundDefaultToScreenshots,
} from "../lib/background-settings";

// Mirrors the rule normalizeScreenshot applies: a persisted screenshot with no
// backgroundOverride flag must become overridden so it keeps its own background.
const migrateFlag = (s: { backgroundOverride?: boolean }) => ({
  ...s,
  backgroundOverride: s.backgroundOverride ?? true,
});

describe("background migration contract", () => {
  it("marks legacy screenshots as overridden so their look is preserved", () => {
    const legacy = { id: "a", backgroundColor: "#123", backgroundMode: "solid" as const, gradientPresetId: null };
    const migrated = migrateFlag(legacy);
    expect(migrated.backgroundOverride).toBe(true);

    // A later Apply of a new default must NOT touch this preserved screenshot.
    const result = applyBackgroundDefaultToScreenshots(
      [migrated],
      { ...DEFAULT_BACKGROUND_SETTINGS, backgroundColor: "#ff0000" },
    );
    expect(result[0].backgroundColor).toBe("#123");
  });

  it("keeps an explicit false flag as inheriting", () => {
    const fresh = { id: "b", backgroundColor: "#123", backgroundMode: "solid" as const, gradientPresetId: null, backgroundOverride: false };
    expect(migrateFlag(fresh).backgroundOverride).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/context/background-defaults.test.tsx`
Expected: FAIL (module resolves but the assertions guard the behavior you implement next; if you scaffold `migrateFlag` inline it passes — that is fine, this test locks the contract the context must honor).

> Note: this test locks the contract; Steps 3-7 wire the identical rule into the real context.

- [ ] **Step 3: Add the fields to the context type**

In `src/context/EditorContext.tsx`, in `interface EditorContextType`, after the `resetActiveScreenshotText` member add:

```ts
  /** Project-level background default */
  backgroundDefaults: BackgroundSettings;
  /** Update the background default and propagate to non-overriding screenshots */
  setBackgroundDefault: (patch: Partial<BackgroundSettings>) => void;
  /** Override the background on the active screenshot */
  setActiveScreenshotBackground: (patch: Partial<BackgroundSettings>) => void;
  /** Clear the active screenshot's background override */
  resetActiveScreenshotBackground: () => void;
  /** Set the default AND clear every screenshot's override so all inherit it */
  applyBrandBackground: (settings: BackgroundSettings) => void;
```

Add imports at the top:

```ts
import {
  DEFAULT_BACKGROUND_SETTINGS,
  applyBackgroundDefaultToScreenshots,
  overrideScreenshotBackground,
  resetScreenshotBackground as resetScreenshotBackgroundFields,
  pickBackgroundSettings,
  type BackgroundSettings,
} from "../lib/background-settings";
```

- [ ] **Step 4: Add background defaults to the factories and migration**

In `createDefaultScreenshot` (return object, after `gradientPresetId: null,`) add:

```ts
    backgroundOverride: false,
```

In `createDefaultProject` (return object, after `textDefaults: { ...DEFAULT_TEXT_SETTINGS },`) add:

```ts
    backgroundDefaults: { ...DEFAULT_BACKGROUND_SETTINGS },
```

In `normalizeScreenshot`, in the returned object add (after the `textOverrides:` line):

```ts
    backgroundOverride: screenshot.backgroundOverride ?? true,
```

In `normalizeProject`, in the returned object (after `textDefaults,`) add:

```ts
    backgroundDefaults: project.backgroundDefaults ?? { ...DEFAULT_BACKGROUND_SETTINGS },
```

- [ ] **Step 5: Add the state and actions**

Add state near where `textDefaults` state is created (search `setTextDefaultsState`):

```ts
  const [backgroundDefaults, setBackgroundDefaultsState] = useState<BackgroundSettings>(
    activeProject.backgroundDefaults ?? { ...DEFAULT_BACKGROUND_SETTINGS },
  );
```

> If `textDefaults` state is re-seeded on project switch via an effect, add `setBackgroundDefaultsState(activeProject.backgroundDefaults ?? { ...DEFAULT_BACKGROUND_SETTINGS })` in that same effect so switching projects loads the right default.

Add the actions next to `setTextDefault` / `setActiveScreenshotText`:

```ts
  // Update the background default and push it into every inheriting screenshot.
  const setBackgroundDefault = (patch: Partial<BackgroundSettings>) => {
    const next = { ...backgroundDefaults, ...patch };
    setBackgroundDefaultsState(next);
    setScreenshotsState((prev) => applyBackgroundDefaultToScreenshots(prev, next));
  };

  // Override the background on the active screenshot only.
  const setActiveScreenshotBackground = (patch: Partial<BackgroundSettings>) => {
    setScreenshotsState((prev) =>
      prev.map((s) =>
        s.id === activeScreenshotId ? overrideScreenshotBackground(s, patch) : s,
      ),
    );
  };

  // Clear the active screenshot's override, reverting to the default.
  const resetActiveScreenshotBackground = () => {
    setScreenshotsState((prev) =>
      prev.map((s) =>
        s.id === activeScreenshotId
          ? resetScreenshotBackgroundFields(s, backgroundDefaults)
          : s,
      ),
    );
  };

  // Set the default AND clear all overrides so every screenshot follows it.
  const applyBrandBackground = (settings: BackgroundSettings) => {
    setBackgroundDefaultsState(settings);
    setScreenshotsState((prev) =>
      prev.map((s) => ({
        ...s,
        ...pickBackgroundSettings(settings),
        backgroundOverride: false,
      })),
    );
  };
```

Add all five names (`backgroundDefaults`, `setBackgroundDefault`, `setActiveScreenshotBackground`, `resetActiveScreenshotBackground`, `applyBrandBackground`) to the context provider `value={{ ... }}`.

- [ ] **Step 6: New screenshots and bulk tiles inherit the default background**

Find `const addScreenshot` in `EditorContext.tsx`. After the new screenshot object is constructed (via `createDefaultScreenshot(...)`), spread the current default onto it so a newly added tile inherits the brand:

```ts
    const newScreenshot = {
      ...createDefaultScreenshot(selectedDeviceId, selectedColorId),
      ...pickBackgroundSettings(backgroundDefaults),
      backgroundOverride: false,
    };
```

(Adapt the exact variable name/args to the existing code; the point is the spread of `pickBackgroundSettings(backgroundDefaults)` + `backgroundOverride: false`.)

In `src/lib/bulk-import.ts` (the new-tile object around lines 45-56, alongside `textOverrides: []`), add:

```ts
      backgroundOverride: false,
```

- [ ] **Step 7: Verify build + tests**

Run: `bun run build`
Expected: PASS.
Run: `bunx vitest run src/context/background-defaults.test.tsx src/lib/bulk-import.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/context/EditorContext.tsx src/lib/bulk-import.ts src/context/background-defaults.test.tsx
git commit -m "Wire background defaults + override into EditorContext with safe migration"
```

---

## Task 4: BackgroundPicker scope toggle + AppearanceSection wiring

**Files:**
- Modify: `src/components/RightSidebar/AppearanceSection.tsx`
- Modify: `src/components/RightSidebar/RightSidebar.tsx:110-115` (the `<AppearanceSection .../>` props)
- Test: `src/components/RightSidebar/AppearanceSection.test.tsx` (new)

**Interfaces:**
- Consumes: context actions from Task 3.
- Produces: a Global-default / This-screenshot scope toggle in the Background section, plus a Reset shown when the active screenshot's background is overridden.

- [ ] **Step 1: Write the failing test**

Create `src/components/RightSidebar/AppearanceSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppearanceSection } from "./AppearanceSection";
import { gradientPresets } from "../../constants";
import type { Screenshot } from "../../types";

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
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/components/RightSidebar/AppearanceSection.test.tsx`
Expected: FAIL — `AppearanceSection` does not yet accept the new props / has no scope toggle.

- [ ] **Step 3: Rewrite AppearanceSection with a scope toggle**

Replace `src/components/RightSidebar/AppearanceSection.tsx` with:

```tsx
/**
 * AppearanceSection Component
 *
 * Background controls with a global-default / per-screenshot-override scope
 * toggle, mirroring TextSection. Global scope edits the project default (flows to
 * every non-customized screenshot); screenshot scope pins this screenshot.
 */

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Screenshot, GradientPreset, BackgroundSettings } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { BackgroundPicker } from "./BackgroundPicker";
import { ContrastIndicator } from "./ContrastIndicator";
import { STYLES } from "./constants";

interface AppearanceSectionProps {
  screenshot: Screenshot;
  gradientPresets: GradientPreset[];
  onSetBackgroundDefault: (patch: Partial<BackgroundSettings>) => void;
  onSetScreenshotBackground: (patch: Partial<BackgroundSettings>) => void;
  onResetScreenshotBackground: () => void;
  onFixTextColor: (color: string) => void;
}

type Scope = "global" | "screenshot";

export const AppearanceSection = ({
  screenshot,
  gradientPresets,
  onSetBackgroundDefault,
  onSetScreenshotBackground,
  onResetScreenshotBackground,
  onFixTextColor,
}: AppearanceSectionProps) => {
  const [scope, setScope] = useState<Scope>("global");
  const isGlobal = scope === "global";
  const isOverridden = screenshot.backgroundOverride === true;

  const onUpdate = (patch: Partial<Screenshot>) => {
    const bgPatch = patch as Partial<BackgroundSettings>;
    if (isGlobal) onSetBackgroundDefault(bgPatch);
    else onSetScreenshotBackground(bgPatch);
  };

  return (
    <SidebarSection title="Background">
      <div className="flex gap-1 p-0.5 bg-input rounded-lg mb-3">
        <button
          className={`${STYLES.modeButton} ${isGlobal ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
          onClick={() => setScope("global")}
        >
          Global default
        </button>
        <button
          className={`${STYLES.modeButton} ${!isGlobal ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
          onClick={() => setScope("screenshot")}
        >
          This screenshot
        </button>
      </div>

      {!isGlobal && isOverridden && (
        <button
          type="button"
          onClick={onResetScreenshotBackground}
          className="mb-2 flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200"
          title="Reset to global default"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      )}

      <div className="space-y-4">
        <BackgroundPicker
          screenshot={screenshot}
          gradientPresets={gradientPresets}
          onUpdateScreenshot={onUpdate}
        />
        <ContrastIndicator
          textColor={screenshot.textColor}
          screenshot={screenshot}
          onFix={onFixTextColor}
        />
      </div>
    </SidebarSection>
  );
};
```

- [ ] **Step 4: Update RightSidebar to pass the new props**

In `src/components/RightSidebar/RightSidebar.tsx`, pull the new actions from `useEditor()` (add to the existing destructure): `setBackgroundDefault`, `setActiveScreenshotBackground`, `resetActiveScreenshotBackground`. Replace the `<AppearanceSection .../>` block (lines 110-115) with:

```tsx
        <AppearanceSection
          screenshot={activeScreenshot}
          gradientPresets={gradientPresets}
          onSetBackgroundDefault={setBackgroundDefault}
          onSetScreenshotBackground={setActiveScreenshotBackground}
          onResetScreenshotBackground={resetActiveScreenshotBackground}
          onFixTextColor={(color) => setActiveScreenshotText("textColor", color)}
        />
```

Also export `BackgroundSettings` from `src/types/index.ts` if not already re-exported (add `export type { BackgroundSettings } from "../lib/background-settings";`) so the `"../../types"` import in AppearanceSection resolves.

- [ ] **Step 5: Verify**

Run: `bunx vitest run src/components/RightSidebar/AppearanceSection.test.tsx`
Expected: PASS.
Run: `bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/RightSidebar/AppearanceSection.tsx src/components/RightSidebar/AppearanceSection.test.tsx src/components/RightSidebar/RightSidebar.tsx src/types/index.ts
git commit -m "Add background scope toggle (global default / this screenshot)"
```

---

## Task 5: color-utils pure module

**Files:**
- Create: `src/lib/color-utils.ts`
- Test: `src/lib/color-utils.test.ts`

**Interfaces:**
- Produces: `hexToRgb`, `rgbToHex`, `hexToHsl`, `hslToHex`, `adjustLightness(hex, deltaL)`, `rotateHue(hex, deg)`, `mix(a, b, t)`, `interface Hsl { h; s; l }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/color-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, adjustLightness, rotateHue, mix } from "./color-utils";

describe("color-utils", () => {
  it("mixes two colors linearly", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("round-trips primary red through HSL", () => {
    expect(hslToHex(hexToHsl("#ff0000"))).toBe("#ff0000");
  });

  it("lightens toward white and darkens toward black", () => {
    expect(adjustLightness("#808080", 100)).toBe("#ffffff");
    expect(adjustLightness("#808080", -100)).toBe("#000000");
  });

  it("rotating hue by 360 degrees returns the same color", () => {
    expect(rotateHue("#8b5cf6", 360)).toBe("#8b5cf6");
  });

  it("clamps mix ratio to [0,1]", () => {
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/color-utils.test.ts`
Expected: FAIL — cannot find module `./color-utils`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/color-utils.ts`:

```ts
/** Small color-math helpers for deriving brand palettes. Hues in degrees, s/l in %. */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clampByte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");

export const hexToHsl = (hex: string): Hsl => {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = (((gn - bn) / d) % 6 + 6) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
};

export const hslToHex = ({ h, s, l }: Hsl): string => {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

export const adjustLightness = (hex: string, deltaL: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(100, hsl.l + deltaL)) });
};

export const rotateHue = (hex: string, deg: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: hsl.h + deg });
};

export const mix = (a: string, b: string, t: number): string => {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
  );
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run src/lib/color-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/color-utils.ts src/lib/color-utils.test.ts
git commit -m "Add color-utils (hsl conversions, lightness/hue/mix)"
```

---

## Task 6: brand-guide engine

**Files:**
- Create: `src/lib/brand-guide.ts`
- Test: `src/lib/brand-guide.test.ts`

**Interfaces:**
- Consumes: `color-utils` (Task 5), `background-settings` (`BackgroundSettings`, `resolveGradientStops`), `design-guidance` (`readableTextOptions`, `contrastRatio`, `isLargeText`, `classifyContrast`).
- Produces: `type Character`, `type Energy`, `interface VibeRecipe`, `VIBES: VibeRecipe[]`, `vibeForAxes(character, energy)`, `getVibe(id)`, `interface BrandLook`, `generateBrandLook(brandColor, vibeId): BrandLook`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand-guide.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/brand-guide.test.ts`
Expected: FAIL — cannot find module `./brand-guide`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/brand-guide.ts`:

```ts
/**
 * Brand guide "design brain" — turns a brand color + a vibe into a coordinated,
 * contrast-validated look (font, size scale, background, readable text color).
 * Pure; the generated text color is validated with the Phase 1 contrast engine so
 * a brand can never be unreadable. Six vibes sit on a Character x Energy grid.
 */

import type { BackgroundSettings } from "./background-settings";
import { resolveGradientStops } from "./background-settings";
import { adjustLightness, rotateHue, mix } from "./color-utils";
import { readableTextOptions, contrastRatio } from "./design-guidance";

export type Character = "modern" | "friendly" | "classic";
export type Energy = "calm" | "bold";

const NEAR_WHITE = "#f7f7f5";
const WARM_CREAM = "#fff6e9";

export interface VibeRecipe {
  id: string;
  label: string;
  character: Character;
  energy: Energy;
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  background: (brand: string) => BackgroundSettings;
}

const gradient = (from: string, to: string): BackgroundSettings => ({
  backgroundMode: "gradient",
  backgroundColor: from,
  gradientPresetId: null,
  gradientFrom: from,
  gradientTo: to,
});

const solid = (color: string): BackgroundSettings => ({
  backgroundMode: "solid",
  backgroundColor: color,
  gradientPresetId: null,
});

export const VIBES: VibeRecipe[] = [
  {
    id: "minimal", label: "Minimal", character: "modern", energy: "calm",
    fontFamily: "Inter", headlineFontSize: 60, subheadlineFontSize: 36,
    background: (brand) => solid(mix(brand, NEAR_WHITE, 0.86)),
  },
  {
    id: "bold", label: "Bold", character: "modern", energy: "bold",
    fontFamily: "Poppins", headlineFontSize: 72, subheadlineFontSize: 42,
    background: (brand) => gradient(brand, adjustLightness(brand, -22)),
  },
  {
    id: "warm", label: "Warm", character: "friendly", energy: "calm",
    fontFamily: "Nunito", headlineFontSize: 64, subheadlineFontSize: 40,
    background: (brand) => solid(mix(brand, WARM_CREAM, 0.8)),
  },
  {
    id: "playful", label: "Playful", character: "friendly", energy: "bold",
    fontFamily: "Quicksand", headlineFontSize: 76, subheadlineFontSize: 44,
    background: (brand) => gradient(brand, rotateHue(brand, 32)),
  },
  {
    id: "elegant", label: "Elegant", character: "classic", energy: "calm",
    fontFamily: "Playfair Display", headlineFontSize: 66, subheadlineFontSize: 38,
    background: (brand) => solid(adjustLightness(brand, -35)),
  },
  {
    id: "editorial", label: "Editorial", character: "classic", energy: "bold",
    fontFamily: "Lora", headlineFontSize: 70, subheadlineFontSize: 40,
    background: (brand) => gradient(adjustLightness(brand, -30), brand),
  },
];

export const vibeForAxes = (character: Character, energy: Energy): VibeRecipe =>
  VIBES.find((v) => v.character === character && v.energy === energy) ?? VIBES[0];

export const getVibe = (id: string): VibeRecipe =>
  VIBES.find((v) => v.id === id) ?? VIBES[0];

export interface BrandLook {
  fontFamily: string;
  headlineFontSize: number;
  subheadlineFontSize: number;
  textColor: string;
  background: BackgroundSettings;
}

const stopsOf = (bg: BackgroundSettings): string[] => {
  const stops = resolveGradientStops(bg);
  return stops ? [stops.from, stops.to] : [bg.backgroundColor];
};

/** Pick the readable candidate with the best worst-case contrast across stops. */
const pickTextColor = (bg: BackgroundSettings): string => {
  const stops = stopsOf(bg);
  const mid = stops.length === 2 ? mix(stops[0], stops[1], 0.5) : stops[0];
  const candidates = readableTextOptions(mid);
  return candidates
    .map((c) => ({
      c,
      worst: Math.min(...stops.map((s) => contrastRatio(c, s))),
    }))
    .sort((a, b) => b.worst - a.worst)[0].c;
};

export const generateBrandLook = (
  brandColor: string,
  vibeId: string,
): BrandLook => {
  const vibe = getVibe(vibeId);
  const background = vibe.background(brandColor);
  return {
    fontFamily: vibe.fontFamily,
    headlineFontSize: vibe.headlineFontSize,
    subheadlineFontSize: vibe.subheadlineFontSize,
    textColor: pickTextColor(background),
    background,
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run src/lib/brand-guide.test.ts`
Expected: PASS (all cases, including the readability invariant).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-guide.ts src/lib/brand-guide.test.ts
git commit -m "Add brand-guide engine (6-vibe grid, contrast-validated BrandLook)"
```

---

## Task 7: BrandGuideSection — guided flow + live preview

**Files:**
- Create: `src/components/RightSidebar/BrandGuideSection.tsx`
- Modify: `src/components/RightSidebar/RightSidebar.tsx` (render `<BrandGuideSection />` FIRST, above `<DesignCheckSection />`)
- Test: `src/components/RightSidebar/BrandGuideSection.test.tsx`

**Interfaces:**
- Consumes: `brand-guide` (`VIBES`, `vibeForAxes`, `generateBrandLook`, `Character`, `Energy`), `getBackgroundStyle` pattern, `useEditor`.
- Produces: `BrandGuideSection` component. Local state: `mode` ("guided" | "advanced"), `brandColor`, `character`, `energy`, `vibeId`. Apply wiring is added in Task 8 (this task renders a disabled/no-op Apply placeholder button so the layout is complete).

- [ ] **Step 1: Write the failing test**

Create `src/components/RightSidebar/BrandGuideSection.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/components/RightSidebar/BrandGuideSection.test.tsx`
Expected: FAIL — cannot find module `./BrandGuideSection`.

- [ ] **Step 3: Write the component**

Create `src/components/RightSidebar/BrandGuideSection.tsx`:

```tsx
/**
 * BrandGuideSection
 *
 * Define a brand once (color + a guided "vibe", or manual controls) and generate a
 * coordinated, contrast-validated look. Two axis questions (Character x Energy)
 * recommend one of six vibes; the user can also pick any vibe card directly. A live
 * preview reuses the contrast chip. Apply (Task 8) writes the project defaults.
 * Collapsible; placed first in the right sidebar.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import {
  VIBES,
  vibeForAxes,
  generateBrandLook,
  type Character,
  type Energy,
} from "../../lib/brand-guide";
import { resolveGradientStops } from "../../lib/background-settings";
import { assessScreenshotContrast } from "../../lib/design-guidance";
import { SwatchColorInput } from "./SwatchColorInput";
import { STYLES } from "./constants";
import type { Screenshot } from "../../types";

type Mode = "guided" | "advanced";

const CHARACTERS: { value: Character; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "friendly", label: "Friendly" },
  { value: "classic", label: "Classic" },
];
const ENERGIES: { value: Energy; label: string }[] = [
  { value: "calm", label: "Calm & minimal" },
  { value: "bold", label: "Bold & vivid" },
];

export const BrandGuideSection = () => {
  const { backgroundDefaults } = useEditor();
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<Mode>("guided");
  const [brandColor, setBrandColor] = useState<string>(
    backgroundDefaults.backgroundColor ?? "#8b5cf6",
  );
  const [character, setCharacter] = useState<Character | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [vibeId, setVibeId] = useState<string>("minimal");

  // When both axes are answered, recommend (and select) the matching vibe.
  const recommend = (c: Character | null, e: Energy | null) => {
    if (c && e) setVibeId(vibeForAxes(c, e).id);
  };

  const look = useMemo(
    () => generateBrandLook(brandColor, vibeId),
    [brandColor, vibeId],
  );

  // Build a Screenshot-shaped probe so the contrast chip can assess the look.
  const probe = useMemo(
    () =>
      ({
        headline: "Aa",
        subheadline: "Aa",
        ...look.background,
        headlineFontSize: look.headlineFontSize,
        subheadlineFontSize: look.subheadlineFontSize,
      }) as unknown as Screenshot,
    [look],
  );
  const assessment = assessScreenshotContrast(look.textColor, probe);

  const stops = resolveGradientStops(look.background);
  const previewBg = stops
    ? `linear-gradient(180deg, ${stops.from}, ${stops.to})`
    : look.background.backgroundColor;

  return (
    <div className={STYLES.section}>
      <button
        type="button"
        className={STYLES.sectionHeader}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Brand guide</span>
      </button>

      {expanded && (
        <div className="space-y-3 pt-2">
          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 bg-input rounded-lg">
            <button
              className={`${STYLES.modeButton} ${mode === "guided" ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => setMode("guided")}
            >
              Guided
            </button>
            <button
              className={`${STYLES.modeButton} ${mode === "advanced" ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => setMode("advanced")}
            >
              I'll set it myself
            </button>
          </div>

          {/* Brand color (shared) */}
          <div>
            <label className={STYLES.label}>Brand color</label>
            <SwatchColorInput
              value={brandColor}
              onChange={setBrandColor}
              label="Brand color"
            />
          </div>

          {mode === "guided" && (
            <>
              <div>
                <p className={STYLES.label}>Character</p>
                <div className="grid grid-cols-3 gap-1">
                  {CHARACTERS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => {
                        setCharacter(c.value);
                        recommend(c.value, energy);
                      }}
                      aria-pressed={character === c.value}
                      className={`${STYLES.modeButton} ${character === c.value ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={STYLES.label}>Energy</p>
                <div className="grid grid-cols-2 gap-1">
                  {ENERGIES.map((e) => (
                    <button
                      key={e.value}
                      onClick={() => {
                        setEnergy(e.value);
                        recommend(character, e.value);
                      }}
                      aria-pressed={energy === e.value}
                      className={`${STYLES.modeButton} ${energy === e.value ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vibe cards */}
              <div className="grid grid-cols-2 gap-1">
                {VIBES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVibeId(v.id);
                      setCharacter(v.character);
                      setEnergy(v.energy);
                    }}
                    aria-pressed={vibeId === v.id}
                    aria-label={v.label}
                    className={`rounded-md px-2 py-1.5 text-left text-xs ${vibeId === v.id ? "ring-2 ring-violet-400 bg-input" : "bg-input/50 hover:bg-input"}`}
                  >
                    <span style={{ fontFamily: `'${v.fontFamily}', sans-serif` }}>
                      {v.label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "advanced" && (
            <p className="text-[11px] text-zinc-500">
              Advanced controls appear here (font, background, sizes) — added next.
            </p>
          )}

          {/* Live preview */}
          <div>
            <p className={STYLES.label}>Preview</p>
            <div
              className="rounded-lg p-4 text-center"
              style={{ background: previewBg }}
            >
              <div
                style={{
                  color: look.textColor,
                  fontFamily: `'${look.fontFamily}', sans-serif`,
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                Aa
              </div>
              <div
                style={{
                  color: look.textColor,
                  fontFamily: `'${look.fontFamily}', sans-serif`,
                  fontSize: 12,
                }}
              >
                Your headline
              </div>
            </div>
            {assessment && (
              <p
                className={`mt-1 text-[11px] ${assessment.passes ? "text-emerald-400" : "text-amber-300"}`}
              >
                {assessment.passes ? "Readable" : "Low contrast"} ·{" "}
                {assessment.ratio.toFixed(1)}:1
              </p>
            )}
          </div>

          {/* Apply placeholder — wired in Task 8 */}
          <button type="button" disabled className={STYLES.primaryButtonDisabled ?? STYLES.dropdownButton}>
            Apply brand to project
          </button>
        </div>
      )}
    </div>
  );
};
```

> If `STYLES.section`, `STYLES.sectionHeader`, `STYLES.primaryButtonDisabled`, or `STYLES.label` don't exist with those exact names, open `src/components/RightSidebar/constants.ts`, use the closest existing keys (match what `DesignCheckSection` uses for its collapsible header and what `TextSection` uses for `STYLES.label`), and adjust these references. Do not invent new CSS.

- [ ] **Step 4: Render it first in RightSidebar**

In `src/components/RightSidebar/RightSidebar.tsx`, import and place it above `<DesignCheckSection />`:

```tsx
import { BrandGuideSection } from "./BrandGuideSection";
// ...
        <BrandGuideSection />
        <DesignCheckSection />
```

- [ ] **Step 5: Verify**

Run: `bunx vitest run src/components/RightSidebar/BrandGuideSection.test.tsx`
Expected: PASS.
Run: `bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/RightSidebar/BrandGuideSection.tsx src/components/RightSidebar/BrandGuideSection.test.tsx src/components/RightSidebar/RightSidebar.tsx
git commit -m "Add BrandGuideSection: guided vibe flow + live preview"
```

---

## Task 8: Advanced mode + Apply/confirm wiring

**Files:**
- Modify: `src/components/RightSidebar/BrandGuideSection.tsx`
- Modify: `src/components/RightSidebar/BrandGuideSection.test.tsx` (add Apply test)

**Interfaces:**
- Consumes: `useEditor().setTextDefault`, `useEditor().applyBrandBackground`, `useEditor().screenshots`.
- Produces: a working two-step (inline confirm) Apply that writes text defaults + brand background to all screenshots; advanced-mode direct controls (font select, background solid/gradient stops, size sliders) that edit the same `BrandLook` inputs.

- [ ] **Step 1: Write the failing Apply test**

Add to `src/components/RightSidebar/BrandGuideSection.test.tsx`:

```tsx
describe("BrandGuideSection apply", () => {
  it("applies text defaults and brand background after confirming", () => {
    editor.screenshots = [{ id: "a" }, { id: "b" }] as never;
    render(<BrandGuideSection />);
    fireEvent.click(screen.getByRole("button", { name: /minimal/i }));
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/components/RightSidebar/BrandGuideSection.test.tsx -t "apply"`
Expected: FAIL — the Apply button is disabled / no inline confirm exists.

- [ ] **Step 3: Wire Apply + inline confirm**

In `BrandGuideSection.tsx`, extend the `useEditor()` destructure:

```tsx
  const { backgroundDefaults, screenshots, setTextDefault, applyBrandBackground } =
    useEditor();
```

Add confirm state near the other `useState` calls:

```tsx
  const [confirming, setConfirming] = useState(false);
```

Add the apply handler before `return`:

```tsx
  const applyBrand = () => {
    setTextDefault("fontFamily", look.fontFamily);
    setTextDefault("headlineFontSize", look.headlineFontSize);
    setTextDefault("subheadlineFontSize", look.subheadlineFontSize);
    setTextDefault("textColor", look.textColor);
    applyBrandBackground(look.background);
    setConfirming(false);
  };
```

Replace the disabled Apply placeholder button with the two-step control:

```tsx
          {confirming ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={applyBrand}
                className="flex-1 rounded-md bg-violet-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
              >
                Apply to {screenshots.length} screenshot
                {screenshots.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md bg-input px-2 py-1.5 text-xs text-zinc-300 hover:bg-input/70"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full rounded-md bg-violet-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
            >
              Apply brand to project
            </button>
          )}
          <p className="text-[10px] text-zinc-500">
            Sets your global text + background. Screenshots with a custom background
            will be reset to the brand look. Undo reverts it.
          </p>
```

- [ ] **Step 4: Add advanced-mode direct controls**

Replace the advanced-mode placeholder `<p>` with real controls that drive the same inputs. In advanced mode the vibe still supplies font/sizes/background recipe, but the user can override the resolved font and background directly by editing local overrides. Implement a minimal, honest version: expose a font `<select>` and a solid/gradient toggle writing to a local `advancedBg` state that, when set, replaces `look.background`. Add state:

```tsx
  const [advancedFont, setAdvancedFont] = useState<string | null>(null);
```

Compute the effective look with the advanced font override:

```tsx
  const effective = useMemo(
    () => (advancedFont ? { ...look, fontFamily: advancedFont } : look),
    [look, advancedFont],
  );
```

Use `effective` instead of `look` in the preview, `applyBrand`, and `probe`. Render the advanced controls:

```tsx
          {mode === "advanced" && (
            <div className="space-y-2">
              <label className={STYLES.label}>Font</label>
              <select
                value={effective.fontFamily}
                onChange={(e) => setAdvancedFont(e.target.value)}
                className={STYLES.dropdownButton}
              >
                {VIBES.map((v) => (
                  <option key={v.id} value={v.fontFamily}>
                    {v.fontFamily}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500">
                Pick any brand color and font; the background and readable text color
                are still derived and contrast-checked from your chosen vibe.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {VIBES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVibeId(v.id);
                      setAdvancedFont(null);
                    }}
                    aria-pressed={vibeId === v.id}
                    aria-label={v.label}
                    className={`rounded-md px-2 py-1.5 text-left text-xs ${vibeId === v.id ? "ring-2 ring-violet-400 bg-input" : "bg-input/50 hover:bg-input"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
```

Update `applyBrand`, `probe`, and `previewBg`/preview JSX to read from `effective` instead of `look`.

- [ ] **Step 5: Verify**

Run: `bunx vitest run src/components/RightSidebar/BrandGuideSection.test.tsx`
Expected: PASS (guided, direct-select, and apply cases).
Run: `bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/RightSidebar/BrandGuideSection.tsx src/components/RightSidebar/BrandGuideSection.test.tsx
git commit -m "Add brand-guide advanced mode + Apply-to-project with inline confirm"
```

---

## Task 9: Polish + full in-browser verification

**Files:**
- Modify: as needed for fixes surfaced by verification (no new features).

- [ ] **Step 1: Full suite + build**

Run: `bun run test`
Expected: PASS (whole Vitest suite).
Run: `bun run build`
Expected: PASS.

- [ ] **Step 2: In-browser verification (dev server on http://localhost:5173)**

Verify on a **multi-screenshot** project (add 2-3 screenshots). Confirm each:
- [ ] Brand guide is the first right-sidebar section, collapsible.
- [ ] Guided: answering Character + Energy highlights the matching vibe card; the preview updates font/background/text and shows a "Readable" chip.
- [ ] Advanced: switching mode lets you change the font; the preview and readability chip update.
- [ ] Apply → inline confirm shows the correct screenshot count → confirming updates the global text defaults and sets every screenshot's background to the brand look (all tiles change together).
- [ ] A screenshot with a manual **background** override (set via the Background section "This screenshot" scope) is reset by Apply's confirm (matches the confirm copy).
- [ ] A screenshot with a manual **text** override keeps its text (text overrides are preserved).
- [ ] The background scope toggle in the Background section: Global edits flow to non-overridden tiles; "This screenshot" pins one and shows Reset; Reset re-inherits.
- [ ] Export a screenshot that uses a **brand gradient** (Bold/Playful/Editorial) and confirm the exported PNG background matches the on-canvas preview (pipeline parity).
- [ ] Undo reverts an Apply.

Use `javascript_tool` DOM queries for assertions if the screenshot tool is flaky (per prior session notes). Drive changes through real UI handlers (`button.click()`), not localStorage.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "Polish brand guide (Phase 2) after in-browser verification"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** Part A → Tasks 1-4; Part B → Tasks 5-6; Part C → Tasks 7-8; verification → Task 9. The third gradient consumer (`design-guidance.ts`) is explicitly rerouted in Task 2 Step 6.
- **Type consistency:** `resolveGradientStops`, `applyBackgroundDefaultToScreenshots`, `pickBackgroundSettings`, `generateBrandLook`, `vibeForAxes`, `applyBrandBackground`, `setBackgroundDefault`, `setActiveScreenshotBackground`, `resetActiveScreenshotBackground` are named identically wherever referenced.
- **Migration safety:** new fields optional; `normalizeScreenshot` uses `?? true`, `normalizeProject` uses `?? DEFAULT_BACKGROUND_SETTINGS` — existing saved projects keep their exact backgrounds.

# Agent Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI agent produce `appshots.json` + screenshots that AppShots imports (folder / files / zip) into a fully polished project, with a generated agent prompt and JSON Schema.

**Architecture:** A pure, React-free pipeline under `src/lib/agent-import/` — `collectBundle` (files/zip) → `parseManifest` (Zod) → `compileManifest` (semantic manifest → normal `Project` + warnings) — orchestrated by `runAgentImport`. One Zod schema drives types, validation errors, the JSON Schema, and (with the live device/font/layout lists) the agent prompt; a test fails if committed docs drift. A thin modal + one `EditorContext` action apply the result as a new project or replace the current one.

**Tech Stack:** React 19 + TypeScript + Vite (Bun); Vitest (default env **jsdom**, see `vite.config.ts`) + Testing Library; Zod v4; JSZip (already a dependency); lucide-react; Tailwind classes.

**Spec:** `docs/superpowers/specs/2026-09-15-agent-import-design.md`

## Global Constraints

- Branch: `design/agent-import`. Do not touch `design/color-picker-react-colorful`.
- Test one file: `bunx vitest run <path>`; by name: `bunx vitest run -t "<name>"`. Full gate before "done": `bun run build` (vite build THEN `tsc`) and `bun run test`.
- **No rendering changes.** Do not edit `src/components/DeviceFrame/*`, `src/lib/export-utils.ts`, or `src/lib/rich-text-canvas.ts`.
- **Persisted shapes unchanged.** No new fields on `Project`/`Screenshot`/`DeviceInstance`. Imported projects must survive `normalizeProject` unchanged.
- Manifest literals: `format: "appshots-import"`, `version: 1`, manifest filename `appshots.json`. Accepted image types: png, jpeg, webp.
- Headline/subheadline HTML allowlist: `b`, `strong`, `i`, `em`, `u`, `mark`, `br`, `span`; only `color` / `background-color` styles survive (and only `background-color` on `mark`).
- Default layout when omitted: `bleed-bottom`. Style defaults to `minimal` when `brand.primary` is set without `brand.style`.
- Storage warning budget: `4_500_000` characters.
- jsdom facts (verified by probe): `File.prototype.text()`/`arrayBuffer()` do **not** exist — read files with `FileReader`. `JSZip.loadAsync(file)` works; zip entries via `entry.async("blob")` work. `createImageBitmap` does not exist and images never load — image decoding is injected (`ReadImage`) and stubbed in tests.
- `tsc` type-checks tests and `scripts/` too (`tsconfig.json` includes `**/*.ts`). Avoid `new File([uint8Array])` (TS lib `BlobPart` generic mismatch) — use strings, `Blob`, or `ArrayBuffer` parts.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG
  ```

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/layout-presets.ts` | create | The 8 layout presets (device settings + text positions + description), shared by editor and importer |
| `src/components/RightSidebar/PositionPresets.tsx` | modify | Consume `LAYOUT_PRESETS`; keep icons + identical editor behavior |
| `src/lib/agent-import/issues.ts` | create | `ImportIssue`, `ImportError`, path formatting, storage budget check |
| `src/lib/agent-import/schema.ts` | create | Zod manifest schema, types, `parseManifest`, `buildJsonSchema` |
| `src/lib/agent-import/sanitize.ts` | create | Rich-text allowlist sanitizer + `<mark>` color application |
| `src/lib/brand-guide.ts` | modify | Export `pickReadableTextColor` (was private `pickTextColor`) |
| `src/lib/agent-import/resolve.ts` | create | Value resolvers with fallback warnings (device, color, font, export size, background, shadow, highlight) |
| `src/lib/agent-import/compile.ts` | create | Manifest + loaded images → `Project` + warnings |
| `src/context/EditorContext.tsx` | modify | Export `normalizeProject`; add `applyAgentImport`, `isAgentImportOpen` |
| `src/lib/agent-import/bundle.ts` | create | Files/zip → manifest text + image map; `FileReader` helpers |
| `src/lib/agent-import/dropped-files.ts` | create | Recursive folder drop traversal (`webkitGetAsEntry`) |
| `src/lib/agent-import/pipeline.ts` | create | `runAgentImport` orchestration; browser `readImageFile` |
| `src/lib/agent-import/apply.ts` | create | Pure "replace current project" merge |
| `src/lib/agent-import/example.ts` | create | Worked example manifest + placeholder image specs |
| `src/lib/agent-import/prompt.ts` | create | `buildAgentPrompt()` markdown |
| `src/lib/agent-import/docs.ts` | create | `renderAgentDocs()` — committed doc paths → contents |
| `src/lib/agent-import/index.ts` | create | Public re-exports |
| `scripts/gen-agent-docs.ts` | create | Writes docs + example PNGs (`bun run gen:agent-docs`) |
| `docs/agent-import/*` | generated | `PROMPT.md`, `appshots-import.schema.json`, `example/`, `README.md` (hand-written) |
| `src/components/AgentImport/AgentImportModal.tsx` | create | Drop → errors/summary → new/replace; copy prompt; download schema |
| `src/components/ProjectSwitcher/ProjectSwitcher.tsx` | modify | "Import from agent…" menu item |
| `src/components/EditorLayout.tsx` | modify | Mount the modal |
| `CLAUDE.md` | modify | Agent-import maintenance note |

---

### Task 1: Shared layout presets

**Files:**
- Create: `src/lib/layout-presets.ts`
- Modify: `src/components/RightSidebar/PositionPresets.tsx:17-156` (types + `PRESETS` array + active detection)
- Test: `src/lib/layout-presets.test.ts`

**Interfaces:**
- Consumes: `DeviceInstance` from `src/types`.
- Produces:
  - `type LayoutPresetId = "centered" | "bleed-bottom" | "bleed-top" | "float-center" | "tilt-left" | "tilt-right" | "perspective" | "float-bottom"`
  - `interface TextPosition { x: number; y: number }`
  - `interface LayoutPreset { id: LayoutPresetId; label: string; description: string; device: { scale: number; y: number; rotation: number; style?: DeviceStyle; rotateX?: number; rotateY?: number }; text: { headline: TextPosition; subheadline: TextPosition } }`
  - `LAYOUT_PRESETS: LayoutPreset[]`, `LAYOUT_PRESET_IDS: [LayoutPresetId, ...LayoutPresetId[]]`, `DEFAULT_LAYOUT_PRESET_ID: LayoutPresetId`
  - `getLayoutPreset(id: string): LayoutPreset` (unknown → default)
  - `presetDeviceSettings(preset: LayoutPreset): Partial<DeviceInstance>` (adds `style: "flat"` when the preset has no style — the editor's exact pre-refactor settings)

- [ ] **Step 1: Write the failing test**

Create `src/lib/layout-presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PRESET_ID,
  LAYOUT_PRESETS,
  LAYOUT_PRESET_IDS,
  getLayoutPreset,
  presetDeviceSettings,
} from "./layout-presets";

// The editor's PositionPresets values before extraction — must not change.
const EDITOR_SETTINGS_BEFORE_REFACTOR: Record<string, object> = {
  centered: { scale: 65, y: 35, rotation: 0, style: "flat" },
  "bleed-bottom": { scale: 70, y: 45, rotation: 0, style: "flat" },
  "bleed-top": { scale: 70, y: 15, rotation: 0, style: "flat" },
  "float-center": { scale: 55, y: 30, rotation: 0, style: "flat" },
  "tilt-left": { scale: 60, y: 35, rotation: -15, style: "flat" },
  "tilt-right": { scale: 60, y: 35, rotation: 15, style: "flat" },
  perspective: { scale: 60, y: 35, rotation: 0, style: "3d", rotateY: -20, rotateX: 5 },
  "float-bottom": { scale: 50, y: 50, rotation: 0, style: "flat" },
};

describe("layout presets", () => {
  it("lists the eight presets in editor order with unique ids", () => {
    expect(LAYOUT_PRESET_IDS).toEqual([
      "centered",
      "bleed-bottom",
      "bleed-top",
      "float-center",
      "tilt-left",
      "tilt-right",
      "perspective",
      "float-bottom",
    ]);
    expect(new Set(LAYOUT_PRESET_IDS).size).toBe(LAYOUT_PRESETS.length);
  });

  it("keeps the editor's device settings identical", () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(presetDeviceSettings(preset)).toEqual(
        EDITOR_SETTINGS_BEFORE_REFACTOR[preset.id],
      );
    }
  });

  it("gives every preset a description and in-bounds text positions", () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(10);
      for (const pos of [preset.text.headline, preset.text.subheadline]) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(100);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(100);
      }
      expect(preset.text.subheadline.y).toBeGreaterThan(preset.text.headline.y);
    }
  });

  it("only perspective carries a style", () => {
    const styled = LAYOUT_PRESETS.filter((p) => p.device.style !== undefined);
    expect(styled.map((p) => p.id)).toEqual(["perspective"]);
  });

  it("puts text below the device for bleed-top", () => {
    expect(getLayoutPreset("bleed-top").text.headline.y).toBeGreaterThan(50);
  });

  it("falls back to the default preset for unknown ids", () => {
    expect(DEFAULT_LAYOUT_PRESET_ID).toBe("bleed-bottom");
    expect(getLayoutPreset("nope").id).toBe("bleed-bottom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/layout-presets.test.ts`
Expected: FAIL — `Failed to resolve import "./layout-presets"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/layout-presets.ts`:

```ts
/**
 * Layout presets — the named device + text arrangements shared by the editor's
 * Position Presets panel (which applies only the device part) and the agent
 * importer (which applies both). Text positions are percent of the canvas.
 */

import type { DeviceInstance, DeviceStyle } from "../types";

export type LayoutPresetId =
  | "centered"
  | "bleed-bottom"
  | "bleed-top"
  | "float-center"
  | "tilt-left"
  | "tilt-right"
  | "perspective"
  | "float-bottom";

export interface TextPosition {
  x: number;
  y: number;
}

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  /** One line for the agent prompt: what the layout looks like and when to use it. */
  description: string;
  device: {
    scale: number;
    y: number;
    rotation: number;
    /** Set only when the layout is intrinsically 3D; otherwise the project style applies. */
    style?: DeviceStyle;
    rotateX?: number;
    rotateY?: number;
  };
  text: { headline: TextPosition; subheadline: TextPosition };
}

const TEXT_TOP = { headline: { x: 50, y: 10 }, subheadline: { x: 50, y: 18 } };
const TEXT_BOTTOM = { headline: { x: 50, y: 80 }, subheadline: { x: 50, y: 88 } };

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "centered",
    label: "Centered",
    description: "Upright device in the middle, text above. Safe default for any screen.",
    device: { scale: 65, y: 35, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "bleed-bottom",
    label: "Bleed Bottom",
    description: "Large upright device running off the bottom edge, text above. Strong hero layout.",
    device: { scale: 70, y: 45, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "bleed-top",
    label: "Bleed Top",
    description: "Large device running off the top edge, text below. Use to break rhythm mid-set.",
    device: { scale: 70, y: 15, rotation: 0 },
    text: TEXT_BOTTOM,
  },
  {
    id: "float-center",
    label: "Float Center",
    description: "Smaller floating device with generous space. Good for dense screens that need air.",
    device: { scale: 55, y: 30, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "tilt-left",
    label: "Tilt Left",
    description: "Device rotated 15° counter-clockwise, text above. Adds energy; alternate with tilt-right.",
    device: { scale: 60, y: 35, rotation: -15 },
    text: TEXT_TOP,
  },
  {
    id: "tilt-right",
    label: "Tilt Right",
    description: "Device rotated 15° clockwise, text above. Adds energy; alternate with tilt-left.",
    device: { scale: 60, y: 35, rotation: 15 },
    text: TEXT_TOP,
  },
  {
    id: "perspective",
    label: "Perspective",
    description: "3D device turned toward the viewer, text above. Premium feel; use once or twice per set.",
    device: { scale: 60, y: 35, rotation: 0, style: "3d", rotateY: -20, rotateX: 5 },
    text: TEXT_TOP,
  },
  {
    id: "float-bottom",
    label: "Float Bottom",
    description: "Small device low on the canvas, text above with room for a longer subheadline.",
    device: { scale: 50, y: 50, rotation: 0 },
    text: TEXT_TOP,
  },
];

export const LAYOUT_PRESET_IDS = LAYOUT_PRESETS.map((p) => p.id) as [
  LayoutPresetId,
  ...LayoutPresetId[],
];

export const DEFAULT_LAYOUT_PRESET_ID: LayoutPresetId = "bleed-bottom";

export const getLayoutPreset = (id: string): LayoutPreset =>
  LAYOUT_PRESETS.find((p) => p.id === id) ??
  (LAYOUT_PRESETS.find((p) => p.id === DEFAULT_LAYOUT_PRESET_ID) as LayoutPreset);

/** The device patch the editor applies when a preset is clicked. */
export const presetDeviceSettings = (
  preset: LayoutPreset,
): Partial<DeviceInstance> => ({ style: "flat", ...preset.device });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/layout-presets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Refactor `PositionPresets.tsx` to consume the shared list**

In `src/components/RightSidebar/PositionPresets.tsx`:

1. Add imports under the existing ones:
```ts
import {
  LAYOUT_PRESETS,
  presetDeviceSettings,
  type LayoutPresetId,
} from "../../lib/layout-presets";
```
2. Replace the entire `const PRESETS: Preset[] = [ ... ];` block (lines 65-156) with:
```tsx
const PRESET_ICONS: Record<LayoutPresetId, React.ReactNode> = {
  centered: <DeviceIcon offsetY={50} scale={65} />,
  "bleed-bottom": <DeviceIcon offsetY={70} scale={70} />,
  "bleed-top": <DeviceIcon offsetY={30} scale={70} />,
  "float-center": <DeviceIcon offsetY={50} scale={55} />,
  "tilt-left": <DeviceIcon rotation={-15} offsetY={50} scale={60} />,
  "tilt-right": <DeviceIcon rotation={15} offsetY={50} scale={60} />,
  perspective: <DeviceIcon is3D rotateY={-20} offsetY={50} scale={60} />,
  "float-bottom": <DeviceIcon offsetY={65} scale={50} />,
};

const PRESETS: Preset[] = LAYOUT_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  icon: PRESET_ICONS[preset.id],
  settings: presetDeviceSettings(preset),
}));
```
Leave `interface Preset`, `DeviceIcon`, `getActivePreset`, and the JSX unchanged.

- [ ] **Step 6: Verify nothing else broke**

Run: `bunx vitest run src/lib/layout-presets.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/layout-presets.ts src/lib/layout-presets.test.ts src/components/RightSidebar/PositionPresets.tsx
git commit -m "Extract layout presets into shared lib with text positions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

### Task 2: Issues + Zod manifest schema

**Files:**
- Modify: `package.json` (add `zod`)
- Create: `src/lib/agent-import/issues.ts`, `src/lib/agent-import/schema.ts`
- Test: `src/lib/agent-import/issues.test.ts`, `src/lib/agent-import/schema.test.ts`

**Interfaces:**
- Consumes: `LAYOUT_PRESET_IDS` (Task 1), `VIBES` from `src/lib/brand-guide.ts`, `gradientPresets` from `src/constants.ts`, `Project` type.
- Produces (`issues.ts`):
  - `interface ImportIssue { path: string; message: string }` (`path` is `""` for bundle-level issues)
  - `class ImportError extends Error { readonly issues: ImportIssue[] }`
  - `formatIssue(issue: ImportIssue): string` → `"path: message"` or `"message"`
  - `formatIssuePath(path: ReadonlyArray<PropertyKey>): string` → e.g. `"screens[2].device.color"`
  - `STORAGE_BUDGET_CHARS = 4_500_000`
  - `checkStorageBudget(existingChars: number, project: Project, budget?: number): ImportIssue | null`
- Produces (`schema.ts`):
  - `IMPORT_FORMAT = "appshots-import"`, `IMPORT_VERSION = 1`
  - `importManifestSchema` (Zod), `type ImportManifest`, `type ManifestScreen`, `type ManifestBackground`, `type ManifestShadow`, `type ManifestDeviceEntry`
  - `parseManifest(text: string): ParseResult` where `type ParseResult = { ok: true; manifest: ImportManifest } | { ok: false; errors: ImportIssue[] }`
  - `buildJsonSchema(): Record<string, unknown>`

- [ ] **Step 1: Add the dependency**

Run: `bun add zod@^4.6.5`
Expected: `package.json` `dependencies` gains `"zod": "^4.6.5"`; `bun.lock` updated.

- [ ] **Step 2: Write the failing issues test**

Create `src/lib/agent-import/issues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  ImportError,
  checkStorageBudget,
  formatIssue,
  formatIssuePath,
} from "./issues";

const tinyProject = { id: "p", screenshots: [] } as unknown as Project;

describe("issues", () => {
  it("formats zod-style paths with array indexes", () => {
    expect(formatIssuePath(["screens", 2, "device", "color"])).toBe(
      "screens[2].device.color",
    );
    expect(formatIssuePath([])).toBe("");
  });

  it("formats issues with and without a path", () => {
    expect(formatIssue({ path: "brand.primary", message: "bad" })).toBe(
      "brand.primary: bad",
    );
    expect(formatIssue({ path: "", message: "no manifest" })).toBe("no manifest");
  });

  it("carries issues on ImportError and joins them into the message", () => {
    const error = new ImportError([
      { path: "a", message: "one" },
      { path: "", message: "two" },
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ImportError");
    expect(error.issues).toHaveLength(2);
    expect(error.message).toBe("a: one\ntwo");
  });

  it("warns only when existing + new data exceeds the budget", () => {
    expect(checkStorageBudget(0, tinyProject)).toBeNull();
    const issue = checkStorageBudget(4_500_000, tinyProject);
    expect(issue?.path).toBe("");
    expect(issue?.message).toMatch(/stop saving/i);
    expect(checkStorageBudget(10, tinyProject, 5)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/issues.test.ts`
Expected: FAIL — cannot resolve `./issues`.

- [ ] **Step 4: Implement `issues.ts`**

Create `src/lib/agent-import/issues.ts`:

```ts
/**
 * Import problems. Blocking problems are thrown as ImportError (or returned as
 * errors); non-blocking ones are returned as warnings. Both are path-addressed
 * so the text can be pasted straight back to the agent that wrote the file.
 */

import type { Project } from "../../types";

export interface ImportIssue {
  /** Manifest location like "screens[2].layout"; "" for bundle-level issues. */
  path: string;
  message: string;
}

export const formatIssue = (issue: ImportIssue): string =>
  issue.path ? `${issue.path}: ${issue.message}` : issue.message;

export class ImportError extends Error {
  readonly issues: ImportIssue[];

  constructor(issues: ImportIssue[]) {
    super(issues.map(formatIssue).join("\n"));
    this.name = "ImportError";
    this.issues = issues;
  }
}

export const formatIssuePath = (path: ReadonlyArray<PropertyKey>): string =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, "");

/** Conservative localStorage budget (most browsers allow ~5M characters). */
export const STORAGE_BUDGET_CHARS = 4_500_000;

const toMb = (chars: number) => (chars / 1_000_000).toFixed(1);

/**
 * Persistence only logs quota failures to the console, so an oversized import
 * would look fine and then silently stop saving. Warn before that happens.
 */
export const checkStorageBudget = (
  existingChars: number,
  project: Project,
  budget: number = STORAGE_BUDGET_CHARS,
): ImportIssue | null => {
  const total = existingChars + JSON.stringify(project).length;
  if (total <= budget) return null;
  return {
    path: "",
    message: `This import brings saved data to about ${toMb(total)} MB, above the ~${toMb(budget)} MB browser storage limit. AppShots may stop saving your work — use fewer or smaller images, or delete unused projects first.`,
  };
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/issues.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing schema test**

Create `src/lib/agent-import/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildJsonSchema, parseManifest } from "./schema";

const minimal = {
  format: "appshots-import",
  version: 1,
  screens: [{ image: "01.png", headline: "Plan your week" }],
};

const full = {
  $schema: "./appshots-import.schema.json",
  format: "appshots-import",
  version: 1,
  name: "Habitly — App Store",
  exportSize: "6.9",
  brand: {
    primary: "#5B5BD6",
    style: "bold",
    font: "Poppins",
    textColor: "#FFF",
    highlightColor: "#FFD60A",
    headlineSize: 72,
    subheadlineSize: 42,
    background: { type: "gradient", from: "#5B5BD6", to: "#3A3AA0" },
  },
  device: { id: "iphone-17-pro", color: "cosmic-orange", style: "flat", shadow: true },
  screens: [
    {
      image: "01-home.png",
      headline: "Build habits <mark>that stick</mark>",
      subheadline: "Tiny daily wins",
      layout: "bleed-bottom",
    },
    {
      image: "02-stats.png",
      headline: "See your streaks",
      layout: "tilt-right",
      background: { type: "solid", color: "#111827" },
      text: {
        color: "#F9FAFB",
        font: "Inter",
        headlineSize: 68,
        subheadlineSize: 40,
        headline: { x: 50, y: 8, width: 70 },
        subheadline: { x: 50, y: 16, width: 70 },
      },
      device: { scale: 64, rotation: 12, rotateX: 5, rotateY: -20, shadow: { blur: 30 } },
      overlays: [{ image: "badge.png", x: 80, y: 12, width: 20, layer: "front", rotation: 0, shadow: false }],
    },
    {
      headline: "Two views",
      background: { type: "preset", id: "ocean" },
      devices: [
        { image: "03a.png", x: 32, y: 38, scale: 55, rotation: -8 },
        { id: "iphone-17", x: 68, y: 42, scale: 55, rotation: 8 },
      ],
    },
  ],
};

const withScreen = (screen: Record<string, unknown>) =>
  JSON.stringify({ ...minimal, screens: [screen] });

const errorsOf = (text: string) => {
  const result = parseManifest(text);
  if (result.ok) throw new Error("expected failure");
  return result.errors;
};

describe("parseManifest", () => {
  it("accepts a minimal manifest", () => {
    const result = parseManifest(JSON.stringify(minimal));
    expect(result.ok).toBe(true);
  });

  it("accepts a manifest using every field", () => {
    const result = parseManifest(JSON.stringify(full));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.manifest.screens).toHaveLength(3);
  });

  it("reports invalid JSON", () => {
    expect(errorsOf("{ nope")).toEqual([
      { path: "appshots.json", message: "file is not valid JSON" },
    ]);
  });

  it("rejects the wrong format and version", () => {
    const paths = errorsOf(
      JSON.stringify({ ...minimal, format: "other", version: 2 }),
    ).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["format", "version"]));
  });

  it("rejects an unknown layout with its path", () => {
    const [error] = errorsOf(withScreen({ image: "a.png", headline: "H", layout: "diagonal" }));
    expect(error.path).toBe("screens[0].layout");
  });

  it("rejects a non-hex color", () => {
    const [error] = errorsOf(JSON.stringify({ ...minimal, brand: { primary: "blue" } }));
    expect(error.path).toBe("brand.primary");
    expect(error.message).toMatch(/hex/);
  });

  it("requires exactly one of image or devices", () => {
    const [both] = errorsOf(
      withScreen({ image: "a.png", devices: [{ image: "b.png" }], headline: "H" }),
    );
    expect(both.path).toBe("screens[0].image");
    expect(both.message).toMatch(/either image or devices/);

    const [neither] = errorsOf(withScreen({ headline: "H" }));
    expect(neither.message).toMatch(/needs an image or a devices list/);
  });

  it("rejects unknown keys so typos surface", () => {
    const [error] = errorsOf(withScreen({ image: "a.png", headlines: "H", headline: "H" }));
    expect(error.path).toBe("screens[0]");
    expect(error.message).toContain("headlines");
  });

  it("rejects out-of-range numbers", () => {
    const [error] = errorsOf(
      withScreen({ image: "a.png", headline: "H", device: { scale: 500 } }),
    );
    expect(error.path).toBe("screens[0].device.scale");
  });

  it("requires at least one screen", () => {
    const [error] = errorsOf(JSON.stringify({ ...minimal, screens: [] }));
    expect(error.path).toBe("screens");
  });
});

describe("buildJsonSchema", () => {
  it("produces an object schema that names the live enums", () => {
    const schema = buildJsonSchema();
    expect(schema.type).toBe("object");
    const text = JSON.stringify(schema);
    expect(text).toContain("appshots-import");
    expect(text).toContain("tilt-left");
    expect(text).toContain("editorial");
    expect(text).toContain("ocean");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 8: Implement `schema.ts`**

Create `src/lib/agent-import/schema.ts`:

```ts
/**
 * The agent import manifest (`appshots.json`), defined once in Zod. Types,
 * validation (with issue paths), and the published JSON Schema all derive from
 * this file. Enum-like fields that have a closed, stable list (layout, style,
 * gradient preset) are enums; device / color / font / export size are plain
 * strings resolved in compile so unknown values become fallback warnings.
 *
 * Keep this schema free of `.transform()` — `z.toJSONSchema` cannot represent
 * transforms. Normalization (hex casing, defaults) happens in compile.
 */

import { z } from "zod";
import { gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { LAYOUT_PRESET_IDS } from "../layout-presets";
import { formatIssuePath, type ImportIssue } from "./issues";

export const IMPORT_FORMAT = "appshots-import";
export const IMPORT_VERSION = 1;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hex = () =>
  z.string().regex(HEX_COLOR, "expected a hex color like #5B5BD6");

const stringEnum = (values: readonly string[]) =>
  z.enum(values as [string, ...string[]]);

const range = (min: number, max: number) => z.number().min(min).max(max);

const backgroundSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("solid"), color: hex() }),
  z.strictObject({ type: z.literal("gradient"), from: hex(), to: hex() }),
  z.strictObject({
    type: z.literal("preset"),
    id: stringEnum(gradientPresets.map((p) => p.id)),
  }),
]);

const shadowSchema = z.union([
  z.boolean(),
  z.strictObject({
    enabled: z.boolean().optional(),
    color: hex().optional(),
    blur: range(0, 100).optional(),
    offsetX: range(-50, 50).optional(),
    offsetY: range(-50, 50).optional(),
  }),
]);

const deviceIdentityFields = {
  id: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  style: z.enum(["flat", "3d"]).optional(),
  shadow: shadowSchema.optional(),
};

const devicePlacementFields = {
  x: range(-100, 200).optional(),
  y: range(-50, 150).optional(),
  scale: range(10, 150).optional(),
  rotation: range(-360, 360).optional(),
  rotateX: range(-30, 30).optional(),
  rotateY: range(-45, 45).optional(),
};

const projectDeviceSchema = z.strictObject(deviceIdentityFields);

const screenDeviceSchema = z.strictObject({
  ...deviceIdentityFields,
  ...devicePlacementFields,
});

const deviceEntrySchema = z.strictObject({
  image: z.string().min(1).optional(),
  ...deviceIdentityFields,
  ...devicePlacementFields,
});

const textBoxSchema = z.strictObject({
  x: range(0, 100).optional(),
  y: range(0, 100).optional(),
  width: range(20, 120).optional(),
});

const screenTextSchema = z.strictObject({
  color: hex().optional(),
  font: z.string().min(1).optional(),
  headlineSize: range(12, 200).optional(),
  subheadlineSize: range(12, 200).optional(),
  headline: textBoxSchema.optional(),
  subheadline: textBoxSchema.optional(),
});

const overlaySchema = z.strictObject({
  image: z.string().min(1),
  x: range(-50, 150).optional(),
  y: range(-50, 150).optional(),
  width: range(1, 100).optional(),
  layer: z.enum(["behind", "front"]).optional(),
  rotation: range(-360, 360).optional(),
  shadow: shadowSchema.optional(),
});

const screenSchema = z
  .strictObject({
    image: z.string().min(1).optional(),
    devices: z.array(deviceEntrySchema).min(1).optional(),
    headline: z.string().min(1),
    subheadline: z.string().optional(),
    layout: stringEnum(LAYOUT_PRESET_IDS).optional(),
    background: backgroundSchema.optional(),
    text: screenTextSchema.optional(),
    device: screenDeviceSchema.optional(),
    overlays: z.array(overlaySchema).optional(),
  })
  .superRefine((screen, ctx) => {
    const hasImage = screen.image !== undefined;
    const hasDevices = screen.devices !== undefined;
    if (hasImage === hasDevices) {
      ctx.addIssue({
        code: "custom",
        path: ["image"],
        message: hasImage
          ? "use either image or devices, not both"
          : "a screen needs an image or a devices list",
      });
    }
  });

const brandSchema = z.strictObject({
  primary: hex().optional(),
  style: stringEnum(VIBES.map((v) => v.id)).optional(),
  font: z.string().min(1).optional(),
  textColor: hex().optional(),
  highlightColor: hex().optional(),
  headlineSize: range(12, 200).optional(),
  subheadlineSize: range(12, 200).optional(),
  background: backgroundSchema.optional(),
});

export const importManifestSchema = z.strictObject({
  $schema: z.string().optional(),
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(IMPORT_VERSION),
  name: z.string().min(1).max(100).optional(),
  exportSize: z.string().min(1).optional(),
  brand: brandSchema.optional(),
  device: projectDeviceSchema.optional(),
  screens: z.array(screenSchema).min(1),
});

export type ImportManifest = z.infer<typeof importManifestSchema>;
export type ManifestScreen = ImportManifest["screens"][number];
export type ManifestBackground = z.infer<typeof backgroundSchema>;
export type ManifestShadow = z.infer<typeof shadowSchema>;
export type ManifestDeviceEntry = z.infer<typeof deviceEntrySchema>;

export type ParseResult =
  | { ok: true; manifest: ImportManifest }
  | { ok: false; errors: ImportIssue[] };

export const parseManifest = (text: string): ParseResult => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ path: "appshots.json", message: "file is not valid JSON" }],
    };
  }

  const result = importManifestSchema.safeParse(data);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
    })),
  };
};

export const buildJsonSchema = (): Record<string, unknown> => ({
  ...(z.toJSONSchema(importManifestSchema) as Record<string, unknown>),
  title: "AppShots agent import manifest (appshots.json)",
});
```

- [ ] **Step 9: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/schema.test.ts src/lib/agent-import/issues.test.ts`
Expected: PASS (15 tests). If the unknown-key test fails on `path`, print `errorsOf(...)` and adjust **only the assertion** to Zod's actual unrecognized-keys path (the object containing the key) — do not loosen `strictObject`.

- [ ] **Step 10: Type-check and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```bash
git add package.json bun.lock src/lib/agent-import/issues.ts src/lib/agent-import/issues.test.ts src/lib/agent-import/schema.ts src/lib/agent-import/schema.test.ts
git commit -m "Add agent import manifest schema and import issues

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 3: Rich-text sanitizer

**Files:**
- Create: `src/lib/agent-import/sanitize.ts`
- Test: `src/lib/agent-import/sanitize.test.ts`

**Interfaces:**
- Consumes: DOM `DOMParser` (jsdom in tests).
- Produces:
  - `interface SanitizeResult { html: string; stripped: boolean }`
  - `sanitizeRichText(input: string): SanitizeResult` — newlines → `<br>`; allowlist enforced; `stripped` true when anything was removed
  - `applyHighlightColor(html: string, color: string): string` — gives every `<mark>` lacking a `background-color` an explicit one

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent-import/sanitize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyHighlightColor, sanitizeRichText } from "./sanitize";

const firstElement = (html: string, selector: string) =>
  new DOMParser()
    .parseFromString(html, "text/html")
    .body.querySelector<HTMLElement>(selector);

describe("sanitizeRichText", () => {
  it("keeps allowed formatting untouched", () => {
    const input = "Plan <b>fast</b> <i>and</i> <u>well</u> <strong>now</strong><em>!</em> <mark>go</mark>";
    expect(sanitizeRichText(input)).toEqual({ html: input, stripped: false });
  });

  it("keeps color styles on spans", () => {
    const { html, stripped } = sanitizeRichText('<span style="color: #ff0000">red</span>');
    expect(stripped).toBe(false);
    expect(firstElement(html, "span")?.style.color).toBe("rgb(255, 0, 0)");
  });

  it("turns newlines into line breaks", () => {
    expect(sanitizeRichText("Line one\nLine two").html).toBe("Line one<br>Line two");
  });

  it("escapes plain text", () => {
    expect(sanitizeRichText("5 < 6 & 7")).toEqual({
      html: "5 &lt; 6 &amp; 7",
      stripped: false,
    });
  });

  it("removes scripts with their content", () => {
    expect(sanitizeRichText("Hi<script>alert(1)</script>")).toEqual({
      html: "Hi",
      stripped: true,
    });
  });

  it("removes images and event handlers", () => {
    expect(sanitizeRichText("<img src=x onerror=alert(1)>Hi")).toEqual({
      html: "Hi",
      stripped: true,
    });
  });

  it("unwraps disallowed elements but keeps their text", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">tap</a>')).toEqual({
      html: "tap",
      stripped: true,
    });
  });

  it("drops non-style attributes from allowed tags", () => {
    expect(sanitizeRichText('<b onclick="x()" class="y">bold</b>')).toEqual({
      html: "<b>bold</b>",
      stripped: true,
    });
  });

  it("drops unsafe style declarations", () => {
    const { html, stripped } = sanitizeRichText(
      '<span style="background:url(https://evil.example/x.png)">x</span>',
    );
    expect(html).not.toContain("url");
    expect(stripped).toBe(true);
  });

  it("only keeps background-color on mark", () => {
    const { html, stripped } = sanitizeRichText(
      '<mark style="color: red; background-color: #00ff00">x</mark>',
    );
    const mark = firstElement(html, "mark");
    expect(mark?.style.color).toBe("");
    expect(mark?.style.backgroundColor).toBe("rgb(0, 255, 0)");
    expect(stripped).toBe(true);
  });
});

describe("applyHighlightColor", () => {
  it("colors unstyled marks", () => {
    const html = applyHighlightColor("Build <mark>habits</mark>", "#ffd60a");
    expect(firstElement(html, "mark")?.style.backgroundColor).toBe("rgb(255, 214, 10)");
  });

  it("keeps a mark's explicit color", () => {
    const html = applyHighlightColor(
      '<mark style="background-color: #00ff00">x</mark>',
      "#ffd60a",
    );
    expect(firstElement(html, "mark")?.style.backgroundColor).toBe("rgb(0, 255, 0)");
  });

  it("returns html without marks unchanged", () => {
    expect(applyHighlightColor("Plain <b>text</b>", "#ffd60a")).toBe("Plain <b>text</b>");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/sanitize.test.ts`
Expected: FAIL — cannot resolve `./sanitize`.

- [ ] **Step 3: Implement `sanitize.ts`**

Create `src/lib/agent-import/sanitize.ts`:

```ts
/**
 * Headline/subheadline HTML from an imported manifest is untrusted and is later
 * rendered with dangerouslySetInnerHTML. Rebuild it from scratch, keeping only
 * the tags and styles `rich-text-canvas.ts` understands, so the preview and the
 * export agree and nothing executable survives.
 */

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "mark", "br", "span"]);

/** Elements removed together with everything inside them. */
const REMOVE_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "template",
  "noscript", "svg", "math", "img", "video", "audio", "input", "textarea", "select", "button",
]);

const CSS_WIDE_KEYWORDS = new Set(["", "initial", "inherit", "unset", "revert", "revert-layer"]);

const usableColor = (value: string): string | null =>
  CSS_WIDE_KEYWORDS.has(value.trim().toLowerCase()) ? null : value;

export interface SanitizeResult {
  html: string;
  stripped: boolean;
}

export const sanitizeRichText = (input: string): SanitizeResult => {
  const doc = new DOMParser().parseFromString(
    input.replace(/\r?\n/g, "<br>"),
    "text/html",
  );
  const output = doc.createElement("div");
  let stripped = doc.head.childNodes.length > 0;

  const copyChildren = (from: Node, to: Node) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(doc.createTextNode(child.textContent ?? ""));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        stripped = true; // comments, processing instructions
        continue;
      }

      const element = child as HTMLElement;
      const tag = element.tagName.toLowerCase();

      if (REMOVE_WITH_CONTENT.has(tag)) {
        stripped = true;
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        stripped = true;
        copyChildren(element, to);
        continue;
      }

      const clean = doc.createElement(tag);
      let keptStyles = 0;
      const color = tag === "span" ? usableColor(element.style.color) : null;
      const background =
        tag === "span" || tag === "mark"
          ? usableColor(element.style.backgroundColor)
          : null;
      if (color) {
        clean.style.color = color;
        keptStyles += 1;
      }
      if (background) {
        clean.style.backgroundColor = background;
        keptStyles += 1;
      }

      const styleAttributeCount = element.hasAttribute("style") ? 1 : 0;
      if (
        element.attributes.length > styleAttributeCount ||
        element.style.length > keptStyles
      ) {
        stripped = true;
      }

      if (tag !== "br") copyChildren(element, clean);
      to.appendChild(clean);
    }
  };

  copyChildren(doc.body, output);
  return { html: output.innerHTML, stripped };
};

export const applyHighlightColor = (html: string, color: string): string => {
  if (!/<mark[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const mark of Array.from(doc.body.querySelectorAll<HTMLElement>("mark"))) {
    if (!mark.style.backgroundColor) mark.style.backgroundColor = color;
  }
  return doc.body.innerHTML;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/sanitize.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-import/sanitize.ts src/lib/agent-import/sanitize.test.ts
git commit -m "Add allowlist sanitizer for imported rich text

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 4: Value resolvers (fallbacks, backgrounds, shadows, highlight)

**Files:**
- Modify: `src/lib/brand-guide.ts:96-107,119` (export the readable-text picker)
- Create: `src/lib/agent-import/resolve.ts`
- Test: `src/lib/agent-import/resolve.test.ts`

**Interfaces:**
- Consumes: `devices`, `exportSizes`, `gradientPresets` (`src/constants.ts`); `googleFonts` (`src/lib/google-fonts.ts`); `isAndroidDevice`, `isAndroidTablet` (`src/lib/device-platform.ts`); `DEFAULT_DEVICE_SHADOW` (`src/lib/device-instances.ts`); `adjustLightness` (`src/lib/color-utils.ts`); `contrastRatio` (`src/lib/design-guidance.ts`); `resolveGradientStops`, `BackgroundSettings` (`src/lib/background-settings.ts`); `ImportIssue` (Task 2); `ManifestBackground`, `ManifestShadow` (Task 2).
- Produces:
  - `brand-guide.ts`: `export const pickReadableTextColor(bg: BackgroundSettings): string` (renamed from private `pickTextColor`; `generateBrandLook` uses it)
  - `interface Resolved<T> { value: T; warning: ImportIssue | null }`
  - `normalizeHex(hex: string): string` → lowercase `#rrggbb`
  - `toBackgroundSettings(bg: ManifestBackground): BackgroundSettings`
  - `backgroundStopsOf(bg: BackgroundSettings): string[]`
  - `type DeviceFamily = "apple-phone" | "apple-tablet" | "android-phone" | "android-tablet"`
  - `deviceFamily(deviceId: string): DeviceFamily`; `exportSizeFamily(exportSizeId: string): DeviceFamily | null`
  - `resolveDevice(requestedId: string | undefined, path: string): Resolved<DeviceSpec>`
  - `resolveDeviceColor(spec: DeviceSpec, requested: string | undefined, path: string): Resolved<string>`
  - `resolveFont(requested: string, path: string): Resolved<string>`
  - `resolveExportSize(requested: string | undefined, deviceId: string, path: string): Resolved<ExportSize>`
  - `checkPlatformMismatch(deviceId: string, exportSizeId: string): ImportIssue | null`
  - `DEFAULT_OVERLAY_SHADOW: ShadowConfig`
  - `resolveShadow(shadow: ManifestShadow | undefined, base: ShadowConfig): ShadowConfig`
  - `deriveHighlightColor(primary: string | undefined, textColor: string, backgroundStops: string[]): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent-import/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { devices } from "../../constants";
import { pickReadableTextColor } from "../brand-guide";
import { contrastRatio } from "../design-guidance";
import { DEFAULT_DEVICE_SHADOW } from "../device-instances";
import {
  DEFAULT_OVERLAY_SHADOW,
  backgroundStopsOf,
  checkPlatformMismatch,
  deriveHighlightColor,
  deviceFamily,
  exportSizeFamily,
  normalizeHex,
  resolveDevice,
  resolveDeviceColor,
  resolveExportSize,
  resolveFont,
  resolveShadow,
  toBackgroundSettings,
} from "./resolve";

describe("normalizeHex", () => {
  it("lowercases and expands short hex", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#5B5BD6")).toBe("#5b5bd6");
  });
});

describe("backgrounds", () => {
  it("converts solid, gradient and preset backgrounds", () => {
    expect(toBackgroundSettings({ type: "solid", color: "#ABC" })).toEqual({
      backgroundMode: "solid",
      backgroundColor: "#aabbcc",
      gradientPresetId: null,
    });
    expect(toBackgroundSettings({ type: "gradient", from: "#111111", to: "#222222" })).toEqual({
      backgroundMode: "gradient",
      backgroundColor: "#111111",
      gradientPresetId: null,
      gradientFrom: "#111111",
      gradientTo: "#222222",
    });
    expect(toBackgroundSettings({ type: "preset", id: "ocean" })).toEqual({
      backgroundMode: "gradient",
      backgroundColor: "#2b5876",
      gradientPresetId: "ocean",
    });
  });

  it("lists the stops text sits on", () => {
    expect(backgroundStopsOf(toBackgroundSettings({ type: "solid", color: "#123456" }))).toEqual(["#123456"]);
    expect(
      backgroundStopsOf(toBackgroundSettings({ type: "gradient", from: "#111111", to: "#222222" })),
    ).toEqual(["#111111", "#222222"]);
  });

  it("exposes the brand guide's readable text picker", () => {
    const text = pickReadableTextColor(toBackgroundSettings({ type: "solid", color: "#ffffff" }));
    expect(contrastRatio(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("families", () => {
  it("classifies devices and export sizes", () => {
    expect(deviceFamily("iphone-17-pro")).toBe("apple-phone");
    expect(deviceFamily("ipad-pro-13-m4")).toBe("apple-tablet");
    expect(deviceFamily("pixel-10")).toBe("android-phone");
    expect(deviceFamily("samsung-galaxy-tab-s9")).toBe("android-tablet");
    expect(exportSizeFamily("6.9")).toBe("apple-phone");
    expect(exportSizeFamily("ipad-13")).toBe("apple-tablet");
    expect(exportSizeFamily("play-phone-20-9")).toBe("android-phone");
    expect(exportSizeFamily("play-tablet-10")).toBe("android-tablet");
    expect(exportSizeFamily("play-feature-graphic")).toBeNull();
  });

  it("flags a device that doesn't match the export size", () => {
    expect(checkPlatformMismatch("iphone-17-pro", "ipad-13")?.path).toBe("exportSize");
    expect(checkPlatformMismatch("iphone-17-pro", "6.9")).toBeNull();
    expect(checkPlatformMismatch("pixel-10", "play-phone-20-9")).toBeNull();
    expect(checkPlatformMismatch("pixel-10", "play-feature-graphic")).toBeNull();
  });
});

describe("resolveDevice", () => {
  it("uses the first device when none is requested", () => {
    expect(resolveDevice(undefined, "device.id")).toEqual({ value: devices[0], warning: null });
  });

  it("returns an exact match without warning", () => {
    const result = resolveDevice("pixel-10", "device.id");
    expect(result.value.id).toBe("pixel-10");
    expect(result.warning).toBeNull();
  });

  it("falls back within the same family and says so", () => {
    const firstAndroidPhone = devices.find((d) => deviceFamily(d.id) === "android-phone");
    const result = resolveDevice("pixel-99", "device.id");
    expect(result.value.id).toBe(firstAndroidPhone?.id);
    expect(result.warning).toEqual({
      path: "device.id",
      message: `unknown device "pixel-99"; using "${firstAndroidPhone?.id}"`,
    });
    expect(resolveDevice("ipad-mini-9", "device.id").value.id).toBe(
      devices.find((d) => deviceFamily(d.id) === "apple-tablet")?.id,
    );
  });

  it("falls back to the device's first color", () => {
    const spec = resolveDevice("iphone-17-pro", "device.id").value;
    expect(resolveDeviceColor(spec, "cosmic-orange", "device.color")).toEqual({
      value: "cosmic-orange",
      warning: null,
    });
    expect(resolveDeviceColor(spec, undefined, "device.color").value).toBe(spec.colors[0].id);
    const unknown = resolveDeviceColor(spec, "neon", "device.color");
    expect(unknown.value).toBe(spec.colors[0].id);
    expect(unknown.warning?.path).toBe("device.color");
  });
});

describe("resolveFont and resolveExportSize", () => {
  it("matches fonts exactly or case-insensitively, else Inter", () => {
    expect(resolveFont("Poppins", "brand.font")).toEqual({ value: "Poppins", warning: null });
    expect(resolveFont("playfair display", "brand.font")).toEqual({
      value: "Playfair Display",
      warning: null,
    });
    const unknown = resolveFont("Comic Sans", "brand.font");
    expect(unknown.value).toBe("Inter");
    expect(unknown.warning?.message).toMatch(/Comic Sans/);
  });

  it("defaults the export size to the device's family", () => {
    expect(resolveExportSize(undefined, "iphone-17-pro", "exportSize").value.id).toBe("6.9");
    expect(resolveExportSize(undefined, "ipad-pro-13-m4", "exportSize").value.id).toBe("ipad-13");
    expect(resolveExportSize(undefined, "pixel-10", "exportSize").value.id).toBe("play-phone-20-9");
    expect(resolveExportSize(undefined, "samsung-galaxy-tab-s9", "exportSize").value.id).toBe("play-tablet-10");
  });

  it("warns on unknown export sizes", () => {
    const result = resolveExportSize("7.7", "iphone-17-pro", "exportSize");
    expect(result.value.id).toBe("6.9");
    expect(result.warning?.path).toBe("exportSize");
  });
});

describe("resolveShadow", () => {
  it("handles undefined, booleans and patches", () => {
    expect(resolveShadow(undefined, DEFAULT_DEVICE_SHADOW)).toEqual(DEFAULT_DEVICE_SHADOW);
    expect(resolveShadow(false, DEFAULT_DEVICE_SHADOW).enabled).toBe(false);
    expect(resolveShadow(true, DEFAULT_OVERLAY_SHADOW)).toEqual({ ...DEFAULT_OVERLAY_SHADOW, enabled: true });
    expect(resolveShadow({ blur: 30, color: "#FFF" }, DEFAULT_OVERLAY_SHADOW)).toEqual({
      ...DEFAULT_OVERLAY_SHADOW,
      enabled: true,
      blur: 30,
      color: "#ffffff",
    });
  });
});

describe("deriveHighlightColor", () => {
  it("stays readable behind white text on a brand gradient", () => {
    const color = deriveHighlightColor("#5b5bd6", "#ffffff", ["#5b5bd6", "#2a2a9e"]);
    expect(contrastRatio("#ffffff", color)).toBeGreaterThanOrEqual(3);
  });

  it("works without a brand color", () => {
    const color = deriveHighlightColor(undefined, "#111111", ["#ffffff"]);
    expect(contrastRatio("#111111", color)).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Export the readable-text picker from `brand-guide.ts`**

In `src/lib/brand-guide.ts`, replace:

```ts
/** Pick the readable candidate with the best worst-case contrast across stops. */
const pickTextColor = (bg: BackgroundSettings): string => {
```

with:

```ts
/** Pick the readable candidate with the best worst-case contrast across stops. */
export const pickReadableTextColor = (bg: BackgroundSettings): string => {
```

and in `generateBrandLook`, replace `textColor: pickTextColor(background),` with `textColor: pickReadableTextColor(background),`.

- [ ] **Step 4: Implement `resolve.ts`**

Create `src/lib/agent-import/resolve.ts`:

```ts
/**
 * Resolvers turn loosely-specified manifest values into concrete editor values.
 * Unknown ids never fail an import: they fall back to a sensible neighbor and
 * return a warning naming what was used.
 */

import { devices, exportSizes, gradientPresets } from "../../constants";
import type { DeviceSpec, ExportSize, ShadowConfig } from "../../types";
import {
  resolveGradientStops,
  type BackgroundSettings,
} from "../background-settings";
import { adjustLightness } from "../color-utils";
import { contrastRatio } from "../design-guidance";
import { isAndroidDevice, isAndroidTablet } from "../device-platform";
import { googleFonts } from "../google-fonts";
import type { ImportIssue } from "./issues";
import type { ManifestBackground, ManifestShadow } from "./schema";

export interface Resolved<T> {
  value: T;
  warning: ImportIssue | null;
}

export const normalizeHex = (hex: string): string => {
  const digits = hex.replace("#", "").toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  return `#${full}`;
};

export const toBackgroundSettings = (
  bg: ManifestBackground,
): BackgroundSettings => {
  switch (bg.type) {
    case "solid":
      return {
        backgroundMode: "solid",
        backgroundColor: normalizeHex(bg.color),
        gradientPresetId: null,
      };
    case "gradient": {
      const from = normalizeHex(bg.from);
      return {
        backgroundMode: "gradient",
        backgroundColor: from,
        gradientPresetId: null,
        gradientFrom: from,
        gradientTo: normalizeHex(bg.to),
      };
    }
    case "preset": {
      const preset =
        gradientPresets.find((p) => p.id === bg.id) ?? gradientPresets[0];
      return {
        backgroundMode: "gradient",
        backgroundColor: preset.from,
        gradientPresetId: preset.id,
      };
    }
  }
};

export const backgroundStopsOf = (bg: BackgroundSettings): string[] => {
  const stops = resolveGradientStops(bg);
  return stops ? [stops.from, stops.to] : [bg.backgroundColor];
};

export type DeviceFamily =
  | "apple-phone"
  | "apple-tablet"
  | "android-phone"
  | "android-tablet";

export const deviceFamily = (deviceId: string): DeviceFamily => {
  if (isAndroidTablet(deviceId)) return "android-tablet";
  if (isAndroidDevice(deviceId)) return "android-phone";
  if (deviceId.startsWith("ipad")) return "apple-tablet";
  return "apple-phone";
};

export const exportSizeFamily = (exportSizeId: string): DeviceFamily | null => {
  if (exportSizeId === "play-feature-graphic") return null;
  if (exportSizeId.startsWith("play-tablet")) return "android-tablet";
  if (exportSizeId.startsWith("play-")) return "android-phone";
  if (exportSizeId.startsWith("ipad")) return "apple-tablet";
  return "apple-phone";
};

const DEFAULT_EXPORT_SIZE_BY_FAMILY: Record<DeviceFamily, string> = {
  "apple-phone": "6.9",
  "apple-tablet": "ipad-13",
  "android-phone": "play-phone-20-9",
  "android-tablet": "play-tablet-10",
};

export const resolveDevice = (
  requestedId: string | undefined,
  path: string,
): Resolved<DeviceSpec> => {
  if (requestedId === undefined) return { value: devices[0], warning: null };
  const exact = devices.find((d) => d.id === requestedId);
  if (exact) return { value: exact, warning: null };
  const family = deviceFamily(requestedId);
  const fallback = devices.find((d) => deviceFamily(d.id) === family) ?? devices[0];
  return {
    value: fallback,
    warning: {
      path,
      message: `unknown device "${requestedId}"; using "${fallback.id}"`,
    },
  };
};

export const resolveDeviceColor = (
  spec: DeviceSpec,
  requested: string | undefined,
  path: string,
): Resolved<string> => {
  const first = spec.colors[0].id;
  if (requested === undefined) return { value: first, warning: null };
  if (spec.colors.some((c) => c.id === requested)) {
    return { value: requested, warning: null };
  }
  return {
    value: first,
    warning: {
      path,
      message: `"${spec.id}" has no color "${requested}"; using "${first}"`,
    },
  };
};

export const resolveFont = (requested: string, path: string): Resolved<string> => {
  const match = googleFonts.find(
    (f) => f.family.toLowerCase() === requested.trim().toLowerCase(),
  );
  if (match) return { value: match.family, warning: null };
  return {
    value: "Inter",
    warning: { path, message: `font "${requested}" is not available; using "Inter"` },
  };
};

export const resolveExportSize = (
  requested: string | undefined,
  deviceId: string,
  path: string,
): Resolved<ExportSize> => {
  const byId = (id: string) => exportSizes.find((s) => s.id === id);
  const fallback = byId(DEFAULT_EXPORT_SIZE_BY_FAMILY[deviceFamily(deviceId)]) ?? exportSizes[0];
  if (requested === undefined) return { value: fallback, warning: null };
  const exact = byId(requested);
  if (exact) return { value: exact, warning: null };
  return {
    value: fallback,
    warning: {
      path,
      message: `unknown export size "${requested}"; using "${fallback.id}"`,
    },
  };
};

export const checkPlatformMismatch = (
  deviceId: string,
  exportSizeId: string,
): ImportIssue | null => {
  const expected = exportSizeFamily(exportSizeId);
  const actual = deviceFamily(deviceId);
  if (expected === null || expected === actual) return null;
  return {
    path: "exportSize",
    message: `export size "${exportSizeId}" is for ${expected} screenshots, but the device "${deviceId}" is ${actual}`,
  };
};

/** Matches the shadow `addOverlayImage` gives editor-added overlays. */
export const DEFAULT_OVERLAY_SHADOW: ShadowConfig = {
  enabled: false,
  color: "#000000",
  blur: 20,
  offsetX: 0,
  offsetY: 10,
};

export const resolveShadow = (
  shadow: ManifestShadow | undefined,
  base: ShadowConfig,
): ShadowConfig => {
  if (shadow === undefined) return { ...base };
  if (typeof shadow === "boolean") return { ...base, enabled: shadow };
  return {
    ...base,
    enabled: true,
    ...shadow,
    color: shadow.color ? normalizeHex(shadow.color) : base.color,
  };
};

const HIGHLIGHT_FALLBACK = "#facc15";

/**
 * A `<mark>` background that the text stays readable on (≥ 3:1, large text) and
 * that is distinguishable from the canvas background (≥ 1.5:1 against every stop).
 * Falls back to the most readable candidate when none satisfies both.
 */
export const deriveHighlightColor = (
  primary: string | undefined,
  textColor: string,
  backgroundStops: string[],
): string => {
  const base = primary ?? HIGHLIGHT_FALLBACK;
  const candidates = [
    base,
    adjustLightness(base, 25),
    adjustLightness(base, -25),
    adjustLightness(base, 45),
    adjustLightness(base, -45),
    HIGHLIGHT_FALLBACK,
  ].map((color) => ({
    color,
    text: contrastRatio(textColor, color),
    canvas: Math.min(...backgroundStops.map((stop) => contrastRatio(color, stop))),
  }));

  const good = candidates.find((c) => c.text >= 3 && c.canvas >= 1.5);
  if (good) return good.color;
  return [...candidates].sort((a, b) => b.text - a.text)[0].color;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/agent-import/resolve.test.ts src/lib/brand-guide.test.ts`
Expected: PASS (resolve: 14 tests; brand-guide unchanged and green).

- [ ] **Step 6: Type-check and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```bash
git add src/lib/brand-guide.ts src/lib/agent-import/resolve.ts src/lib/agent-import/resolve.test.ts
git commit -m "Add agent import value resolvers with fallback warnings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 5: Compile manifest → Project

**Files:**
- Create: `src/lib/agent-import/compile.ts`
- Modify: `src/context/EditorContext.tsx:322` (export `normalizeProject`)
- Test: `src/lib/agent-import/compile.test.ts`

**Interfaces:**
- Consumes: Task 1 (`getLayoutPreset`, `DEFAULT_LAYOUT_PRESET_ID`, `LayoutPreset`), Task 2 (`ImportManifest`, `ManifestScreen`, `ManifestDeviceEntry`, `ImportIssue`, `ImportError`), Task 3 (`sanitizeRichText`, `applyHighlightColor`), Task 4 (all resolvers, `pickReadableTextColor`); `generateBrandLook` (`brand-guide.ts`); `evaluateProjectContrast` (`design-guidance.ts`); `createDeviceInstance`, `DEFAULT_DEVICE_SHADOW` (`device-instances.ts`); `overrideScreenshotBackground`, `pickBackgroundSettings`, `DEFAULT_BACKGROUND_SETTINGS` (`background-settings.ts`); `overrideScreenshotText`, `DEFAULT_TEXT_SETTINGS` (`text-settings.ts`); `addColorToPalette` (`saved-colors.ts`).
- Produces:
  - `interface LoadedImage { dataUrl: string; width: number; height: number }`
  - `imageKey(reference: string): string` — lowercase basename
  - `interface ImageReference { path: string; name: string }`
  - `listImageReferences(manifest: ImportManifest): ImageReference[]`
  - `findMissingImages(manifest: ImportManifest, availableKeys: Set<string>): ImportIssue[]`
  - `interface CompileParams { manifest: ImportManifest; images: Map<string, LoadedImage>; bundleImageNames?: string[]; generateId: () => string; now?: () => number }`
  - `interface CompileResult { project: Project; warnings: ImportIssue[] }`
  - `compileManifest(params: CompileParams): CompileResult` — throws `ImportError` for missing images
  - `EditorContext.tsx`: `export const normalizeProject`

Precedence (spec): app defaults < `generateBrandLook(primary, style ?? "minimal")` < explicit `brand.*` < screen `layout` < explicit per-screen fields. Device `style`: `screen/entry style` > `layout.device.style` > project `device.style` > `"flat"`.

- [ ] **Step 1: Export `normalizeProject`**

In `src/context/EditorContext.tsx`, change

```ts
const normalizeProject = (project: Project & LegacyProjectFields): Project => {
```

to

```ts
export const normalizeProject = (project: Project & LegacyProjectFields): Project => {
```

Run: `bunx tsc --noEmit` → exit 0.

- [ ] **Step 2: Write the failing test**

Create `src/lib/agent-import/compile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeProject } from "../../context/EditorContext";
import { contrastRatio } from "../design-guidance";
import { LAYOUT_PRESETS } from "../layout-presets";
import {
  compileManifest,
  findMissingImages,
  imageKey,
  listImageReferences,
  type LoadedImage,
} from "./compile";
import { ImportError } from "./issues";
import type { ImportManifest } from "./schema";

const loaded = (name: string, width = 1206, height = 2622): [string, LoadedImage] => [
  imageKey(name),
  { dataUrl: `data:image/png;base64,${name}`, width, height },
];

const idGen = () => {
  let n = 0;
  return () => `id${++n}`;
};

const manifestOf = (over: Partial<ImportManifest> = {}): ImportManifest => ({
  format: "appshots-import",
  version: 1,
  screens: [{ image: "01.png", headline: "Plan your week" }],
  ...over,
});

const compile = (
  manifest: ImportManifest,
  images: [string, LoadedImage][] = [loaded("01.png")],
  bundleImageNames?: string[],
) =>
  compileManifest({
    manifest,
    images: new Map(images),
    bundleImageNames,
    generateId: idGen(),
    now: () => 1000,
  });

const markBackground = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body.querySelector<HTMLElement>("mark")
    ?.style.backgroundColor;

describe("image references", () => {
  it("keys images by lowercase basename", () => {
    expect(imageKey("shots/01-Home.PNG")).toBe("01-home.png");
  });

  it("lists every image reference with its path and reports missing ones", () => {
    const manifest = manifestOf({
      screens: [
        { image: "a.png", headline: "H", overlays: [{ image: "badge.png" }] },
        { headline: "H", devices: [{ image: "b.png" }, {}] },
      ],
    });
    expect(listImageReferences(manifest)).toEqual([
      { path: "screens[0].image", name: "a.png" },
      { path: "screens[0].overlays[0].image", name: "badge.png" },
      { path: "screens[1].devices[0].image", name: "b.png" },
    ]);
    expect(findMissingImages(manifest, new Set(["a.png", "b.png"]))).toEqual([
      { path: "screens[0].overlays[0].image", message: 'image "badge.png" is not in the bundle' },
    ]);
  });
});

describe("compileManifest", () => {
  it("builds a complete project from a minimal manifest", () => {
    const { project, warnings } = compile(manifestOf());
    expect(warnings).toEqual([]);
    expect(project.name).toBe("Imported Project");
    expect(project.exportSizeId).toBe("6.9");
    expect(project.screenshots).toHaveLength(1);
    const [shot] = project.screenshots;
    expect(project.activeScreenshotId).toBe(shot.id);
    expect(shot.headline).toBe("Plan your week");
    expect(shot.subheadline).toBe("");
    expect(shot.backgroundOverride).toBe(false);
    expect(shot.textOverrides).toEqual([]);
    expect(shot.devices).toHaveLength(1);
    expect(shot.devices[0].screenshotSrc).toBe("data:image/png;base64,01.png");
    // default layout: bleed-bottom
    expect(shot.devices[0]).toMatchObject({ scale: 70, y: 45, rotation: 0, style: "flat" });
    expect(shot).toMatchObject({ headlineX: 50, headlineY: 10, subheadlineY: 18 });
  });

  it("applies the style preset, then explicit brand fields", () => {
    const { project } = compile(
      manifestOf({ brand: { primary: "#5B5BD6", style: "bold", headlineSize: 80 } }),
    );
    expect(project.textDefaults.fontFamily).toBe("Poppins");
    expect(project.textDefaults.headlineFontSize).toBe(80);
    expect(project.textDefaults.subheadlineFontSize).toBe(42);
    expect(project.backgroundDefaults?.backgroundMode).toBe("gradient");
    expect(project.backgroundDefaults?.gradientFrom).toBe("#5b5bd6");

    const withFont = compile(manifestOf({ brand: { primary: "#5B5BD6", style: "bold", font: "Lora" } }));
    expect(withFont.project.textDefaults.fontFamily).toBe("Lora");
  });

  it("picks a readable text color for an explicit brand background", () => {
    const { project } = compile(
      manifestOf({ brand: { background: { type: "solid", color: "#FAFAFA" } } }),
    );
    expect(project.backgroundDefaults?.backgroundColor).toBe("#fafafa");
    expect(contrastRatio(project.textDefaults.textColor, "#fafafa")).toBeGreaterThanOrEqual(4.5);
    expect(project.screenshots[0].textColor).toBe(project.textDefaults.textColor);
  });

  it("warns when style is given without a primary color", () => {
    const { project, warnings } = compile(manifestOf({ brand: { style: "bold" } }));
    expect(project.textDefaults.fontFamily).toBe("Inter");
    expect(warnings.map((w) => w.path)).toContain("brand.style");
  });

  it("records per-screen overrides so project defaults keep working", () => {
    const { project } = compile(
      manifestOf({
        screens: [
          {
            image: "01.png",
            headline: "H",
            background: { type: "solid", color: "#111827" },
            text: { color: "#F9FAFB", headline: { y: 8, width: 70 } },
          },
        ],
      }),
    );
    const [shot] = project.screenshots;
    expect(shot.backgroundOverride).toBe(true);
    expect(shot.backgroundColor).toBe("#111827");
    expect(shot.textColor).toBe("#f9fafb");
    expect(shot.headlineWidth).toBe(70);
    expect(shot.headlineY).toBe(8);
    expect(shot.textOverrides).toEqual(["textColor", "headlineWidth"]);
  });

  it("applies every layout's device settings and text positions", () => {
    const manifest = manifestOf({
      screens: LAYOUT_PRESETS.map((preset) => ({
        image: "01.png",
        headline: preset.label,
        layout: preset.id,
      })),
    });
    const { project } = compile(manifest);
    LAYOUT_PRESETS.forEach((preset, i) => {
      const shot = project.screenshots[i];
      expect(shot.devices[0]).toMatchObject({
        scale: preset.device.scale,
        y: preset.device.y,
        rotation: preset.device.rotation,
        style: preset.device.style ?? "flat",
      });
      expect(shot.headlineY).toBe(preset.text.headline.y);
      expect(shot.subheadlineY).toBe(preset.text.subheadline.y);
    });
    expect(project.screenshots[6].devices[0]).toMatchObject({ rotateY: -20, rotateX: 5 });
  });

  it("lets explicit device fields beat the layout, and project style fill in", () => {
    const { project } = compile(
      manifestOf({
        device: { style: "3d" },
        screens: [
          { image: "01.png", headline: "A", layout: "tilt-right", device: { scale: 64, rotation: 12 } },
          { image: "01.png", headline: "B", layout: "perspective", device: { style: "flat" } },
        ],
      }),
    );
    expect(project.screenshots[0].devices[0]).toMatchObject({ scale: 64, rotation: 12, style: "3d" });
    expect(project.screenshots[1].devices[0].style).toBe("flat");
  });

  it("colors highlights explicitly", () => {
    const branded = compile(
      manifestOf({
        brand: { highlightColor: "#FFD60A" },
        screens: [{ image: "01.png", headline: "Build <mark>habits</mark>" }],
      }),
    );
    expect(markBackground(branded.project.screenshots[0].headline)).toBe("rgb(255, 214, 10)");

    const derived = compile(
      manifestOf({ screens: [{ image: "01.png", headline: "Build <mark>habits</mark>" }] }),
    );
    expect(markBackground(derived.project.screenshots[0].headline)).toBeTruthy();
  });

  it("falls back on unknown ids with warnings", () => {
    const { project, warnings } = compile(
      manifestOf({
        exportSize: "7.7",
        brand: { font: "Comic Sans" },
        device: { id: "iphone-99", color: "neon" },
      }),
    );
    expect(project.textDefaults.fontFamily).toBe("Inter");
    expect(project.exportSizeId).toBe("6.9");
    expect(warnings.map((w) => w.path)).toEqual(
      expect.arrayContaining(["brand.font", "device.id", "device.color", "exportSize"]),
    );
  });

  it("defaults the export size to the device and flags mismatches", () => {
    expect(compile(manifestOf({ device: { id: "pixel-10" } })).project.exportSizeId).toBe(
      "play-phone-20-9",
    );
    const mismatch = compile(manifestOf({ device: { id: "pixel-10" }, exportSize: "6.9" }));
    expect(mismatch.warnings.map((w) => w.path)).toContain("exportSize");
  });

  it("throws ImportError for missing images", () => {
    expect(() => compile(manifestOf(), [])).toThrow(ImportError);
    try {
      compile(manifestOf(), []);
    } catch (error) {
      expect((error as ImportError).issues[0].path).toBe("screens[0].image");
    }
  });

  it("builds multi-device screens and ignores screen.device alongside them", () => {
    const { project, warnings } = compile(
      manifestOf({
        screens: [
          {
            headline: "Two",
            device: { scale: 99 },
            devices: [
              { image: "a.png", x: 32, scale: 55, rotation: -8 },
              { id: "iphone-17", x: 68, scale: 55, rotation: 8 },
            ],
          },
        ],
      }),
      [loaded("a.png")],
    );
    const [shot] = project.screenshots;
    expect(shot.devices).toHaveLength(2);
    expect(shot.devices[0]).toMatchObject({ x: 32, scale: 55, rotation: -8, screenshotSrc: "data:image/png;base64,a.png" });
    expect(shot.devices[1]).toMatchObject({ x: 68, deviceId: "iphone-17", screenshotSrc: null });
    expect(shot.activeDeviceId).toBe(shot.devices[0].id);
    expect(warnings.map((w) => w.path)).toContain("screens[0].device");
  });

  it("sizes overlays from the image aspect ratio", () => {
    const { project } = compile(
      manifestOf({
        screens: [{ image: "01.png", headline: "H", overlays: [{ image: "badge.png", width: 20, x: 80, y: 12 }] }],
      }),
      [loaded("01.png"), loaded("badge.png", 100, 50)],
    );
    expect(project.screenshots[0].overlayImages[0]).toMatchObject({
      src: "data:image/png;base64,badge.png",
      x: 80,
      y: 12,
      width: 20,
      height: 10,
      layer: "front",
      rotation: 0,
      shadow: { enabled: false },
    });
  });

  it("warns about unused bundle images, stripped HTML, and contrast", () => {
    const { warnings } = compile(
      manifestOf({
        brand: { textColor: "#FFFFFF", background: { type: "solid", color: "#FFFFFF" } },
        screens: [{ image: "01.png", headline: "Hi<script>x</script>" }],
      }),
      [loaded("01.png")],
      ["01.png", "extra.png"],
    );
    const paths = warnings.map((w) => w.path);
    expect(paths).toContain("screens[0].headline");
    expect(warnings.some((w) => w.message.includes("extra.png"))).toBe(true);
    expect(warnings.some((w) => /unsupported HTML/.test(w.message))).toBe(true);
    expect(warnings.some((w) => /contrast/.test(w.message))).toBe(true);
  });

  it("seeds saved colors from the brand, primary first", () => {
    const { project } = compile(
      manifestOf({ brand: { primary: "#5B5BD6", highlightColor: "#FFD60A" } }),
    );
    expect(project.savedColors[0]).toBe("#5b5bd6");
    expect(project.savedColors).toContain("#ffd60a");
  });

  it("produces a project that normalizeProject leaves unchanged", () => {
    const { project } = compile(
      manifestOf({
        brand: { primary: "#5B5BD6", style: "playful" },
        screens: [
          { image: "01.png", headline: "A", layout: "perspective", text: { font: "Lora" } },
          { image: "01.png", headline: "B", background: { type: "preset", id: "ocean" } },
        ],
      }),
    );
    expect(normalizeProject(project)).toEqual(project);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/compile.test.ts`
Expected: FAIL — cannot resolve `./compile`.

- [ ] **Step 4: Implement `compile.ts`**

Create `src/lib/agent-import/compile.ts`:

```ts
/**
 * Compiles a validated manifest plus its decoded images into an ordinary
 * Project, the same shape the editor builds by hand. Pure: ids and time are
 * injected, images arrive already decoded.
 */

import type { DeviceInstance, ImageOverlay, Project, Screenshot } from "../../types";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  overrideScreenshotBackground,
  pickBackgroundSettings,
  type BackgroundSettings,
} from "../background-settings";
import { generateBrandLook, pickReadableTextColor } from "../brand-guide";
import { evaluateProjectContrast } from "../design-guidance";
import { DEFAULT_DEVICE_SHADOW, createDeviceInstance } from "../device-instances";
import {
  DEFAULT_LAYOUT_PRESET_ID,
  getLayoutPreset,
  type LayoutPreset,
} from "../layout-presets";
import { addColorToPalette } from "../saved-colors";
import {
  DEFAULT_TEXT_SETTINGS,
  overrideScreenshotText,
  type TextSettings,
} from "../text-settings";
import { ImportError, type ImportIssue } from "./issues";
import {
  DEFAULT_OVERLAY_SHADOW,
  backgroundStopsOf,
  checkPlatformMismatch,
  deriveHighlightColor,
  normalizeHex,
  resolveDevice,
  resolveDeviceColor,
  resolveExportSize,
  resolveFont,
  resolveShadow,
  toBackgroundSettings,
  type Resolved,
} from "./resolve";
import { applyHighlightColor, sanitizeRichText } from "./sanitize";
import type { ImportManifest, ManifestDeviceEntry, ManifestScreen } from "./schema";

export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export const imageKey = (reference: string): string =>
  (reference.split(/[\\/]/).pop() ?? reference).toLowerCase();

export interface ImageReference {
  path: string;
  name: string;
}

export const listImageReferences = (manifest: ImportManifest): ImageReference[] =>
  manifest.screens.flatMap((screen, i) => [
    ...(screen.image ? [{ path: `screens[${i}].image`, name: screen.image }] : []),
    ...(screen.overlays ?? []).map((overlay, k) => ({
      path: `screens[${i}].overlays[${k}].image`,
      name: overlay.image,
    })),
    ...(screen.devices ?? []).flatMap((device, j) =>
      device.image
        ? [{ path: `screens[${i}].devices[${j}].image`, name: device.image }]
        : [],
    ),
  ]);

export const findMissingImages = (
  manifest: ImportManifest,
  availableKeys: Set<string>,
): ImportIssue[] =>
  listImageReferences(manifest)
    .filter((ref) => !availableKeys.has(imageKey(ref.name)))
    .map((ref) => ({ path: ref.path, message: `image "${ref.name}" is not in the bundle` }));

export interface CompileParams {
  manifest: ImportManifest;
  /** Decoded images keyed by `imageKey`. */
  images: Map<string, LoadedImage>;
  /** Every image filename in the bundle, for the "unused image" warning. */
  bundleImageNames?: string[];
  generateId: () => string;
  now?: () => number;
}

export interface CompileResult {
  project: Project;
  warnings: ImportIssue[];
}

type DeviceOverrides = Omit<ManifestDeviceEntry, "image">;

export const compileManifest = ({
  manifest,
  images,
  bundleImageNames = [],
  generateId,
  now = Date.now,
}: CompileParams): CompileResult => {
  const missing = findMissingImages(manifest, new Set(images.keys()));
  if (missing.length > 0) throw new ImportError(missing);

  const warnings: ImportIssue[] = [];
  const note = (warning: ImportIssue | null) => {
    if (warning) warnings.push(warning);
  };
  const track = <T>(resolved: Resolved<T>): T => {
    note(resolved.warning);
    return resolved.value;
  };
  const image = (name: string): LoadedImage => images.get(imageKey(name)) as LoadedImage;

  // --- Brand → project defaults -------------------------------------------
  const brand = manifest.brand ?? {};
  const primary = brand.primary ? normalizeHex(brand.primary) : undefined;
  if (brand.style && !primary) {
    note({
      path: "brand.style",
      message: "style needs brand.primary to generate a look; ignoring style",
    });
  }
  const look = primary ? generateBrandLook(primary, brand.style ?? "minimal") : null;

  const backgroundDefaults: BackgroundSettings = brand.background
    ? toBackgroundSettings(brand.background)
    : (look?.background ?? { ...DEFAULT_BACKGROUND_SETTINGS });

  const textDefaults: TextSettings = {
    ...DEFAULT_TEXT_SETTINGS,
    fontFamily:
      brand.font !== undefined
        ? track(resolveFont(brand.font, "brand.font"))
        : (look?.fontFamily ?? DEFAULT_TEXT_SETTINGS.fontFamily),
    headlineFontSize:
      brand.headlineSize ?? look?.headlineFontSize ?? DEFAULT_TEXT_SETTINGS.headlineFontSize,
    subheadlineFontSize:
      brand.subheadlineSize ??
      look?.subheadlineFontSize ??
      DEFAULT_TEXT_SETTINGS.subheadlineFontSize,
    textColor: brand.textColor
      ? normalizeHex(brand.textColor)
      : look || brand.background
        ? pickReadableTextColor(backgroundDefaults)
        : DEFAULT_TEXT_SETTINGS.textColor,
  };

  // --- Project device + export size ----------------------------------------
  const projectDevice = manifest.device ?? {};
  const spec = track(resolveDevice(projectDevice.id, "device.id"));
  const colorId = track(resolveDeviceColor(spec, projectDevice.color, "device.color"));
  const projectShadow = resolveShadow(projectDevice.shadow, DEFAULT_DEVICE_SHADOW);
  const exportSize = track(resolveExportSize(manifest.exportSize, spec.id, "exportSize"));
  note(checkPlatformMismatch(spec.id, exportSize.id));

  // --- Screens ---------------------------------------------------------------
  const buildDevice = (
    overrides: DeviceOverrides,
    layout: LayoutPreset,
    imageName: string | undefined,
    path: string,
  ): DeviceInstance => {
    const deviceSpec =
      overrides.id !== undefined ? track(resolveDevice(overrides.id, `${path}.id`)) : spec;
    const deviceColor =
      overrides.color !== undefined
        ? track(resolveDeviceColor(deviceSpec, overrides.color, `${path}.color`))
        : deviceSpec.id === spec.id
          ? colorId
          : deviceSpec.colors[0].id;

    return createDeviceInstance({
      id: generateId(),
      deviceId: deviceSpec.id,
      colorId: deviceColor,
      screenshotSrc: imageName ? image(imageName).dataUrl : null,
      x: overrides.x ?? 50,
      y: overrides.y ?? layout.device.y,
      scale: overrides.scale ?? layout.device.scale,
      rotation: overrides.rotation ?? layout.device.rotation,
      style: overrides.style ?? layout.device.style ?? projectDevice.style ?? "flat",
      rotateX: overrides.rotateX ?? layout.device.rotateX,
      rotateY: overrides.rotateY ?? layout.device.rotateY,
      shadow: resolveShadow(overrides.shadow, projectShadow),
    });
  };

  const buildOverlay = (overlay: NonNullable<ManifestScreen["overlays"]>[number]): ImageOverlay => {
    const img = image(overlay.image);
    const aspect = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
    const width = overlay.width ?? 30;
    return {
      id: generateId(),
      src: img.dataUrl,
      x: overlay.x ?? 50,
      y: overlay.y ?? 50,
      width,
      height: width / aspect,
      layer: overlay.layer ?? "front",
      rotation: overlay.rotation ?? 0,
      shadow: resolveShadow(overlay.shadow, DEFAULT_OVERLAY_SHADOW),
    };
  };

  const buildScreen = (screen: ManifestScreen, i: number): Screenshot => {
    const path = `screens[${i}]`;
    const layout = getLayoutPreset(screen.layout ?? DEFAULT_LAYOUT_PRESET_ID);

    if (screen.devices && screen.device) {
      note({ path: `${path}.device`, message: "ignored because devices is set" });
    }
    const deviceList = screen.devices
      ? screen.devices.map(({ image: imageName, ...overrides }, j) =>
          buildDevice(overrides, layout, imageName, `${path}.devices[${j}]`),
        )
      : [buildDevice(screen.device ?? {}, layout, screen.image, `${path}.device`)];

    const headline = sanitizeRichText(screen.headline);
    const subheadline = sanitizeRichText(screen.subheadline ?? "");
    if (headline.stripped) {
      note({ path: `${path}.headline`, message: "unsupported HTML was removed" });
    }
    if (subheadline.stripped) {
      note({ path: `${path}.subheadline`, message: "unsupported HTML was removed" });
    }

    const text = screen.text;
    let shot: Screenshot = {
      id: generateId(),
      headline: headline.html,
      subheadline: subheadline.html,
      ...pickBackgroundSettings(backgroundDefaults),
      backgroundOverride: false,
      ...textDefaults,
      headlineX: text?.headline?.x ?? layout.text.headline.x,
      headlineY: text?.headline?.y ?? layout.text.headline.y,
      subheadlineX: text?.subheadline?.x ?? layout.text.subheadline.x,
      subheadlineY: text?.subheadline?.y ?? layout.text.subheadline.y,
      textOverrides: [],
      overlayImages: (screen.overlays ?? []).map(buildOverlay),
      devices: deviceList,
      activeDeviceId: deviceList[0].id,
    };

    if (screen.background) {
      shot = overrideScreenshotBackground(shot, toBackgroundSettings(screen.background));
    }
    if (text?.color) shot = overrideScreenshotText(shot, "textColor", normalizeHex(text.color));
    if (text?.font) {
      shot = overrideScreenshotText(shot, "fontFamily", track(resolveFont(text.font, `${path}.text.font`)));
    }
    if (text?.headlineSize !== undefined) {
      shot = overrideScreenshotText(shot, "headlineFontSize", text.headlineSize);
    }
    if (text?.subheadlineSize !== undefined) {
      shot = overrideScreenshotText(shot, "subheadlineFontSize", text.subheadlineSize);
    }
    if (text?.headline?.width !== undefined) {
      shot = overrideScreenshotText(shot, "headlineWidth", text.headline.width);
    }
    if (text?.subheadline?.width !== undefined) {
      shot = overrideScreenshotText(shot, "subheadlineWidth", text.subheadline.width);
    }

    const highlight = brand.highlightColor
      ? normalizeHex(brand.highlightColor)
      : deriveHighlightColor(primary, shot.textColor, backgroundStopsOf(shot));
    return {
      ...shot,
      headline: applyHighlightColor(shot.headline, highlight),
      subheadline: applyHighlightColor(shot.subheadline, highlight),
    };
  };

  const screenshots = manifest.screens.map(buildScreen);

  // --- Whole-set warnings --------------------------------------------------
  const indexById = new Map(screenshots.map((s, i) => [s.id, i]));
  for (const issue of evaluateProjectContrast(screenshots)) {
    warnings.push({
      path: `screens[${indexById.get(issue.screenshotId)}].${issue.element}`,
      message: `text contrast ${issue.ratio.toFixed(2)}:1 fails WCAG AA; ${issue.suggestedTextColor} would be readable`,
    });
  }

  const referenced = new Set(listImageReferences(manifest).map((ref) => imageKey(ref.name)));
  for (const name of bundleImageNames) {
    if (!referenced.has(imageKey(name))) {
      warnings.push({ path: "", message: `image "${name}" is in the bundle but no screen uses it` });
    }
  }

  const brandColors = [
    primary,
    brand.textColor ? normalizeHex(brand.textColor) : undefined,
    brand.highlightColor ? normalizeHex(brand.highlightColor) : undefined,
    ...backgroundStopsOf(backgroundDefaults),
  ].filter((c): c is string => Boolean(c));
  const savedColors = brandColors.reduceRight<string[]>(
    (palette, color) => addColorToPalette(palette, color),
    [],
  );

  const timestamp = now();
  return {
    project: {
      id: generateId(),
      name: manifest.name ?? "Imported Project",
      createdAt: timestamp,
      updatedAt: timestamp,
      screenshots,
      selectedDeviceId: spec.id,
      selectedColorId: colorId,
      exportSizeId: exportSize.id,
      activeScreenshotId: screenshots[0].id,
      textDefaults,
      backgroundDefaults,
      savedColors,
    },
    warnings,
  };
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/compile.test.ts`
Expected: PASS (16 tests). If the `normalizeProject` round-trip fails, print the diff; the only acceptable fix is in `compile.ts` (produce the normalized shape), never in `normalizeProject`.

- [ ] **Step 6: Type-check and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```bash
git add src/context/EditorContext.tsx src/lib/agent-import/compile.ts src/lib/agent-import/compile.test.ts
git commit -m "Compile agent import manifests into projects

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 6: Bundle collection (files, zip, folder drop)

**Files:**
- Create: `src/lib/agent-import/bundle.ts`, `src/lib/agent-import/dropped-files.ts`
- Test: `src/lib/agent-import/bundle.test.ts`, `src/lib/agent-import/dropped-files.test.ts`

**Interfaces:**
- Consumes: `JSZip` (`jszip`), `ImportError`/`ImportIssue` (Task 2).
- Produces (`bundle.ts`):
  - `MANIFEST_FILENAME = "appshots.json"`
  - `imageMimeType(name: string): string | null` (png/jpg/jpeg/webp only)
  - `readFileAsText(file: Blob): Promise<string>`; `readFileAsDataUrl(file: Blob): Promise<string>` (FileReader — jsdom has no `File.text()`)
  - `interface Bundle { manifestText: string; images: Map<string, File> }` (keys = lowercase basename)
  - `collectBundle(files: File[]): Promise<Bundle>` — throws `ImportError`
- Produces (`dropped-files.ts`):
  - `interface EntryLike { isFile: boolean; isDirectory: boolean; name: string }`
  - `filesFromEntries(entries: EntryLike[]): Promise<File[]>`
  - `filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]>` — must read `items` synchronously before any `await`

- [ ] **Step 1: Write the failing bundle test**

Create `src/lib/agent-import/bundle.test.ts`:

```ts
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { collectBundle, imageMimeType, readFileAsText } from "./bundle";

const MANIFEST = '{"format":"appshots-import"}';
const manifestFile = (name = "appshots.json") =>
  new File([MANIFEST], name, { type: "application/json" });
const png = (name: string) => new File(["png-bytes"], name, { type: "image/png" });

const zipOf = async (entries: Record<string, string>, name = "bundle.zip") => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buffer], name, { type: "application/zip" });
};

describe("imageMimeType", () => {
  it("accepts png, jpeg and webp only", () => {
    expect(imageMimeType("a.PNG")).toBe("image/png");
    expect(imageMimeType("a.jpg")).toBe("image/jpeg");
    expect(imageMimeType("a.jpeg")).toBe("image/jpeg");
    expect(imageMimeType("a.webp")).toBe("image/webp");
    expect(imageMimeType("a.gif")).toBeNull();
    expect(imageMimeType("notes.txt")).toBeNull();
  });
});

describe("collectBundle", () => {
  it("collects a manifest and images from loose files", async () => {
    const bundle = await collectBundle([manifestFile(), png("01.png"), png("02-Stats.PNG")]);
    expect(bundle.manifestText).toBe(MANIFEST);
    expect([...bundle.images.keys()]).toEqual(["01.png", "02-stats.png"]);
  });

  it("ignores junk and non-image files", async () => {
    const bundle = await collectBundle([
      manifestFile(),
      png("01.png"),
      new File(["x"], ".DS_Store"),
      new File(["notes"], "notes.txt"),
    ]);
    expect([...bundle.images.keys()]).toEqual(["01.png"]);
  });

  it("expands zips, including nested folders, skipping __MACOSX", async () => {
    const zip = await zipOf({
      "set/appshots.json": MANIFEST,
      "set/shots/01.png": "a",
      "__MACOSX/set/shots/._01.png": "junk",
    });
    const bundle = await collectBundle([zip]);
    expect(bundle.manifestText).toBe(MANIFEST);
    expect([...bundle.images.keys()]).toEqual(["01.png"]);
    expect(bundle.images.get("01.png")?.type).toBe("image/png");
    expect(await readFileAsText(bundle.images.get("01.png") as File)).toBe("a");
  });

  it("requires exactly one manifest", async () => {
    await expect(collectBundle([png("01.png")])).rejects.toThrow(/no appshots.json/);
    await expect(
      collectBundle([manifestFile(), await zipOf({ "appshots.json": MANIFEST })]),
    ).rejects.toThrow(/found 2 appshots.json/);
  });

  it("rejects duplicate image names", async () => {
    const zip = await zipOf({ "appshots.json": MANIFEST, "a/01.png": "a" });
    await expect(collectBundle([zip, png("01.PNG")])).rejects.toThrow(/more than one image/);
  });

  it("reports a corrupt zip", async () => {
    const broken = new File(["not a zip"], "bundle.zip", { type: "application/zip" });
    await expect(collectBundle([broken])).rejects.toThrow(/bundle.zip: could not open/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/bundle.test.ts`
Expected: FAIL — cannot resolve `./bundle`.

- [ ] **Step 3: Implement `bundle.ts`**

Create `src/lib/agent-import/bundle.ts`:

```ts
/**
 * Gathers an agent bundle from whatever the user dropped or picked: loose files,
 * a folder's files, or zips (expanded in place). Images are matched later by
 * lowercase basename, so folder structure inside the bundle doesn't matter.
 */

import JSZip from "jszip";
import { ImportError, type ImportIssue } from "./issues";

export const MANIFEST_FILENAME = "appshots.json";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export const imageMimeType = (name: string): string | null =>
  IMAGE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

const isJunk = (path: string): boolean =>
  path.split(/[\\/]/).includes("__MACOSX") || basename(path).startsWith(".");

const readWith = <T>(file: Blob, read: (reader: FileReader) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    read(reader);
  });

export const readFileAsText = (file: Blob): Promise<string> =>
  readWith<string>(file, (reader) => reader.readAsText(file));

export const readFileAsDataUrl = (file: Blob): Promise<string> =>
  readWith<string>(file, (reader) => reader.readAsDataURL(file));

export interface Bundle {
  manifestText: string;
  /** Image files keyed by lowercase basename. */
  images: Map<string, File>;
}

const expandZip = async (zipFile: File): Promise<File[]> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch {
    throw new ImportError([{ path: zipFile.name, message: "could not open this zip file" }]);
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !isJunk(e.name));
  return Promise.all(
    entries.map(async (entry) => {
      const name = basename(entry.name);
      const blob = await entry.async("blob");
      return new File([blob], name, {
        type: imageMimeType(name) ?? "application/octet-stream",
      });
    }),
  );
};

export const collectBundle = async (files: File[]): Promise<Bundle> => {
  const expanded: File[] = [];
  for (const file of files) {
    if (isJunk(file.name)) continue;
    if (file.name.toLowerCase().endsWith(".zip")) {
      expanded.push(...(await expandZip(file)));
    } else {
      expanded.push(file);
    }
  }

  const manifests = expanded.filter(
    (f) => basename(f.name).toLowerCase() === MANIFEST_FILENAME,
  );
  if (manifests.length === 0) {
    throw new ImportError([
      {
        path: "",
        message: `no ${MANIFEST_FILENAME} found — drop the folder that contains it, or include it in your selection`,
      },
    ]);
  }
  if (manifests.length > 1) {
    throw new ImportError([
      {
        path: "",
        message: `found ${manifests.length} ${MANIFEST_FILENAME} files; import one screenshot set at a time`,
      },
    ]);
  }

  const images = new Map<string, File>();
  const duplicates: ImportIssue[] = [];
  for (const file of expanded) {
    if (!imageMimeType(file.name)) continue;
    const key = basename(file.name).toLowerCase();
    if (images.has(key)) {
      duplicates.push({
        path: "",
        message: `more than one image is named "${basename(file.name)}"; image names must be unique`,
      });
      continue;
    }
    images.set(key, file);
  }
  if (duplicates.length > 0) throw new ImportError(duplicates);

  return { manifestText: await readFileAsText(manifests[0]), images };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/bundle.test.ts`
Expected: PASS (7 tests). If `zip.generateAsync({ type: "arraybuffer" })` misbehaves under jsdom, switch only the **test helper** to `type: "blob"`.

- [ ] **Step 5: Write the failing folder-drop test**

Create `src/lib/agent-import/dropped-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filesFromDataTransfer, filesFromEntries, type EntryLike } from "./dropped-files";

const fileEntry = (name: string) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (resolve: (file: File) => void) => resolve(new File(["x"], name)),
});

// Real directory readers return entries in batches and then an empty batch.
const dirEntry = (name: string, batches: EntryLike[][]) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    const queue = [...batches, []];
    return {
      readEntries: (resolve: (entries: EntryLike[]) => void) =>
        resolve(queue.shift() ?? []),
    };
  },
});

describe("filesFromEntries", () => {
  it("walks nested directories across reader batches", async () => {
    const files = await filesFromEntries([
      dirEntry("set", [
        [fileEntry("appshots.json"), dirEntry("shots", [[fileEntry("01.png")], [fileEntry("02.png")]])],
        [fileEntry("badge.png")],
      ]),
    ]);
    expect(files.map((f) => f.name)).toEqual(["appshots.json", "01.png", "02.png", "badge.png"]);
  });
});

describe("filesFromDataTransfer", () => {
  it("falls back to plain files when entries are unavailable", async () => {
    const file = new File(["x"], "appshots.json");
    const dataTransfer = { items: [], files: [file] } as unknown as DataTransfer;
    expect(await filesFromDataTransfer(dataTransfer)).toEqual([file]);
  });

  it("uses webkitGetAsEntry when available", async () => {
    const dataTransfer = {
      items: [{ webkitGetAsEntry: () => fileEntry("appshots.json") }],
      files: [],
    } as unknown as DataTransfer;
    const files = await filesFromDataTransfer(dataTransfer);
    expect(files.map((f) => f.name)).toEqual(["appshots.json"]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/dropped-files.test.ts`
Expected: FAIL — cannot resolve `./dropped-files`.

- [ ] **Step 7: Implement `dropped-files.ts`**

Create `src/lib/agent-import/dropped-files.ts`:

```ts
/**
 * Dropped folders arrive as FileSystemEntry trees, not flat File lists. Walk
 * them into Files. Typed structurally so tests can pass plain fakes.
 */

export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileEntryLike extends EntryLike {
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
}

interface DirectoryEntryLike extends EntryLike {
  createReader: () => {
    readEntries: (
      success: (entries: EntryLike[]) => void,
      error?: (err: unknown) => void,
    ) => void;
  };
}

const readAllEntries = (directory: DirectoryEntryLike): Promise<EntryLike[]> => {
  const reader = directory.createReader();
  const all: EntryLike[] = [];
  return new Promise((resolve, reject) => {
    const readBatch = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    readBatch();
  });
};

export const filesFromEntries = async (entries: EntryLike[]): Promise<File[]> => {
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      files.push(
        await new Promise<File>((resolve, reject) =>
          (entry as FileEntryLike).file(resolve, reject),
        ),
      );
    } else if (entry.isDirectory) {
      files.push(
        ...(await filesFromEntries(await readAllEntries(entry as DirectoryEntryLike))),
      );
    }
  }
  return files;
};

export const filesFromDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<File[]> => {
  // DataTransfer items become unusable after the first await — collect entries now.
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    return filesFromEntries(entries as unknown as EntryLike[]);
  }
  return Array.from(dataTransfer.files);
};
```

- [ ] **Step 8: Run both tests, type-check, commit**

Run: `bunx vitest run src/lib/agent-import/bundle.test.ts src/lib/agent-import/dropped-files.test.ts && bunx tsc --noEmit`
Expected: PASS (10 tests); tsc exit 0.

```bash
git add src/lib/agent-import/bundle.ts src/lib/agent-import/bundle.test.ts src/lib/agent-import/dropped-files.ts src/lib/agent-import/dropped-files.test.ts
git commit -m "Collect agent import bundles from files, folders and zips

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 7: Import pipeline + replace merge

**Files:**
- Create: `src/lib/agent-import/pipeline.ts`, `src/lib/agent-import/apply.ts`
- Test: `src/lib/agent-import/pipeline.test.ts`, `src/lib/agent-import/apply.test.ts`

**Interfaces:**
- Consumes: `collectBundle`, `readFileAsDataUrl` (Task 6); `parseManifest` (Task 2); `compileManifest`, `findMissingImages`, `listImageReferences`, `imageKey`, `LoadedImage` (Task 5); `checkStorageBudget`, `ImportError`, `ImportIssue` (Task 2); `Project`.
- Produces (`pipeline.ts`):
  - `type ReadImage = (file: File) => Promise<LoadedImage>`
  - `interface PipelineOptions { readImage: ReadImage; generateId: () => string; existingStorageChars: number }`
  - `type PipelineResult = { ok: false; errors: ImportIssue[] } | { ok: true; project: Project; warnings: ImportIssue[] }`
  - `runAgentImport(files: File[], options: PipelineOptions): Promise<PipelineResult>` — never throws `ImportError`; only decodes referenced images; storage warning (if any) is listed first
  - `readImageFile: ReadImage` — browser decoder (data URL + `naturalWidth/Height`); not unit-tested (jsdom never loads images)
- Produces (`apply.ts`):
  - `type AgentImportMode = "new" | "replace"`
  - `replaceProjectContent(current: Project, imported: Project, now?: number): Project` — imported content with the current project's `id`, `name`, `createdAt`

- [ ] **Step 1: Write the failing pipeline test**

Create `src/lib/agent-import/pipeline.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runAgentImport, type ReadImage } from "./pipeline";

const manifest = (screens: unknown[]) =>
  new File(
    [JSON.stringify({ format: "appshots-import", version: 1, screens })],
    "appshots.json",
    { type: "application/json" },
  );
const png = (name: string) => new File(["png"], name, { type: "image/png" });

const stubReadImage = () =>
  vi.fn<ReadImage>(async (file) => ({ dataUrl: `data:${file.name}`, width: 100, height: 200 }));

const options = (readImage = stubReadImage(), existingStorageChars = 0) => {
  let n = 0;
  return { readImage, generateId: () => `id${++n}`, existingStorageChars };
};

describe("runAgentImport", () => {
  it("imports a valid bundle", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      options(),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.project.screenshots).toHaveLength(1);
    expect(result.project.screenshots[0].devices[0].screenshotSrc).toBe("data:01.png");
    expect(result.warnings).toEqual([]);
  });

  it("returns bundle errors instead of throwing", async () => {
    const result = await runAgentImport([png("01.png")], options());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/no appshots.json/);
  });

  it("returns schema errors with paths", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi", layout: "diagonal" }]), png("01.png")],
      options(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].path).toBe("screens[0].layout");
  });

  it("reports missing images before decoding anything", async () => {
    const readImage = stubReadImage();
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }])],
      options(readImage),
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "screens[0].image", message: 'image "01.png" is not in the bundle' }],
    });
    expect(readImage).not.toHaveBeenCalled();
  });

  it("reports an image that fails to decode", async () => {
    const readImage = vi.fn<ReadImage>(async () => {
      throw new Error("decode failed");
    });
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      options(readImage),
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "01.png", message: "this image could not be read" }],
    });
  });

  it("decodes only referenced images and warns about the rest", async () => {
    const readImage = stubReadImage();
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png"), png("extra.png")],
      options(readImage),
    );
    expect(readImage).toHaveBeenCalledTimes(1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings.some((w) => w.message.includes("extra.png"))).toBe(true);
  });

  it("lists the storage warning first", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png"), png("extra.png")],
      options(stubReadImage(), 4_500_000),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings[0].message).toMatch(/stop saving/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/pipeline.test.ts`
Expected: FAIL — cannot resolve `./pipeline`.

- [ ] **Step 3: Implement `pipeline.ts`**

Create `src/lib/agent-import/pipeline.ts`:

```ts
/**
 * End-to-end import: bundle → manifest → decode referenced images → compile.
 * Every expected failure comes back as `{ ok: false, errors }` so the UI can
 * list them; only genuine bugs throw.
 */

import type { Project } from "../../types";
import { collectBundle, readFileAsDataUrl } from "./bundle";
import {
  compileManifest,
  findMissingImages,
  imageKey,
  listImageReferences,
  type LoadedImage,
} from "./compile";
import { ImportError, checkStorageBudget, type ImportIssue } from "./issues";
import { parseManifest } from "./schema";

export type ReadImage = (file: File) => Promise<LoadedImage>;

export interface PipelineOptions {
  readImage: ReadImage;
  generateId: () => string;
  /** Characters already persisted (e.g. JSON.stringify(projects).length). */
  existingStorageChars: number;
}

export type PipelineResult =
  | { ok: false; errors: ImportIssue[] }
  | { ok: true; project: Project; warnings: ImportIssue[] };

export const runAgentImport = async (
  files: File[],
  { readImage, generateId, existingStorageChars }: PipelineOptions,
): Promise<PipelineResult> => {
  try {
    const bundle = await collectBundle(files);

    const parsed = parseManifest(bundle.manifestText);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const missing = findMissingImages(parsed.manifest, new Set(bundle.images.keys()));
    if (missing.length > 0) return { ok: false, errors: missing };

    const referencedKeys = [
      ...new Set(listImageReferences(parsed.manifest).map((ref) => imageKey(ref.name))),
    ];
    const images = new Map<string, LoadedImage>();
    for (const key of referencedKeys) {
      const file = bundle.images.get(key) as File;
      try {
        images.set(key, await readImage(file));
      } catch {
        return { ok: false, errors: [{ path: file.name, message: "this image could not be read" }] };
      }
    }

    const { project, warnings } = compileManifest({
      manifest: parsed.manifest,
      images,
      bundleImageNames: [...bundle.images.values()].map((file) => file.name),
      generateId,
    });
    const storage = checkStorageBudget(existingStorageChars, project);
    return { ok: true, project, warnings: storage ? [storage, ...warnings] : warnings };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, errors: error.issues };
    throw error;
  }
};

/** Browser decoder: data URL plus natural pixel size. */
export const readImageFile: ReadImage = async (file) => {
  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error(`could not decode ${file.name}`));
      img.src = dataUrl;
    },
  );
  return { dataUrl, width, height };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run src/lib/agent-import/pipeline.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing apply test**

Create `src/lib/agent-import/apply.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { replaceProjectContent } from "./apply";

const project = (over: Partial<Project>): Project =>
  ({
    id: "p",
    name: "Name",
    createdAt: 1,
    updatedAt: 1,
    screenshots: [],
    selectedDeviceId: "iphone-17-pro",
    selectedColorId: "silver",
    exportSizeId: "6.9",
    activeScreenshotId: "s",
    textDefaults: {} as Project["textDefaults"],
    backgroundDefaults: undefined,
    savedColors: [],
    ...over,
  }) as Project;

describe("replaceProjectContent", () => {
  it("keeps the current identity and takes the imported content", () => {
    const current = project({ id: "current", name: "My App", createdAt: 5, exportSizeId: "6.9" });
    const imported = project({
      id: "new",
      name: "Imported",
      createdAt: 9,
      exportSizeId: "play-phone-20-9",
      selectedDeviceId: "pixel-10",
      activeScreenshotId: "s2",
      savedColors: ["#123456"],
    });
    expect(replaceProjectContent(current, imported, 42)).toEqual({
      ...imported,
      id: "current",
      name: "My App",
      createdAt: 5,
      updatedAt: 42,
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails, then implement `apply.ts`**

Run: `bunx vitest run src/lib/agent-import/apply.test.ts` → FAIL (cannot resolve `./apply`).

Create `src/lib/agent-import/apply.ts`:

```ts
import type { Project } from "../../types";

export type AgentImportMode = "new" | "replace";

/** Imported content under the current project's identity (for "Replace current project"). */
export const replaceProjectContent = (
  current: Project,
  imported: Project,
  now: number = Date.now(),
): Project => ({
  ...imported,
  id: current.id,
  name: current.name,
  createdAt: current.createdAt,
  updatedAt: now,
});
```

- [ ] **Step 7: Run tests, type-check, commit**

Run: `bunx vitest run src/lib/agent-import/pipeline.test.ts src/lib/agent-import/apply.test.ts && bunx tsc --noEmit`
Expected: PASS (8 tests); tsc exit 0.

```bash
git add src/lib/agent-import/pipeline.ts src/lib/agent-import/pipeline.test.ts src/lib/agent-import/apply.ts src/lib/agent-import/apply.test.ts
git commit -m "Add agent import pipeline and replace-project merge

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 8: Agent prompt, example, generated docs

**Files:**
- Create: `src/lib/agent-import/example.ts`, `src/lib/agent-import/prompt.ts`, `src/lib/agent-import/docs.ts`, `src/lib/agent-import/index.ts`, `scripts/gen-agent-docs.ts`
- Modify: `package.json` (`scripts.gen:agent-docs`)
- Generate: `docs/agent-import/PROMPT.md`, `docs/agent-import/appshots-import.schema.json`, `docs/agent-import/example/appshots.json`, `docs/agent-import/example/*.png`
- Test: `src/lib/agent-import/prompt.test.ts`

**Interfaces:**
- Consumes: `devices`, `exportSizes`, `gradientPresets`; `VIBES`; `googleFonts`; `LAYOUT_PRESETS`; `deviceFamily`, `DeviceFamily` (Task 4); `buildJsonSchema`, `ImportManifest`, `parseManifest` (Task 2); `compileManifest`, `listImageReferences`, `imageKey` (Task 5); pipeline/apply/issues/dropped-files exports (Tasks 2, 6, 7).
- Produces:
  - `example.ts`: `interface ExampleImage { name: string; width: number; height: number; color: [number, number, number] }`, `EXAMPLE_IMAGES: ExampleImage[]`, `EXAMPLE_MANIFEST: ImportManifest`
  - `prompt.ts`: `STYLE_DESCRIPTIONS: Record<string, string>`, `buildAgentPrompt(): string`
  - `docs.ts`: `AGENT_DOC_PATHS`, `renderAgentDocs(): Record<string, string>` (repo-relative path → file content)
  - `index.ts`: public re-exports used by the modal
  - `bun run gen:agent-docs`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent-import/prompt.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { devices, exportSizes, gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { googleFonts } from "../google-fonts";
import { LAYOUT_PRESETS, LAYOUT_PRESET_IDS } from "../layout-presets";
import { compileManifest, imageKey, listImageReferences, type LoadedImage } from "./compile";
import { renderAgentDocs } from "./docs";
import { EXAMPLE_IMAGES, EXAMPLE_MANIFEST } from "./example";
import { STYLE_DESCRIPTIONS, buildAgentPrompt } from "./prompt";
import { parseManifest } from "./schema";

describe("example manifest", () => {
  it("is valid and exercises every layout, multi-device and overlays", () => {
    expect(parseManifest(JSON.stringify(EXAMPLE_MANIFEST)).ok).toBe(true);
    const layouts = new Set(EXAMPLE_MANIFEST.screens.map((s) => s.layout).filter(Boolean));
    expect([...layouts].sort()).toEqual([...LAYOUT_PRESET_IDS].sort());
    expect(EXAMPLE_MANIFEST.screens.some((s) => s.devices && s.devices.length > 1)).toBe(true);
    expect(EXAMPLE_MANIFEST.screens.some((s) => (s.overlays ?? []).length > 0)).toBe(true);
  });

  it("ships exactly the images it references", () => {
    const referenced = new Set(listImageReferences(EXAMPLE_MANIFEST).map((r) => imageKey(r.name)));
    expect(new Set(EXAMPLE_IMAGES.map((i) => imageKey(i.name)))).toEqual(referenced);
  });

  it("compiles without warnings", () => {
    let n = 0;
    const images = new Map<string, LoadedImage>(
      EXAMPLE_IMAGES.map((i) => [imageKey(i.name), { dataUrl: `data:${i.name}`, width: i.width, height: i.height }]),
    );
    const { warnings } = compileManifest({
      manifest: EXAMPLE_MANIFEST,
      images,
      generateId: () => `id${++n}`,
    });
    expect(warnings).toEqual([]);
  });
});

describe("buildAgentPrompt", () => {
  const prompt = buildAgentPrompt();

  it("describes every style", () => {
    expect(Object.keys(STYLE_DESCRIPTIONS).sort()).toEqual(VIBES.map((v) => v.id).sort());
    for (const vibe of VIBES) expect(prompt).toContain(`\`${vibe.id}\``);
  });

  it("lists every layout, device, color, font, export size and preset", () => {
    for (const layout of LAYOUT_PRESETS) expect(prompt).toContain(`\`${layout.id}\``);
    for (const device of devices) {
      expect(prompt).toContain(`\`${device.id}\``);
      for (const color of device.colors) expect(prompt).toContain(`\`${color.id}\``);
    }
    for (const font of googleFonts) expect(prompt).toContain(font.family);
    for (const size of exportSizes) expect(prompt).toContain(`\`${size.id}\``);
    for (const preset of gradientPresets) expect(prompt).toContain(`\`${preset.id}\``);
  });

  it("states the output contract and embeds the example", () => {
    expect(prompt).toContain("appshots.json");
    expect(prompt).toContain('"format": "appshots-import"');
    expect(prompt).toContain(JSON.stringify(EXAMPLE_MANIFEST, null, 2));
  });
});

describe("committed agent docs", () => {
  it("match the generated output (run `bun run gen:agent-docs` if this fails)", () => {
    for (const [path, content] of Object.entries(renderAgentDocs())) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8"), path).toBe(content);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/agent-import/prompt.test.ts`
Expected: FAIL — cannot resolve `./docs` (and `./example`, `./prompt`).

- [ ] **Step 3: Create `example.ts`**

Create `src/lib/agent-import/example.ts`:

```ts
/**
 * The worked example embedded in the agent prompt and shipped (with placeholder
 * PNGs) in docs/agent-import/example/. Tests keep it valid, warning-free, and
 * covering every layout.
 */

import type { ImportManifest } from "./schema";

export interface ExampleImage {
  name: string;
  width: number;
  height: number;
  /** Placeholder fill color for the generated PNG. */
  color: [number, number, number];
}

const PHONE = { width: 1206, height: 2622 }; // iphone-17-pro native resolution

export const EXAMPLE_IMAGES: ExampleImage[] = [
  { name: "01-today.png", ...PHONE, color: [238, 240, 255] },
  { name: "02-streaks.png", ...PHONE, color: [224, 231, 255] },
  { name: "03-reminders.png", ...PHONE, color: [237, 233, 254] },
  { name: "04-insights.png", ...PHONE, color: [219, 234, 254] },
  { name: "05-focus.png", ...PHONE, color: [236, 253, 245] },
  { name: "06-journal.png", ...PHONE, color: [30, 41, 59] },
  { name: "07-widgets.png", ...PHONE, color: [254, 243, 199] },
  { name: "08-share.png", ...PHONE, color: [252, 231, 243] },
  { name: "09a-light.png", ...PHONE, color: [248, 250, 252] },
  { name: "09b-dark.png", ...PHONE, color: [15, 23, 42] },
  { name: "badge.png", width: 600, height: 600, color: [255, 214, 10] },
];

export const EXAMPLE_MANIFEST: ImportManifest = {
  format: "appshots-import",
  version: 1,
  name: "Habitly — App Store",
  exportSize: "6.9",
  brand: {
    primary: "#5B5BD6",
    style: "bold",
    highlightColor: "#FFD60A",
  },
  device: { id: "iphone-17-pro", color: "cosmic-orange", style: "flat", shadow: true },
  screens: [
    {
      image: "01-today.png",
      headline: "Build habits <mark>that stick</mark>",
      subheadline: "Tiny daily wins, tracked for you",
      layout: "bleed-bottom",
      overlays: [{ image: "badge.png", x: 82, y: 30, width: 18, layer: "front" }],
    },
    { image: "02-streaks.png", headline: "Watch streaks grow", layout: "tilt-left" },
    { image: "03-reminders.png", headline: "Never miss a day", subheadline: "Gentle nudges at the right time", layout: "tilt-right" },
    { image: "04-insights.png", headline: "Insights that <mark>motivate</mark>", layout: "perspective" },
    { image: "05-focus.png", headline: "Focus on one thing", layout: "centered" },
    {
      image: "06-journal.png",
      headline: "Reflect in seconds",
      subheadline: "A private journal for every habit",
      layout: "bleed-top",
      background: { type: "solid", color: "#0F172A" },
      text: { color: "#F8FAFC" },
    },
    { image: "07-widgets.png", headline: "Widgets everywhere", layout: "float-center" },
    {
      image: "08-share.png",
      headline: "Share your progress",
      subheadline: "Invite friends and keep each other on track",
      layout: "float-bottom",
    },
    {
      headline: "Light or dark, your call",
      devices: [
        { image: "09a-light.png", x: 32, y: 40, scale: 55, rotation: -8 },
        { image: "09b-dark.png", x: 68, y: 44, scale: 55, rotation: 8 },
      ],
    },
  ],
};
```

- [ ] **Step 4: Create `prompt.ts`**

Create `src/lib/agent-import/prompt.ts`:

````ts
/**
 * The brief an AI agent receives. Generated from live data so it can never
 * list a device, font, layout or style AppShots doesn't support.
 */

import { devices, exportSizes, gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { googleFonts } from "../google-fonts";
import { LAYOUT_PRESETS } from "../layout-presets";
import { EXAMPLE_MANIFEST } from "./example";
import { deviceFamily, type DeviceFamily } from "./resolve";

export const STYLE_DESCRIPTIONS: Record<string, string> = {
  minimal: "Inter, calm sizes. Soft near-white tint of the brand color. Clean utility and productivity apps.",
  bold: "Poppins, large type. Gradient from the brand color to a darker shade. Confident consumer apps.",
  warm: "Nunito, rounded. Warm cream tint of the brand color. Wellness, food, community.",
  playful: "Quicksand, largest type. Gradient from the brand color to a shifted hue. Kids, games, social.",
  elegant: "Playfair Display serif. Deep, dark shade of the brand color. Finance, luxury, premium.",
  editorial: "Lora serif. Deep, narrow dark gradient. Reading, news, journaling.",
};

const FAMILY_LABELS: Record<DeviceFamily, string> = {
  "apple-phone": "iPhone",
  "apple-tablet": "iPad",
  "android-phone": "Android phone",
  "android-tablet": "Android tablet",
};

const code = (value: string) => `\`${value}\``;

const table = (header: string[], rows: string[][]): string =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const stylesTable = () =>
  table(
    ["style", "look"],
    VIBES.map((v) => [code(v.id), STYLE_DESCRIPTIONS[v.id] ?? v.label]),
  );

const layoutsTable = () =>
  table(
    ["layout", "what it does"],
    LAYOUT_PRESETS.map((p) => [code(p.id), p.description]),
  );

const devicesSection = () =>
  (Object.keys(FAMILY_LABELS) as DeviceFamily[])
    .map((family) => {
      const rows = devices
        .filter((d) => deviceFamily(d.id) === family)
        .map((d) => [
          code(d.id),
          d.label,
          `${d.width}×${d.height}`,
          d.colors.map((c) => code(c.id)).join(", "),
        ]);
      return `#### ${FAMILY_LABELS[family]}\n\n${table(["device.id", "device", "native px", "device.color"], rows)}`;
    })
    .join("\n\n");

const exportSizesTable = () =>
  table(
    ["exportSize", "use for", "px"],
    exportSizes.map((s) => [code(s.id), s.label, `${s.width}×${s.height}`]),
  );

const fontsTable = () =>
  table(
    ["font", "category"],
    googleFonts.map((f) => [f.family, f.category]),
  );

const presetsTable = () =>
  table(
    ["preset id", "gradient"],
    gradientPresets.map((p) => [code(p.id), `${p.label}: ${p.from} → ${p.to}`]),
  );

export const buildAgentPrompt = (): string => `# AppShots agent import — screenshot set brief

You are preparing App Store / Google Play screenshots for the app in this repository. Produce a folder containing the app's screenshots **and** an \`appshots.json\` file describing how AppShots should present them. The user will drop that folder (or a zip of it) into AppShots via **Project menu → Import from agent…** and get a finished, editable project.

## 1. Research the app first

- **Name and promise:** read the README, \`fastlane/metadata\`, \`app.json\` / \`app.config.*\`, \`Info.plist\`, \`pubspec.yaml\`, and any store listing copy. Write down the one-sentence promise and the 5–10 features users care about most.
- **Brand color:** look in the Tailwind config, theme or design-token files, \`Assets.xcassets/*.colorset\`, \`res/values/colors.xml\`, or the SwiftUI / Compose / Material theme. Choose one primary hex for \`brand.primary\`.
- **Font:** find the app's typeface. If it is not in the font table below, pick the nearest by feel (geometric sans → Poppins or Montserrat, neutral sans → Inter, rounded → Nunito or Quicksand, serif → Lora or Playfair Display).
- **Tone:** match the voice of the app's existing copy.

## 2. Screenshots

- Use the screenshots this repository's tooling already captures. One screen per feature, realistic demo data, no debug banners, empty states, or personal information.
- Order matters: the strongest "hero" feature goes first, and the first two or three screens must sell the app on their own.
- Use 5–10 screens, portrait, at the device's native resolution (see the device tables).
- Save every image next to \`appshots.json\` with a unique filename (\`01-home.png\`, \`02-stats.png\`, …). PNG, JPEG or WebP.

## 3. Copy rules

- **Headline:** 2–5 words, at most ~28 characters, benefit first ("Plan your week in seconds", not "Calendar screen"). Start with a verb where it reads naturally.
- **Highlight:** at most one phrase per headline, wrapped in \`<mark>…</mark>\`.
- **Subheadline:** optional, at most ~60 characters, adds a concrete detail. Omit it rather than repeat the headline.
- Keep tone and tense consistent. Make no claims the repository can't back up (no "#1", awards, or prices unless they are real).
- Only this inline HTML is kept: \`<b>\`, \`<strong>\`, \`<i>\`, \`<em>\`, \`<u>\`, \`<mark>\`, \`<br>\`, and \`<span style="color: #hex">\`. Everything else is removed. A newline becomes a line break.

## 4. Visual rules

- Choose **one** \`brand.style\` for the whole set. From \`brand.primary\` it picks the font, sizes, background and a readable text color. Override (\`brand.font\`, \`brand.background\`, …) only when the repository gives you a reason.
- Give \`layout\` a rhythm: hero \`bleed-bottom\`, then alternate (for example \`tilt-left\` / \`tilt-right\`), \`perspective\` at most twice, never the same layout more than three times in a row.
- Keep one background across the set. Use a per-screen \`background\` only as a deliberate accent, and set that screen's \`text.color\` so text stays readable.
- The device and \`exportSize\` must be the same platform (an iPhone with an iPhone size, a Pixel with a Play phone size). One \`appshots.json\` describes one device family; make a separate folder for an iPad or Android set.
- Dark text on light backgrounds, light text on dark. AppShots warns about contrast failures.

## 5. Reference

### Styles (\`brand.style\`)

${stylesTable()}

### Layouts (\`screens[].layout\`, default \`bleed-bottom\`)

${layoutsTable()}

### Devices (\`device.id\` and its valid \`device.color\` values)

${devicesSection()}

### Export sizes (\`exportSize\`; defaults to the device's platform)

${exportSizesTable()}

### Fonts (\`brand.font\`, \`screens[].text.font\`)

${fontsTable()}

### Gradient presets (\`{ "type": "preset", "id": … }\`)

${presetsTable()}

### Units

- \`x\` / \`y\` are percent of the canvas. For devices and overlays they are the center point; for text they are the top-center of the text box. Device \`x\` may go below 0 or above 100 to bleed off the edge.
- \`scale\`, text \`width\` and overlay \`width\` are percent. Rotations are degrees. Font sizes are px at editor scale (headlines are typically 60–80).
- Backgrounds: \`{ "type": "solid", "color": "#hex" }\`, \`{ "type": "gradient", "from": "#hex", "to": "#hex" }\`, or a preset.

## 6. Output contract

- Write \`appshots.json\` (UTF-8) in the same folder as the images.
- Required: \`"format": "appshots-import"\`, \`"version": 1\`, and \`screens\`. Each screen needs \`headline\` and **exactly one** of \`image\` (one device) or \`devices\` (a list, for multi-device screens).
- Image references are bare filenames of files in that folder.
- Unknown keys are rejected. Validate against the JSON Schema: download it from AppShots' **Import from agent** dialog, or use \`docs/agent-import/appshots-import.schema.json\` in the AppShots repository.
- Everything else is optional. Per-screen \`text\`, \`device\` and \`background\` override the brand and layout for that screen only.

Worked example:

\`\`\`json
${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}
\`\`\`

## 7. Self-check before you finish

- [ ] Every \`image\`, \`devices[].image\` and \`overlays[].image\` exists in the folder with exactly that name.
- [ ] Every \`layout\`, \`brand.style\`, \`device.id\`, \`device.color\`, \`exportSize\`, font and preset id appears in the tables above.
- [ ] Each screen has exactly one of \`image\` or \`devices\`.
- [ ] Headlines are at most ~28 characters with at most one \`<mark>\`; subheadlines at most ~60.
- [ ] The device and export size are the same platform.
- [ ] The hero screen is first and there are 5–10 screens.
- [ ] \`appshots.json\` parses and validates against the schema.
`;
````

- [ ] **Step 5: Create `docs.ts` and `index.ts`**

Create `src/lib/agent-import/docs.ts`:

```ts
import { EXAMPLE_MANIFEST } from "./example";
import { buildAgentPrompt } from "./prompt";
import { buildJsonSchema } from "./schema";

/** Repo-relative paths of the committed, generated agent-import docs. */
export const AGENT_DOC_PATHS = {
  prompt: "docs/agent-import/PROMPT.md",
  schema: "docs/agent-import/appshots-import.schema.json",
  example: "docs/agent-import/example/appshots.json",
} as const;

export const renderAgentDocs = (): Record<string, string> => ({
  [AGENT_DOC_PATHS.prompt]: buildAgentPrompt(),
  [AGENT_DOC_PATHS.schema]: `${JSON.stringify(buildJsonSchema(), null, 2)}\n`,
  [AGENT_DOC_PATHS.example]: `${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}\n`,
});
```

Create `src/lib/agent-import/index.ts`:

```ts
export { replaceProjectContent, type AgentImportMode } from "./apply";
export { filesFromDataTransfer } from "./dropped-files";
export { formatIssue, type ImportIssue } from "./issues";
export { readImageFile, runAgentImport, type PipelineResult } from "./pipeline";
export { buildAgentPrompt } from "./prompt";
export { buildJsonSchema, type ImportManifest } from "./schema";
```

- [ ] **Step 6: Create the generator script**

Add to `package.json` `scripts` (after `"test"`):

```json
"gen:agent-docs": "bun scripts/gen-agent-docs.ts"
```

Create `scripts/gen-agent-docs.ts`:

```ts
/// <reference types="node" />
/**
 * Regenerates the committed agent-import docs from code:
 *   bun run gen:agent-docs
 * src/lib/agent-import/prompt.test.ts fails when the committed files are stale.
 * Placeholder example PNGs are written only when missing, so they don't churn.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { AGENT_DOC_PATHS, renderAgentDocs } from "../src/lib/agent-import/docs";
import { EXAMPLE_IMAGES } from "../src/lib/agent-import/example";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const write = (relativePath: string, content: string | Buffer) => {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${relativePath}`);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

/** Minimal solid-color RGB PNG. */
const solidPng = (width: number, height: number, [r, g, b]: [number, number, number]): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  const row = Buffer.alloc(1 + width * 3); // leading 0 = no filter
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const [path, content] of Object.entries(renderAgentDocs())) write(path, content);

const exampleDir = dirname(AGENT_DOC_PATHS.example);
for (const image of EXAMPLE_IMAGES) {
  const path = `${exampleDir}/${image.name}`;
  if (!existsSync(resolve(root, path))) {
    write(path, solidPng(image.width, image.height, image.color));
  }
}
```

- [ ] **Step 7: Generate the docs**

Run: `bun run gen:agent-docs`
Expected: `wrote docs/agent-import/PROMPT.md`, `…schema.json`, `…example/appshots.json`, and 11 PNGs. Open `docs/agent-import/PROMPT.md` and skim it: tables render, the example JSON is present.

- [ ] **Step 8: Run the test to verify it passes**

Run: `bunx vitest run src/lib/agent-import/prompt.test.ts`
Expected: PASS (7 tests). If "compiles without warnings" fails, fix `EXAMPLE_MANIFEST` (e.g. adjust a color), re-run `bun run gen:agent-docs`, and re-test — do not weaken the assertion.

- [ ] **Step 9: Type-check and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```bash
git add package.json scripts/gen-agent-docs.ts src/lib/agent-import/example.ts src/lib/agent-import/prompt.ts src/lib/agent-import/prompt.test.ts src/lib/agent-import/docs.ts src/lib/agent-import/index.ts docs/agent-import
git commit -m "Generate agent prompt, JSON Schema and example bundle

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 9: Import modal + context wiring + menu entry

**Files:**
- Modify: `src/context/EditorContext.tsx` (interface ~line 88 and ~line 108; state ~line 434; new function after `importProject` ~line 794; provider value ~line 1370)
- Create: `src/components/AgentImport/AgentImportModal.tsx`
- Modify: `src/components/ProjectSwitcher/ProjectSwitcher.tsx:13-23,172-182,341-358`
- Modify: `src/components/EditorLayout.tsx`
- Test: `src/components/AgentImport/AgentImportModal.test.tsx`

**Interfaces:**
- Consumes: from `src/lib/agent-import` (Task 8 `index.ts`): `runAgentImport`, `readImageFile`, `filesFromDataTransfer`, `buildAgentPrompt`, `buildJsonSchema`, `formatIssue`, `replaceProjectContent`, `AgentImportMode`, `ImportIssue`; `normalizeProject` (Task 5); `useModalDismiss`.
- Produces:
  - `EditorContextType.applyAgentImport(project: Project, mode: AgentImportMode): void`
  - `EditorContextType.isAgentImportOpen: boolean`, `setIsAgentImportOpen(open: boolean): void`
  - `<AgentImportModal isOpen onClose />`

- [ ] **Step 1: Write the failing modal test**

Create `src/components/AgentImport/AgentImportModal.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";

const useEditorMock = vi.fn();
vi.mock("../../context/EditorContext", () => ({
  useEditor: () => useEditorMock(),
}));

const runAgentImportMock = vi.fn();
vi.mock("../../lib/agent-import/pipeline", () => ({
  runAgentImport: (...args: unknown[]) => runAgentImportMock(...args),
  readImageFile: vi.fn(),
}));

import { AgentImportModal } from "./AgentImportModal";

const project = {
  id: "p1",
  name: "Habitly",
  screenshots: [
    { id: "s1", devices: [{ screenshotSrc: "data:image/png;base64,AAA" }] },
    { id: "s2", devices: [{ screenshotSrc: null }] },
  ],
} as unknown as Project;

const writeText = vi.fn();
const applyAgentImport = vi.fn();

const pickFiles = () => {
  const file = new File(["{}"], "appshots.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [file] } });
  return file;
};

describe("AgentImportModal", () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    applyAgentImport.mockReset();
    runAgentImportMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText } });
    useEditorMock.mockReturnValue({ projects: [], applyAgentImport });
  });

  it("renders nothing when closed", () => {
    render(<AgentImportModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("copies the agent prompt", async () => {
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy agent prompt/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("appshots.json")),
    );
    expect(await screen.findByRole("button", { name: /copied/i })).not.toBeNull();
  });

  it("lists blocking errors with paths and copies them", async () => {
    runAgentImportMock.mockResolvedValue({
      ok: false,
      errors: [{ path: "screens[0].layout", message: "bad layout" }],
    });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    const file = pickFiles();

    expect(await screen.findByText("screens[0].layout: bad layout")).not.toBeNull();
    expect(runAgentImportMock).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({ existingStorageChars: expect.any(Number) }),
    );

    fireEvent.click(screen.getByRole("button", { name: /copy errors/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("screens[0].layout: bad layout"));

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByLabelText("Choose files")).not.toBeNull();
  });

  it("summarizes and creates a new project", async () => {
    const onClose = vi.fn();
    runAgentImportMock.mockResolvedValue({
      ok: true,
      project,
      warnings: [{ path: "exportSize", message: "platform mismatch" }],
    });
    render(<AgentImportModal isOpen onClose={onClose} />);
    pickFiles();

    expect(await screen.findByText("Habitly")).not.toBeNull();
    expect(screen.getByText("2 screens")).not.toBeNull();
    expect(screen.getByText("exportSize: platform mismatch")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /create new project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "new");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can replace the current project", async () => {
    runAgentImportMock.mockResolvedValue({ ok: true, project, warnings: [] });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();

    fireEvent.click(await screen.findByRole("button", { name: /replace current project/i }));
    expect(applyAgentImport).toHaveBeenCalledWith(project, "replace");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/components/AgentImport/AgentImportModal.test.tsx`
Expected: FAIL — cannot resolve `./AgentImportModal`.

- [ ] **Step 3: Wire the context**

In `src/context/EditorContext.tsx`:

1. Add after the `project-io` import block (~line 59):
```ts
import {
  replaceProjectContent,
  type AgentImportMode,
} from "../lib/agent-import/apply";
```

2. In `interface EditorContextType`, after `importProject: (file: File) => Promise<void>;` add:
```ts
  /** Apply a compiled agent import as a new project, or in place of the active one (undoable) */
  applyAgentImport: (project: Project, mode: AgentImportMode) => void;
```
and after `setIsShortcutsOpen: (open: boolean) => void;` add:
```ts
  isAgentImportOpen: boolean;
  setIsAgentImportOpen: (open: boolean) => void;
```

3. After `const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);` add:
```ts
  const [isAgentImportOpen, setIsAgentImportOpen] = useState(false);
```

4. After the `importProject` function add:
```ts
  // Apply an agent import. "new" appends and activates like importProject.
  // "replace" swaps the active project's content in place WITHOUT resetting
  // history, so a single undo restores the previous screenshots/defaults.
  // (Export size and selected device are not part of undo history.)
  const applyAgentImport = (compiled: Project, mode: AgentImportMode) => {
    const normalized = normalizeProject(compiled);
    if (mode === "new") {
      setProjects((prev) => [...prev, normalized]);
      activateProject(normalized);
      return;
    }

    const replaced = replaceProjectContent(activeProject, normalized);
    setSelectedDeviceIdState(replaced.selectedDeviceId);
    setSelectedColorIdState(replaced.selectedColorId);
    setExportSizeIdState(replaced.exportSizeId);
    setScreenshotsState(replaced.screenshots);
    setActiveScreenshotIdState(replaced.activeScreenshotId);
    setTextDefaultsState(replaced.textDefaults);
    setBackgroundDefaultsState(
      replaced.backgroundDefaults ?? { ...DEFAULT_BACKGROUND_SETTINGS },
    );
    setSavedColorsState(replaced.savedColors);
    setSelectedElement(null);
  };
```
(`updateProjectState` syncs this local state into the active project, keeping its id and name.)

5. In the provider `value`, after `importProject,` add `applyAgentImport,`; after `setIsShortcutsOpen,` add `isAgentImportOpen,` and `setIsAgentImportOpen,`.

Run: `bunx tsc --noEmit` → exit 0.

- [ ] **Step 4: Implement the modal**

Create `src/components/AgentImport/AgentImportModal.tsx`:

```tsx
/**
 * AgentImportModal
 *
 * Imports an agent-produced bundle (appshots.json + screenshots, as a folder,
 * files, or zip) as a polished project, and hands out the agent prompt and JSON
 * Schema so the whole workflow lives in one place.
 */

import { useRef, useState } from "react";
import { Bot, ClipboardCopy, Download, FolderOpen, Upload, X } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import {
  buildAgentPrompt,
  buildJsonSchema,
  filesFromDataTransfer,
  formatIssue,
  readImageFile,
  runAgentImport,
  type AgentImportMode,
  type ImportIssue,
} from "../../lib/agent-import";
import { useModalDismiss } from "../../lib/useModalDismiss";
import type { Project } from "../../types";

interface AgentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step =
  | { kind: "drop" }
  | { kind: "working" }
  | { kind: "errors"; errors: ImportIssue[] }
  | { kind: "summary"; project: Project; warnings: ImportIssue[] };

const createId = () => Math.random().toString(36).substring(2, 9);

const BUTTON =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const SECONDARY = `${BUTTON} border border-white/10 bg-input text-zinc-200 hover:bg-white/10`;
const PRIMARY = `${BUTTON} bg-violet-600 text-white hover:bg-violet-500`;

export const AgentImportModal = ({ isOpen, onClose }: AgentImportModalProps) => {
  const { projects, applyAgentImport } = useEditor();
  const modalRef = useRef<HTMLDivElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "drop" });
  const [copied, setCopied] = useState<"prompt" | "errors" | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const close = () => {
    setStep({ kind: "drop" });
    setCopied(null);
    onClose();
  };
  useModalDismiss({ isOpen, onClose: close, containerRef: modalRef });

  if (!isOpen) return null;

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setStep({ kind: "working" });
    try {
      const result = await runAgentImport(files, {
        readImage: readImageFile,
        generateId: createId,
        existingStorageChars: JSON.stringify(projects).length,
      });
      setStep(
        result.ok
          ? { kind: "summary", project: result.project, warnings: result.warnings }
          : { kind: "errors", errors: result.errors },
      );
    } catch (error) {
      setStep({
        kind: "errors",
        errors: [
          { path: "", message: error instanceof Error ? error.message : "Import failed." },
        ],
      });
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow picking the same files again
    void importFiles(files);
  };

  const copy = async (kind: "prompt" | "errors", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

  const downloadSchema = () => {
    const blob = new Blob([`${JSON.stringify(buildJsonSchema(), null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "appshots-import.schema.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const apply = (project: Project, mode: AgentImportMode) => {
    applyAgentImport(project, mode);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import from agent"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-section shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bot className="h-4 w-4 text-violet-400" />
            Import from agent
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close import from agent"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {step.kind === "drop" && (
            <>
              <section className="space-y-2">
                <h3 className="font-medium text-white">1. Give your agent the prompt</h3>
                <p className="text-zinc-400">
                  Paste it into an AI agent working in your app's repository. It writes{" "}
                  <code className="text-zinc-200">appshots.json</code> next to your screenshots.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY} onClick={() => copy("prompt", buildAgentPrompt())}>
                    <ClipboardCopy className="h-4 w-4" />
                    {copied === "prompt" ? "Copied" : "Copy agent prompt"}
                  </button>
                  <button type="button" className={SECONDARY} onClick={downloadSchema}>
                    <Download className="h-4 w-4" />
                    Download schema
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium text-white">2. Import the result</h3>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOver(false);
                    void filesFromDataTransfer(event.dataTransfer).then(importFiles);
                  }}
                  className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    isDragOver ? "border-violet-500 bg-violet-500/10" : "border-white/10"
                  }`}
                >
                  <Upload className="h-6 w-6 text-zinc-500" />
                  <p>
                    Drop the folder with <code className="text-zinc-200">appshots.json</code> and its
                    screenshots, or a zip of it
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={SECONDARY} onClick={() => folderInputRef.current?.click()}>
                      <FolderOpen className="h-4 w-4" />
                      Choose folder…
                    </button>
                    <button type="button" className={SECONDARY} onClick={() => filesInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      Choose files…
                    </button>
                  </div>
                </div>
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  accept=".json,.zip,image/png,image/jpeg,image/webp"
                  aria-label="Choose files"
                  className="hidden"
                  onChange={onPick}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  aria-label="Choose folder"
                  className="hidden"
                  onChange={onPick}
                  {...{ webkitdirectory: "" }}
                />
              </section>
            </>
          )}

          {step.kind === "working" && (
            <p role="status" className="py-8 text-center text-zinc-400">
              Reading bundle…
            </p>
          )}

          {step.kind === "errors" && (
            <section className="space-y-3">
              <p>AppShots couldn't import this bundle. Paste these back to your agent:</p>
              <ul className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                {step.errors.map((issue, index) => (
                  <li key={index}>
                    <code>{formatIssue(issue)}</code>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => copy("errors", step.errors.map(formatIssue).join("\n"))}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {copied === "errors" ? "Copied" : "Copy errors"}
                </button>
                <button type="button" className={SECONDARY} onClick={() => setStep({ kind: "drop" })}>
                  Try again
                </button>
              </div>
            </section>
          )}

          {step.kind === "summary" && (
            <section className="space-y-4">
              <div>
                <h3 className="font-medium text-white">{step.project.name}</h3>
                <p className="text-zinc-400">{step.project.screenshots.length} screens</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {step.project.screenshots.map((shot) => {
                  const src = shot.devices.find((d) => d.screenshotSrc)?.screenshotSrc;
                  return src ? (
                    <img key={shot.id} src={src} alt="" className="h-24 rounded border border-white/10" />
                  ) : (
                    <div key={shot.id} className="h-24 w-11 shrink-0 rounded border border-white/10 bg-input" />
                  );
                })}
              </div>
              {step.warnings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-amber-300">
                    {step.warnings.length} {step.warnings.length === 1 ? "warning" : "warnings"}
                  </h4>
                  <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                    {step.warnings.map((issue, index) => (
                      <li key={index}>{formatIssue(issue)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                <button type="button" className={`${PRIMARY} w-full justify-center`} onClick={() => apply(step.project, "new")}>
                  Create new project
                </button>
                <button type="button" className={`${SECONDARY} w-full justify-center`} onClick={() => apply(step.project, "replace")}>
                  Replace current project
                </button>
                <p className="text-xs text-zinc-500">
                  Replacing keeps the project's name. Undo restores the previous screenshots, but not
                  the export size.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Run the modal test to verify it passes**

Run: `bunx vitest run src/components/AgentImport/AgentImportModal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Add the menu entry and mount the modal**

In `src/components/ProjectSwitcher/ProjectSwitcher.tsx`:
1. Add `Bot,` to the `lucide-react` import list.
2. Add `setIsAgentImportOpen,` to the `useEditor()` destructure (after `importProject,`).
3. Directly before `{importError && (` insert:
```tsx
            <button
              onClick={() => {
                setIsAgentImportOpen(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Bot className="w-4 h-4" />
              Import from agent…
            </button>
```

In `src/components/EditorLayout.tsx`:
1. Add `import { AgentImportModal } from "./AgentImport/AgentImportModal";` after the `ShortcutsModal` import.
2. Add `isAgentImportOpen,` and `setIsAgentImportOpen,` to the `useEditor()` destructure.
3. After the `<ShortcutsModal … />` element add:
```tsx
        <AgentImportModal
          isOpen={isAgentImportOpen}
          onClose={() => setIsAgentImportOpen(false)}
        />
```

- [ ] **Step 7: Full test run, type-check, commit**

Run: `bun run test && bunx tsc --noEmit`
Expected: all tests PASS; tsc exit 0.

```bash
git add src/context/EditorContext.tsx src/components/AgentImport src/components/ProjectSwitcher/ProjectSwitcher.tsx src/components/EditorLayout.tsx
git commit -m "Add Import from agent modal with new/replace project

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 10: Verify in the running app, tune layouts, document

**Files:**
- Modify (only if tuning is needed): `src/lib/layout-presets.ts` text positions
- Modify: `CLAUDE.md`
- Create: `docs/agent-import/README.md`

**Interfaces:**
- Consumes: everything above. Produces no new code interfaces.

- [ ] **Step 1: Import the example bundle in the app**

Run: `bun run dev` and open http://localhost:5173 (use the `run` skill / browser automation if available).
Project menu → **Import from agent…** → **Choose folder…** → `docs/agent-import/example`.
Expected: summary "Habitly — App Store", "9 screens", thumbnails, **no warnings**. Click **Create new project**; the editor shows 9 screenshots.

- [ ] **Step 2: Check every layout visually**

For each screen, confirm: headline/subheadline don't overlap the device (especially `bleed-top`, text at y 80/88); highlighted words on screens 1 and 4 sit on the brand highlight `#ffd60a` in both the preview and the export; the yellow square badge on screen 1 sits top-right at about 18% of the canvas width; screen 6 is dark with light text; screen 9 shows two tilted devices.
If a layout's text collides with its device, adjust **only** that preset's `text` values in `src/lib/layout-presets.ts`, then run `bunx vitest run src/lib/layout-presets.test.ts src/lib/agent-import` (all PASS) and re-check.

- [ ] **Step 3: Compare export against preview**

Export (⌘/Ctrl+E). Open the PNGs for screens 1, 4 (`perspective`), 6 (`bleed-top`) and 9 (multi-device) next to the preview.
Expected: same device placement, text position, highlight and overlay. Any difference is a pre-existing pipeline bug — note it in the PR description; do not change `export-utils.ts` in this branch.

- [ ] **Step 4: Check replace, undo, errors and persistence**

1. Switch to another project → **Import from agent…** → choose the example folder → **Replace current project**. Expected: project name unchanged, content replaced. Press ⌘/Ctrl+Z once (after ~1 s): previous screenshots return.
2. Copy `docs/agent-import/example` to your scratchpad, change one screen's `"layout"` to `"diagonal"`, zip it, import the zip. Expected: error `screens[N].layout: …`; **Copy errors** puts it on the clipboard; **Try again** returns to the drop step.
3. Reload the page. Expected: imported projects are still there.
4. Click **Copy agent prompt**, paste into a text editor: the full brief with tables and the example JSON.

- [ ] **Step 5: Document for maintainers**

In `CLAUDE.md`, under "Adding a device", after the line `5. No component edits are needed for a normal iPhone/iPad/Galaxy/Pixel — data only.` add:

```md
6. Run `bun run gen:agent-docs` so the agent import prompt lists the new device (`prompt.test.ts` fails otherwise).
```

and insert this section immediately before `## Constraints & gotchas`:

```md
## Agent import

`src/lib/agent-import/` turns an agent-written `appshots.json` + screenshots into an ordinary `Project`: `bundle.ts` (files/folder/zip) → `schema.ts` (Zod) → `compile.ts`, orchestrated by `pipeline.ts` and surfaced by `components/AgentImport/AgentImportModal.tsx` (Project menu → Import from agent).

- `schema.ts` is the single source of truth for manifest types, validation errors and the published JSON Schema. Keep it free of `.transform()` (`z.toJSONSchema` can't represent transforms); normalize in `compile.ts`.
- `docs/agent-import/PROMPT.md`, `appshots-import.schema.json` and `example/appshots.json` are **generated**. After changing the schema, devices, fonts, brand styles, layout presets or export sizes, run `bun run gen:agent-docs`; `prompt.test.ts` fails on stale docs.
- Imported headline/subheadline HTML is untrusted — it must go through `sanitize.ts`.
- Layout presets live in `src/lib/layout-presets.ts`, shared with the editor's Position Presets panel (which applies only the device part).
```

Create `docs/agent-import/README.md`:

```md
# Agent import

Let an AI agent that knows your app's codebase produce a polished first version of your store screenshots.

1. In AppShots, open the Project menu → **Import from agent…** → **Copy agent prompt**.
2. Give the prompt to an agent working in your app's repository (Claude Code, etc.). It gathers your brand color, font and features, uses your captured screenshots, and writes `appshots.json` next to them.
3. Back in AppShots, drop that folder (or a zip of it) into the dialog. Review the summary and warnings, then **Create new project** or **Replace current project**.
4. Tweak anything in the editor and export.

Files here:

- `PROMPT.md` — the brief the agent receives (generated).
- `appshots-import.schema.json` — JSON Schema for `appshots.json` (generated).
- `example/` — a complete sample bundle with placeholder images (generated).

Regenerate after changing devices, fonts, styles, layouts, export sizes or the schema: `bun run gen:agent-docs`.
```

- [ ] **Step 6: Final gates**

Run: `bun run test`
Expected: all test files PASS (existing suite + 12 new files).

Run: `bun run build`
Expected: vite build succeeds and `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/agent-import/README.md src/lib/layout-presets.ts
git commit -m "Document agent import and tune layout text positions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

(If `layout-presets.ts` was not changed, `git add` simply skips it.)

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Zod v4 single source (types, validation, JSON Schema) | 2 |
| File format incl. backgrounds, shadows, overlays, `devices[]`, strict keys | 2, 5 |
| Basename, case-insensitive image matching; png/jpeg/webp | 5, 6 |
| HTML allowlist sanitizer; explicit `<mark>` color | 3, 5 |
| Layout presets shared with editor + text positions + descriptions | 1 |
| Precedence: defaults < style look < brand < layout < screen | 5 |
| Override bookkeeping (`textOverrides`, `backgroundOverride`) | 5 |
| Unknown device/color/font/export size fallbacks with warnings; platform mismatch | 4, 5 |
| Contrast, stripped HTML, unused image, ignored `device`, style-without-primary warnings | 5 |
| Storage-risk warning (shown first) | 2, 7 |
| Blocking errors with paths (JSON, schema, missing image, bundle problems) | 2, 5, 6, 7 |
| Folder / multi-file / zip input; folder drop traversal | 6, 9 |
| `normalizeProject` round-trip | 5, 9 |
| New project vs replace (single undo step) | 7, 9 |
| Modal: copy prompt, download schema, errors + copy, summary + thumbnails | 9 |
| Generated `PROMPT.md`, schema, example bundle; stale-docs test | 8 |
| Visual verification, preview vs export | 10 |
| CLAUDE.md + README | 10 |
| `bun run build` gate | 10 |

Note: the spec lists `parseManifest` under `index.ts`; it lives in `schema.ts` next to the schema and is re-exported where needed.

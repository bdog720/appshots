# Design: Agent import (config file + screenshots → polished project)

**Date:** 2026-09-15
**Status:** Approved (pending spec review)

## Problem

The brand guide gives a guided, human-driven way to set a look, but there is no
way for an AI agent to hand AppShots a complete, ready-to-polish screenshot set.
The intended workflow:

1. A user gives an AI agent (with context of *their app's* repo) a structured
   prompt copied from AppShots.
2. The agent captures screenshots (already automated in the user's repo) and
   writes an `appshots.json` next to them describing everything: brand colors,
   fonts, copy, device, layouts, per-screen tweaks.
3. The user drops that folder into AppShots and gets a fully polished v1 project
   they can keep tweaking in the editor.

The existing `.appshots.json` project export (`src/lib/project-io.ts`) is not
suitable for agents: it mirrors the internal `Project` model (internal ids,
`textOverrides` bookkeeping, percent coordinates with no guidance, base64 images).

## Goals

- A **semantic, agent-authorable** file format with **escape hatches**: agents
  express intent (brand, style preset, copy, device, layout preset) and may
  optionally pin exact values for anything.
- One source of truth for types, validation, JSON Schema, and the agent prompt,
  so none of them can drift from the app's live device/font/layout lists.
- Import via folder / multi-file / zip drop, with a summary step and a choice of
  **new project** or **replace current project** (undoable).
- Clear, path-addressed errors an agent can act on; non-blocking warnings.
- Agent prompt available three ways: in-app copy button, committed markdown in
  the repo, downloadable JSON Schema.

## Non-goals (v1)

- Multiple screenshot sets per file (iPhone + iPad + Android). One file = one
  project; the agent writes one file per set.
- Localization / multiple languages.
- Image backgrounds (`backgroundMode: "image"` exists in the type but has no
  implementation).
- Auto-fixing agent choices (e.g. contrast). Import honors explicit values and
  reports problems.
- Image downscaling for storage.
- Any change to rendering. Neither `DeviceFrame/` nor `export-utils.ts` changes,
  so the dual-pipeline rule is not triggered. (Layout presets gaining text
  positions is data, not rendering.)

## Dependency

Add `zod` v4 (`bun add zod`; latest is 4.6.x). The manifest schema is defined once in Zod; types
come from `z.infer`, validation from `safeParse` (with issue paths), and the
published JSON Schema from `z.toJSONSchema()`.

## File format (`appshots.json`, version 1)

```jsonc
{
  "$schema": "./appshots-import.schema.json",       // optional, ignored
  "format": "appshots-import",                      // required literal
  "version": 1,                                     // required literal
  "name": "Habitly — App Store",                    // optional; default "Imported Project"
  "exportSize": "6.9",                              // optional exportSizes id
  "brand": {                                        // optional
    "primary": "#5B5BD6",                           // hex; seeds the style preset
    "style": "bold",                                // brand-guide VIBES id
    "font": "Poppins",                              // googleFonts family
    "textColor": "#FFFFFF",
    "highlightColor": "#FFD60A",                    // background for <mark> in copy
    "headlineSize": 72,
    "subheadlineSize": 42,
    "background": { "type": "gradient", "from": "#5B5BD6", "to": "#3A3AA0" }
  },
  "device": {                                       // optional project device
    "id": "iphone-17-pro",
    "color": "cosmic-orange",
    "style": "flat",                                // "flat" | "3d"
    "shadow": true                                  // boolean | partial ShadowConfig
  },
  "screens": [                                      // required, ≥ 1
    {
      "image": "01-home.png",                       // exactly one of image | devices
      "headline": "Build habits <mark>that stick</mark>",   // required
      "subheadline": "Tiny daily wins, tracked for you",    // optional; default ""
      "layout": "bleed-bottom",                     // optional layout preset id
      "background": { "type": "solid", "color": "#111827" },
      "text": {
        "color": "#F9FAFB", "font": "Inter",
        "headlineSize": 68, "subheadlineSize": 40,
        "headline":    { "x": 50, "y": 8,  "width": 70 },
        "subheadline": { "x": 50, "y": 16, "width": 70 }
      },
      "device": {                                   // overrides for the single device
        "id": "…", "color": "…", "style": "3d",
        "x": 50, "y": 40, "scale": 64, "rotation": 12,
        "rotateX": 5, "rotateY": -20, "shadow": { "blur": 30 }
      },
      "devices": [                                  // escape hatch: full multi-device
        { "image": "03a.png", "x": 32, "y": 38, "scale": 55, "rotation": -8 }
      ],
      "overlays": [
        { "image": "badge.png", "x": 80, "y": 12, "width": 20,
          "layer": "front", "rotation": 0, "shadow": false }
      ]
    }
  ]
}
```

Rules:

- **Backgrounds** are a discriminated union:
  `{type:"solid", color}` · `{type:"gradient", from, to}` · `{type:"preset", id}`
  (id from `gradientPresets`).
- **Colors** are `#RGB` or `#RRGGBB` hex; normalized to lowercase `#rrggbb`.
- **Numbers** use the editor's existing units (percent positions/sizes, degrees,
  px font sizes) and are range-checked in the schema.
- **Screens** need a `headline` and **exactly one** of `image` / `devices`.
  `devices[]` entries inherit the project `device` (id/color/style/shadow) and
  may override any field; `image` in a `devices[]` entry is optional (empty
  device). `screens[].device` is ignored when `devices` is present (warning).
- **Overlays** use the same units as `ImageOverlay`: `x`/`y` are the image
  *center* in percent of the canvas (preview applies `translate(-50%, -50%)`),
  `width` is percent of canvas width. Agents do not give `height`; compile
  derives `height = width / imageAspect`, exactly as `addOverlayImage` does, so
  imported overlays behave identically to editor-added ones. Defaults:
  `x 50, y 50, width 30, layer "front", rotation 0`, shadow disabled (`true`
  enables the editor's default overlay shadow; an object patches it).
- **Image references** are matched by basename, case-insensitively
  (`"shots/01-Home.PNG"` matches `01-home.png`). Accepted types: png, jpeg, webp.
- **Headline/subheadline HTML** is sanitized to an allowlist: `b`, `strong`, `i`,
  `em`, `u`, `mark`, `br`, and `span` whose `style` contains only `color` /
  `background-color`. All attributes other than that `style` are dropped; other
  elements are unwrapped (text kept), `script`/`style` elements removed with
  content. Literal `\n` becomes `<br>`. This matches what `rich-text-canvas.ts`
  renders, keeping preview and export in agreement.
- **`<mark>` coloring:** every `<mark>` gets an explicit
  `style="background-color: …"` — `brand.highlightColor` if set, otherwise an
  accent derived from `brand.primary` chosen for contrast with the screen's text
  color. (Without this, `rich-text-canvas.ts` falls back to plain yellow.)

## Layout presets

Move the 8 presets out of `src/components/RightSidebar/PositionPresets.tsx` into
`src/lib/layout-presets.ts` (shared by the editor and the importer). Each preset
keeps its existing `device` settings and gains `text` positions:

| id | device (existing) | text (new, starting values) |
|----|-------------------|-----------------------------|
| `centered` | scale 65, y 35 | headline y 10, sub y 18 |
| `bleed-bottom` | scale 70, y 45 | headline y 10, sub y 18 |
| `bleed-top` | scale 70, y 15 | headline y 80, sub y 88 |
| `float-center` | scale 55, y 30 | headline y 10, sub y 18 |
| `tilt-left` | scale 60, y 35, rot -15 | headline y 10, sub y 18 |
| `tilt-right` | scale 60, y 35, rot 15 | headline y 10, sub y 18 |
| `perspective` | scale 60, y 35, 3d rotY -20 rotX 5 | headline y 10, sub y 18 |
| `float-bottom` | scale 50, y 50 | headline y 10, sub y 18 |

Text x is 50 for all. Values are tuned during visual verification. Each preset
also gets a one-line `description` used by the prompt. The editor's
`PositionPresets` component continues to apply only the `device` part (no
behavior change in the editor). Default layout when omitted: `bleed-bottom`.

## Architecture

New folder `src/lib/agent-import/` (pure, React-free):

| File | Responsibility |
|------|----------------|
| `schema.ts` | Zod schema (`importManifestSchema`), `ImportManifest` type, `IMPORT_FORMAT`, `IMPORT_VERSION`, `buildJsonSchema()`. Enum-like fields (layout, style, background preset) are `z.enum` built from the live lists; device id / color / font / export size are strings validated in `compile` (so unknowns become fallback warnings, not hard errors). |
| `bundle.ts` | `collectBundle(files: File[]) → Promise<{ manifestText, images: Map<lowercaseBasename, File> }>`. Unzips any `.zip` via `jszip` (already a dependency). Errors: no `appshots.json`, more than one, duplicate image basenames. Non-image, non-manifest files ignored. |
| `sanitize.ts` | `sanitizeRichText(html) → { html, stripped: boolean }` implementing the allowlist above, plus `applyHighlightColor(html, color)`. |
| `compile.ts` | `compileManifest({ manifest, images: Map<name, { dataUrl, width, height }>, generateId })` (pixel dimensions are decoded by the modal before compiling, so compile stays pure) ` → { project: Project, warnings: ImportWarning[] }`. Throws `ImportError` (with `path`) for blocking problems found after schema validation (missing image). |
| `warnings.ts` | `ImportWarning = { path: string; message: string }`, `ImportError`, and `estimateStorageSize()`. |
| `prompt.ts` | `buildAgentPrompt() → string` (markdown) from the schema + live lists. |
| `index.ts` | `parseManifest(text) → { ok: true, manifest } \| { ok: false, errors: {path, message}[] }` and re-exports. |

UI: `src/components/AgentImport/AgentImportModal.tsx` (+ small subcomponents as
needed), opened from a new **"Import from agent…"** item in `ProjectSwitcher`.
Uses `useModalDismiss`.

Context: `EditorContext` gains
`applyAgentImport(project: Project, mode: "new" | "replace")`.

Scripts: `scripts/gen-agent-docs.ts` (run with `bun run gen:agent-docs`) writes
`docs/agent-import/PROMPT.md` and `docs/agent-import/appshots-import.schema.json`.

## Compile: value precedence

Lowest → highest:

1. App defaults (`DEFAULT_TEXT_SETTINGS`, `DEFAULT_BACKGROUND_SETTINGS`,
   `createDeviceInstance` defaults).
2. `brand.style` + `brand.primary` via `generateBrandLook(primary, style)` → font,
   sizes, background, readable text color. If `style` is given without
   `primary`, a warning is raised and step 2 is skipped. If `primary` is given
   without `style`, the style defaults to `minimal`.
3. Explicit `brand.*` fields → project `textDefaults` / `backgroundDefaults`.
4. Screen `layout` preset (device settings + text positions).
5. Explicit per-screen fields.

Override bookkeeping, so the editor's default/override model keeps working:

- `screens[].background` → screen background + `backgroundOverride: true`;
  otherwise the screen inherits `backgroundDefaults` with `backgroundOverride: false`.
- `screens[].text.color/font/headlineSize/subheadlineSize/headline.width/subheadline.width`
  → set the value and add the matching `TextSettingKey` to `textOverrides`.
  `headline.x/y`, `subheadline.x/y` are plain screenshot fields.
- Project-level: `selectedDeviceId`/`selectedColorId` from `device`,
  `exportSizeId` from `exportSize`, `savedColors` seeded with the distinct brand
  colors (`primary`, `textColor`, `highlightColor`, background stops).

The compiled project is passed through `normalizeProject` (exported from
`EditorContext.tsx` or moved to a lib module if needed for import) so an imported
project is shape-identical to a hand-built one.

## Errors and warnings

**Blocking errors** (listed in the modal with paths, copyable as text to paste
back to the agent):

- Invalid JSON; `format`/`version` mismatch.
- Schema violations (Zod issue path + message), e.g.
  `screens[2].layout: expected one of centered, bleed-bottom, …`.
- `screens` empty; a screen with both or neither of `image` / `devices`.
- A referenced image not present in the bundle, or not png/jpeg/webp.
- Bundle problems: no manifest, multiple manifests, duplicate image basenames.

**Warnings** (import proceeds, shown in the summary):

- Unknown device id / device color / font / export size → nearest fallback
  (first device of the same platform per `device-platform.ts`; device's first
  color; `Inter`; `exportSizes[0]`), naming the fallback used.
- Device platform/size mismatch with the export size (e.g. iPhone device with an
  iPad export size).
- Headline/subheadline contrast failure (from `evaluateProjectContrast`).
- HTML stripped by the sanitizer.
- `brand.style` without `brand.primary`; `screens[].device` ignored because
  `devices` is present.
- Images in the bundle that no screen references.
- **Storage risk:** `estimateStorageSize()` (serialized current state + the new
  project's data URLs) exceeds a conservative budget (~4.5M characters). This is
  shown prominently, because `savePersistedState` only logs quota failures to
  the console — an oversized import would appear to work and then silently stop
  persisting.

## Import flow (UI)

1. **Drop** step: drop zone accepting a folder (via
   `DataTransferItem.webkitGetAsEntry()` recursive read), multiple files, or a
   `.zip`; plus a "Choose folder…" button (`<input webkitdirectory>`) and
   "Choose files…". Also on this step: **Copy agent prompt** and **Download
   schema** buttons.
2. **Processing:** `collectBundle` → `parseManifest` → read referenced images as
   data URLs and decode their pixel dimensions → `compileManifest`.
3. **Errors** step (if blocking): list of `path: message`, a "Copy errors" button,
   and "Try again".
4. **Summary** step: project name, screen count, thumbnail strip of the imported
   screen images, warnings list, and actions:
   - **Create new project** (primary): append project, activate it (same as
     `importProject`).
   - **Replace current project**: keep current project `id` and `name`; replace
     `screenshots`, `textDefaults`, `backgroundDefaults`, `savedColors`,
     `exportSizeId`, selected device/color in a single update. Undo history
     snapshots `screenshots/textDefaults/backgroundDefaults/savedColors`, so one
     ⌘Z restores those; the button's helper text notes export size is not
     restored by undo.

## Agent prompt

`buildAgentPrompt()` generates markdown (identical in-app and in
`docs/agent-import/PROMPT.md`) with these sections:

1. **Goal** — produce a polished, store-ready screenshot set (images +
   `appshots.json`) for this repository's app, importable into AppShots.
2. **Research the repo** — app name and value proposition (README,
   `fastlane/metadata`, `app.json`, store listing copy); brand colors (Tailwind
   config, theme files, `Assets.xcassets` color sets, `colors.xml`, Material
   theme); fonts (map to the nearest supported font).
3. **Screenshots** — use already-captured images; strongest "hero" feature first;
   one feature per screen; 5–10 screens; native device resolution.
4. **Copy rules** — headline 2–5 words (≤ ~28 chars), benefit-led, verb-first
   where natural; at most one `<mark>` per headline; subheadline optional,
   ≤ ~60 chars; consistent tone; no unverifiable claims; allowed HTML tags.
5. **Visual rules** — one `style` for the whole set; vary layouts with rhythm
   (e.g. hero `bleed-bottom`, then alternating tilts); keep one background unless
   deliberate; device must match export size; check text contrast.
6. **Reference tables (generated)** — styles with descriptions; layouts with
   descriptions; device ids and valid colors grouped by platform; supported fonts;
   export sizes; gradient preset ids.
7. **Output contract** — write `appshots.json` beside the images, bare filenames,
   validate against the JSON Schema, full worked example.
8. **Self-check** — every image referenced exists; every id comes from the tables;
   headline length; contrast; exactly one of `image`/`devices` per screen.

The schema download and `docs/agent-import/appshots-import.schema.json` both come
from `buildJsonSchema()`.

## Testing

TDD, colocated tests:

- `schema.test.ts` — minimal and full fixtures parse; failures yield expected
  paths (bad format/version, unknown layout, invalid hex, both/neither
  `image`/`devices`, out-of-range numbers).
- `sanitize.test.ts` — allowlist preserved; `<script>`, `onerror=`, `javascript:`
  URLs, `style="background:url(…)"`, unknown tags stripped (with `stripped: true`);
  `\n` → `<br>`; `applyHighlightColor` styles every `<mark>`.
- `compile.test.ts` — precedence order; override flags (`textOverrides`,
  `backgroundOverride`); every layout sets device and text positions; `<mark>`
  gets an explicit color; fallbacks produce warnings; missing image throws
  `ImportError` with path; multi-device and overlays; output is unchanged by
  `normalizeProject`; storage-size warning triggers above budget.
- `bundle.test.ts` — folder paths, multi-file, zip; case-insensitive basename
  matching; no/multiple manifests and duplicate basenames error.
- `layout-presets.test.ts` — ids unique; all presets carry device + text + description.
- `prompt.test.ts` — prompt contains every device id and color, layout, style,
  font, export size; committed `docs/agent-import/PROMPT.md` and
  `appshots-import.schema.json` equal freshly generated output (stale docs fail
  `bun run test`).
- `AgentImportModal.test.tsx` — drop → summary → "new" and "replace" call
  `applyAgentImport` with the right mode; errors render with paths; copy
  buttons.
- **Visual verification:** `docs/agent-import/example/` holds a sample bundle
  (placeholder PNGs + manifest using all 8 layouts, a multi-device screen, and an
  overlay). Import it in the running app, compare preview against exported PNGs,
  and tune the layout text positions.
- Gate: `bun run build`.

## Docs

- `CLAUDE.md`: add an "Agent import" note — the manifest schema lives in
  `src/lib/agent-import/schema.ts`; changing it, devices, fonts, styles, or
  layouts requires `bun run gen:agent-docs` (enforced by `prompt.test.ts`).
- `docs/agent-import/README.md`: short human guide to the workflow.

## Risks / open items for planning

- `normalizeProject` is module-private in `EditorContext.tsx`; it must be
  exported or extracted for `compile.test.ts`.
- Resolved during spec review: `constants.ts`, `google-fonts.ts`, `brand-guide.ts`
  and their imports are plain TS (type-only / lib imports, no asset imports), so
  `scripts/gen-agent-docs.ts` can run under Bun directly. `ImageOverlay` units
  confirmed (see Overlays rule).
- Note: `height = width / imageAspect` ignores canvas aspect, so on tall canvases
  the overlay's box is taller than the image. Both pipelines contain the image
  within that box (`object-contain` in preview; aspect-fit in
  `export-utils.ts`), so the image is not distorted and its rendered size is
  governed by `width`. Import matches the editor's existing behavior.
- Folder drop (`webkitGetAsEntry`) is not available in jsdom; bundle logic is
  tested with `File[]` inputs and the DOM traversal is kept thin.

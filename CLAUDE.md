# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A **client-only** SPA (React 19 + TypeScript + Vite, run with Bun) — a drag-and-drop editor for generating App Store / Play Store screenshots with realistic device frames. There is **no backend, no auth, and no network API**; all state persists to `localStorage`.

> The repo-root `AGENTS.md` is stale boilerplate from an unrelated JWT/auth template (TanStack Query/Form, an API client, protected routes). None of that exists here — ignore it.

## Commands

```bash
bun install                                         # install deps
bun run dev                                          # dev server → http://localhost:5173
bun run build                                        # vite build THEN tsc — build fails on any type error
bun run test                                         # full Vitest suite, once
bunx vitest run src/lib/device-overflow.test.ts      # single file
bunx vitest run -t "punch-hole"                       # by test name
bunx tsc --noEmit                                     # type-check only
```

Tests are Vitest + jsdom + Testing Library, colocated as `*.test.ts(x)`.

## Architecture

**State model:** `Project → Screenshot[] → DeviceInstance[]` (types in `src/types/index.ts`), owned by `src/context/EditorContext.tsx` — the single source of truth. Persistence is `src/lib/useLocalStorage.ts`. A `DeviceInstance` references a `DeviceSpec` by `deviceId` and carries its own image, color, transform, and 3D angles, so one screenshot holds multiple independently-styled devices.

**Two rendering pipelines that must stay pixel-identical** — this is the load-bearing fact of the codebase:

| Pipeline | Where | Purpose |
|----------|-------|---------|
| Live preview (DOM/CSS) | `src/components/DeviceFrame/` (`DeviceFrame.tsx` flat, `DeviceFrame3D.tsx`, `CameraElements.tsx`, `DeviceButtons.tsx`) | On-canvas editing |
| Export (Canvas 2D → PNG/ZIP) | `src/lib/export-utils.ts` | Downloaded screenshots |

`export-utils.ts` re-implements the frame, screen, camera cutout, buttons, and 3D perspective projection with raw canvas calls. **Any change to how a device looks must be made in both pipelines or the export diverges from the preview.** `EXPORT_EDGE_DEPTH` (export-utils) must equal `EDGE_DEPTH` (DeviceFrame3D). The same dual-implementation rule applies to rich text: `RichTextEditor/` (DOM) ↔ `src/lib/rich-text-canvas.ts` (canvas).

**Device data is declarative.** `src/constants.ts` holds `devices: DeviceSpec[]`, `gradientPresets`, and `exportSizes`. The picker (`LeftSidebar/DeviceSection.tsx`) just maps the array, so adding a device is mostly data.

**Camera/button style is inferred, not stored:**
- `src/lib/device-platform.ts` → `isAndroidDevice(id)` (`samsung-` / `pixel-` prefixes) and `isAndroidTablet(id)`. Android ⇒ punch-hole camera + right-side buttons; Apple ⇒ Dynamic Island/notch + iPhone buttons.
- `hasIsland` ⇒ Dynamic Island; else `notchWidth > 0` ⇒ notch; else no top cutout.

**Cross-screen overflow:** `src/lib/device-overflow.ts` computes a device dragged past a screenshot edge continuing into the neighbor; both preview and export render via `getRenderableDevicesForScreenshot`, so overflow survives export. `src/lib/device-instances.ts` normalizes legacy/older persisted shapes — keep it backward-compatible; real users have projects in `localStorage`.

## Adding a device (the common task)

1. Append a `DeviceSpec` to `devices` in `src/constants.ts`. The `id` prefix drives styling: `iphone-*` / `ipad-*` (Apple), `samsung-*` / `pixel-*` (Android), and any id containing `tab` is treated as a tablet.
2. Set `hasIsland` / `notchWidth` for the cutout. Use `width`/`height` at true pixel resolution — the frame is rendered from that aspect ratio.
3. Adding a **new Android brand** (not Samsung/Pixel) means broadening `ANDROID_PREFIXES` in `src/lib/device-platform.ts` — nothing else, thanks to the shared helper.
4. Optionally add an App Store submission size to `exportSizes`.
5. No component edits are needed for a normal iPhone/iPad/Galaxy/Pixel — data only.

## Constraints & gotchas

- ❌ Don't change a device's visuals in only one pipeline — preview and `export-utils.ts` must match.
- ❌ Don't break `device-instances.ts` normalization or bump persisted shapes without a migration — it silently corrupts saved user projects.
- ✅ Do run `bun run build` before claiming done; `tsc` is part of the build and gates type errors that `vitest` alone won't catch.
- ✅ Do keep camera/button logic flowing through `device-platform.ts` rather than re-adding inline `id.startsWith(...)` checks.

## Testing & workflow

- TDD is expected: write the failing test first (see `src/lib/*.test.ts`), watch it fail, then implement. Pure logic (platform detection, overflow math, device normalization, rich-text) is unit-tested; visual frame output is verified by running the app.
- Routing is file-based TanStack Router in `src/routes/`. Fonts load on demand via `src/lib/google-fonts.ts`; export awaits `document.fonts.ready`.

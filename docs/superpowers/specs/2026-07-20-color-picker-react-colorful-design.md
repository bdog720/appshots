# Design: Replace native color pickers with react-colorful

**Date:** 2026-07-20
**Status:** Approved (pending spec review)

## Problem

Both color pickers in the app use the native `<input type="color">`, which delegates
to the OS color dialog. The Windows and macOS default pickers are unfriendly —
especially for the common case of pasting or typing a hex code. We want a
consistent, in-app picker that makes hex entry fast, without building "the best
color picker ever."

Current call sites:

- `src/components/RightSidebar/SwatchColorInput.tsx` — native input + saved-swatch
  palette; used by `TextSection`, `BackgroundPicker`, `ShadowControls`,
  `BrandGuideSection` (all pass identical `value` / `onChange` / `label` props;
  none use `inputClassName`).
- `src/components/RichTextEditor/ColorPicker.tsx` — a toolbar button with a hidden
  native input and a color-indicator bar.

## Goals

- Replace the OS dialog with an in-app picker that has first-class hex entry.
- Keep the existing project-level saved-swatch palette; it should appear in both
  call sites.
- Add a native eyedropper button (screen color sampling) where the browser
  supports it.
- Low effort, fits the existing React 19 + Vite + Tailwind stack, follows current
  patterns (`useModalDismiss`, `FontPicker` popover/backdrop conventions).

## Non-goals

- Alpha / transparency. All picker values are 6-digit hex today and stay hex.
- Gradient editing (unchanged; `BackgroundPicker` keeps its gradient branch).
- Changing `saved-colors.ts` helpers or the `EditorContext` palette API.
- Any export-pipeline change. This is editing chrome only; `export-utils.ts` and
  the device frames are untouched, so the dual-pipeline rule does not apply.

## Dependency

Add `react-colorful` (`bun add react-colorful`): ~2.8KB gzipped, zero-dependency,
TypeScript-native, React 19 compatible. We use its `HexColorPicker` (saturation +
hue) and `HexColorInput` (validated hex text field).

## Architecture

New folder `src/components/ColorField/`:

| File | Responsibility |
|------|----------------|
| `ColorField.tsx` | Public, reusable component. Renders a trigger and owns popover open/close state. Props: `value: string`, `onChange: (color: string) => void`, `label?: string`, `showSavedColors?: boolean` (default `true`), `renderTrigger?: (args: { value: string; open: () => void; isOpen: boolean }) => ReactNode`. Default trigger is a color swatch button showing the current value. |
| `ColorPopover.tsx` | Popover contents: `<HexColorPicker>`, a hex row (`<HexColorInput>` + `EyedropperButton` + save-to-palette `+`), and the saved-swatch grid (reusing the existing swatch markup/behavior). Absolutely positioned near the trigger over a transparent full-viewport backdrop that captures outside-clicks (mirrors `FontPicker`'s backdrop dismissal). Uses `useModalDismiss` for Escape + focus restore. `role="dialog"`, `aria-label` from `label`. |
| `EyedropperButton.tsx` | Renders only when `window.EyeDropper` exists. On click, opens the native eyedropper and passes the sampled sRGBHex to `onChange`. |
| `useEyeDropper.ts` | Hook wrapping the EyeDropper API: `{ isSupported: boolean, open: () => Promise<string \| null> }`. Isolates the browser API so it is unit-testable with a mocked `window.EyeDropper`. Swallows the abort/cancel rejection and resolves `null`. |
| `constants.ts` | Shared Tailwind style strings matching the sidebar/toolbar look. |

The saved-swatch palette (`savedColors`, `addSavedColor`, `removeSavedColor` from
`EditorContext`, plus `saved-colors.ts` helpers) moves into `ColorPopover`, so both
call sites gain the palette. `saved-colors.ts` is unchanged.

## Data flow

1. Consumer renders `<ColorField value={color} onChange={setColor} label="…" />`.
2. Clicking the trigger opens `ColorPopover` (portal not required; absolute over a
   fixed transparent backdrop is sufficient and matches `FontPicker`).
3. Inside, `HexColorPicker`/`HexColorInput` call `onChange` with a normalized hex.
   The eyedropper and swatch clicks also call `onChange`.
4. `+` calls `addSavedColor(value)`; swatch `✕` calls `removeSavedColor(color)`.
5. Escape, backdrop click, or selecting a swatch closes the popover (focus returns
   to the trigger via `useModalDismiss`).

## Call-site changes

- Delete `SwatchColorInput.tsx`. Replace its 4 usages with `ColorField`
  (`value` / `onChange` / `label` map 1:1). Drop the unused `inputClassName` prop.
- `RichTextEditor/ColorPicker.tsx`: render `ColorField` with a `renderTrigger`
  that reproduces the palette-icon button + color-indicator bar, preserving the
  toolbar's `onMouseDown` focus-management behavior. `onChange` adapts from the
  input-event signature to `(color: string)`.
- `AppearanceSection.test.tsx` references `SwatchColorInput` only in a comment and
  exercises behavior through `BackgroundPicker`; it must still pass because
  `ColorField` preserves the saved-color-from-context behavior.

## Error handling / edge cases

- `window.EyeDropper` absent (Firefox/Safari): `EyedropperButton` renders nothing.
- Eyedropper cancelled (user hits Escape mid-sample): `open()` resolves `null`,
  no `onChange`, popover stays as-is.
- Invalid hex typed into `HexColorInput`: the library ignores it until valid; we
  do not fire `onChange` on invalid input.
- Popover positioning near the viewport edge: acceptable to open below-left of the
  trigger; refined offset is a visual-verification detail, not a correctness one.

## Testing

TDD, failing test first, for the logic and behavior that is unit-testable:

- `useEyeDropper`: `isSupported` false when `window.EyeDropper` undefined; `open()`
  resolves the sampled hex when supported; resolves `null` on abort.
- `ColorField` / `ColorPopover` (Testing Library):
  - trigger opens the popover; Escape and outside-click close it;
  - typing a valid hex calls `onChange`;
  - clicking a saved swatch calls `onChange` and closes;
  - `+` adds to palette, `✕` removes (via context);
  - eyedropper button absent when `window.EyeDropper` is undefined, present and
    wired when mocked.

The react-colorful saturation/hue drag surface is pointer-driven and is verified
by running the app, not unit-tested.

## Verification

- `bun run test` green (new + existing, including `AppearanceSection.test.tsx`).
- `bun run build` (vite + tsc) clean.
- Manual: run the app, confirm both call sites open the in-app picker, hex entry,
  eyedropper (Chromium), and saved swatches work, and that the preview updates.

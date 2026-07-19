# DESIGN.md

> The AppShots editor design system. Documents the current implementation and the intended token direction. Applies to the **editor chrome only** — never to the device-frame / export rendering pipelines, which are pixel-matched product output.

## Foundations

**Framework:** Tailwind CSS 4 (`@import "tailwindcss"` in `src/styles.css`), utility-first, no separate config file. Icons: `lucide-react`. React 19.

**Theme:** Dark only. `color-scheme: dark`. No light mode.

## Color

### Current state (as implemented)

Neutrals are hardcoded hex, layered darkest-to-lightest:

| Token role | Current value | Usage |
|---|---|---|
| App background (base) | `#0a0a0a` | EditorLayout, canvas |
| Panel / chrome surface | `#141414` | Left & right sidebars, toolbar |
| Section surface | `#1e1e1e` | Grouped sections, modals |
| Input / control surface | `#2a2a2a` | Inputs, rich-text editor, list items |
| Hover surface | `#333` | Interactive hover |
| Borders | `white/10` | Near-universal divider/border |

Text: `text-white` (primary), `text-gray-300/400` (secondary), `text-gray-500/600` (tertiary/disabled). **Note:** `gray` and `zinc` are used interchangeably — a real inconsistency to resolve.

Accents (currently three, uncoordinated):
- **Violet** (`violet-400/500/600`) — selection / active states (Position presets, Project switcher).
- **Blue** (`blue-400`, `blue-500/20`) — rich-text toolbar active state only.
- **Amber** (`amber-200/300`, `yellow-400`) — primary CTA accents, GitHub star / promo.

### Intended direction (token system)

- **Color strategy: Restrained** (product floor). One tinted-neutral ramp + a single interactive accent, with amber reserved strictly for the GitHub/open-source promo moment.
- **Consolidate the accent.** Violet is the brand hue (the default gradient, project switcher, selection). All *interactive/selected/focus* states should use violet — including the rich-text toolbar, which currently uses blue for no reason. Blue is retired.
- **Tint the neutrals toward the brand hue.** Pure `#0a0a0a` reads as dead black; neutrals should carry a faint cool/violet tint (OKLCH chroma ~0.005-0.01) so the whole chrome feels intentional rather than default-black. Never `#000` / `#fff`.
- **Define semantic state tokens** as CSS custom properties / Tailwind `@theme` so the ramp and accent live in one place: `--surface-base`, `--surface-panel`, `--surface-section`, `--surface-input`, `--surface-hover`, `--border-subtle`, `--accent`, `--accent-weak`, plus `--text-primary/secondary/tertiary`. Replace ad-hoc `bg-[#...]` and mixed gray/zinc with these.
- Semantic status colors: `red-400` (destructive), `green-400` (add/confirm) — keep, standardize.

## Typography

- **Font:** Inter (loaded in `index.html`), falling back to the system stack. One family carries the whole UI — correct for product register. (Google Fonts are loaded *into the artwork*, not the chrome.)
- **Scale (current):** `text-xs` labels, `text-sm` body/buttons, `text-base` modal body, `text-lg` sidebar headers, up to `text-3xl` for the export-modal title. Pragmatic, not a strict ramp.
- **Target:** tighten to a consistent product scale (ratio ~1.125-1.2 between steps). Section labels are consistently `text-xs font-medium uppercase tracking-wider` — keep that as the canonical label style.
- Weights: 400 body, 500 labels/buttons, 600 headers, 700 reserved for the one modal title.

## Spacing & radius

- **Spacing:** 4px base. Common `p-2/3/4/6`, `gap-2/3/4`, `space-y-4/6`. Sidebars use `p-4 space-y-4/6`.
- **Radius (current, inconsistent):** `rounded-md` (6px) controls, `rounded-lg` (8px) sections, `rounded-xl` (12px) cards/modals, `rounded-3xl` export modal, `rounded-full` pills/toggles. **Target:** a deliberate radius scale — `md` for controls, `lg` for panels/sections, `xl` for modals; pick one and stop mixing `xl`/`3xl` on peer modals.
- **Shadows:** `shadow-2xl` frames/modals, `shadow-lg` tooltips, plus custom brand shadows on the amber button and export modal. Keep custom shadows purposeful; avoid decorative glows.

## Components & states

Every interactive control needs default / hover / focus / active / disabled. Current gaps:
- **Focus-visible rings are largely absent** (inventory: "ring states mostly absent"). Add a consistent `focus-visible` treatment using the accent.
- **Native range sliders** are unstyled browser defaults — inconsistent across browsers, weak on dark. Custom-style the track/thumb with the accent.
- **Color-swatch row** (saved colors + `+`) recurs in Shadow, Text color, Background — keep it a single shared vocabulary.
- **Modals** (Font picker, GitHub star) must trap focus, close on Escape and backdrop click, and restore focus on close. (Escape currently does not close the Font picker.)

## Motion

- 150-250ms transitions, ease-out. Motion conveys state (hover, selection, reveal), never decoration. No orchestrated load sequences — the tool loads into a task.

## Hard boundaries (do not touch for design work)

- `src/components/DeviceFrame/*`, `src/lib/export-utils.ts`, `src/lib/rich-text-canvas.ts`, `src/lib/device-overflow.ts`, `src/lib/device-instances.ts`, `src/constants.ts` device specs — these are pixel-matched product output and persisted-data logic. Visual changes here would diverge preview from export or corrupt saved projects.

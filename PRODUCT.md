# PRODUCT.md

> Design context for AppShots. Derived from the codebase, README, and CLAUDE.md — not invented. Used by the `impeccable` design skill.

## Register

**product** — This is a tool. Design serves the task (composing App Store / Play Store screenshots), it is not the product itself. The interface should disappear into the work. The bar is *earned familiarity*: a user fluent in Figma, Linear, or Canva should sit down and trust every control immediately.

## Product purpose

A free, open-source, client-only web app for designing high-converting App Store and Google Play screenshots with realistic device frames. Drag-and-drop editor. No backend, no auth, no network API — everything persists to `localStorage`. Users upload their app screenshots, drop them into device mockups, add headlines/backgrounds/overlays, and batch-export store-ready PNGs.

## Users

- **Indie iOS / Android developers** shipping an app and needing store listing assets without hiring a designer or paying for Figma templates.
- **Small studios / solo marketers** producing a full localized screenshot set fast.
- Technically capable, design-literate enough to recognize a cheap tool. They compare this against paid tools (Previewed, AppLaunchpad, Screenshot.rocks) and against doing it by hand in Figma. If a control feels off, they leave.
- Primary flow is a focused, iterative editing session at a desktop, often working through 3-8 screenshots in one sitting.

## Brand & tone

- **Confident, quiet, craftsman.** The output (beautiful store screenshots) is the hero; the editor chrome stays out of the way. Restraint over flash.
- Developer-facing open-source project. Honest, direct, no marketing fluff in-product.
- The signature visual note is the **default purple/violet gradient** device backdrop users first see ("Showcase Your App"). Violet is the closest thing to a brand hue.
- Dark UI, always. This is a focused desktop editing tool used in long sessions; a dark canvas keeps attention on the colorful screenshot being composed and reduces eye strain. (Scene: an indie dev at their desk at night, iterating on store art before submitting a build.)

## Anti-references

- **Not a flashy marketing SaaS.** No hero-metric dashboards, no gradient text, no glassmorphism, no orchestrated load animations. This is a workspace.
- **Not a toy.** Controls must feel precise and trustworthy (sliders, color, typography) the way pro design tools do — not rounded-bubbly consumer cutesy.
- Not enterprise-cold either. It is an indie, open-source labor of love; a little warmth and personality at the edges (empty states, the export celebration) is welcome, but never at the expense of the task.

## Strategic principles

1. **The editor chrome is not the artwork.** The device frame + screenshot rendering pipelines (`DeviceFrame/`, `export-utils.ts`) are load-bearing and pixel-matched — treat them as product output, not UI to restyle. All design work targets the surrounding editor UI (sidebars, toolbar, controls, modals, empty/loading states).
2. **Consistency is an affordance.** One control vocabulary everywhere: the same slider, the same color-swatch row, the same section header, the same button hierarchy. A "save" or "add" that looks different in two places means one is wrong.
3. **Progressive disclosure over density dumping.** The right sidebar is long; group and collapse so a first-timer is not faced with 30 controls at once, while a power user can reach everything fast.
4. **Delight is saved for moments, not pages** — the post-export moment, an empty state — never sprinkled as decoration across the workspace.

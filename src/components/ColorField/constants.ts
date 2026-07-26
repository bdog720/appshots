/**
 * ColorField Constants
 *
 * Style constants shared across ColorField/ColorPopover/EyedropperButton,
 * matching the sidebar/toolbar look used elsewhere in RightSidebar.
 */

export const STYLES = {
  /** Default swatch trigger button */
  trigger:
    "h-8 w-8 shrink-0 rounded-md border border-white/10 cursor-pointer",

  /** Popover backdrop (transparent, captures outside-clicks) */
  backdrop: "fixed inset-0 z-[100]",

  /** Popover panel */
  popover:
    "absolute z-[101] mt-2 w-56 rounded-lg border border-white/10 bg-section p-3 shadow-2xl",

  /** Hex input row */
  hexInput:
    "w-full min-w-0 flex-1 rounded-md border border-white/10 bg-input px-2 py-1.5 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white",

  /** Icon button (eyedropper, save-to-palette) */
  iconButton:
    "shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-input text-zinc-300 hover:bg-raised hover:text-white",
} as const;

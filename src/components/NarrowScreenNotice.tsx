/**
 * NarrowScreenNotice
 *
 * AppShots is a desktop editor: two fixed sidebars plus a canvas need room to
 * work. Rather than let the three-column layout collapse into an unusable
 * squeeze on small viewports, this overlay covers the editor below the `lg`
 * breakpoint (1024px) with a clear, on-brand explanation.
 */

import { Monitor } from "lucide-react";

export const NarrowScreenNotice = () => (
  <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-base px-8 text-center lg:hidden">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent-bright">
      <Monitor className="h-8 w-8" />
    </div>
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-white">
        AppShots is a desktop editor
      </h1>
      <p className="mx-auto max-w-sm text-sm leading-6 text-zinc-400">
        Designing store screenshots needs room for the device canvas and its
        controls. Open AppShots on a screen at least 1024px wide to start
        editing.
      </p>
    </div>
  </div>
);

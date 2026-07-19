/**
 * CollapsibleGroup Component
 *
 * A titled, expand/collapse container used to group long selection lists
 * (device platforms, export stores) so the sidebar stays scannable.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface CollapsibleGroupProps {
  /** Group heading text */
  label: string;
  /** Optional count shown next to the label */
  count?: number;
  /** Whether the group starts expanded */
  defaultOpen?: boolean;
  /** Group content (revealed when expanded) */
  children: React.ReactNode;
}

/**
 * CollapsibleGroup - Expandable list group
 *
 * Manages its own open/closed state, seeded from `defaultOpen`.
 *
 * @example
 * <CollapsibleGroup label="iPhone" count={11} defaultOpen>
 *   ...buttons...
 * </CollapsibleGroup>
 */
export const CollapsibleGroup = ({
  label,
  count,
  defaultOpen = false,
  children,
}: CollapsibleGroupProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md bg-section">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm text-zinc-200 hover:text-white"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-zinc-400 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <span className="flex-1 font-medium">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-zinc-500">{count}</span>
        )}
      </button>
      {isOpen && <div className="px-2.5 pb-2.5 pt-0.5">{children}</div>}
    </div>
  );
};

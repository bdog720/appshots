/**
 * ShortcutsModal
 *
 * A keyboard-shortcut cheat sheet, opened by the "?" shortcut or the toolbar
 * help button. Reuses useModalDismiss for Escape/backdrop close and focus
 * handling, matching the app's other modals.
 */

import { useRef } from "react";
import { X } from "lucide-react";
import { useModalDismiss } from "../lib/useModalDismiss";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Ctrl / ⌘ + Z", label: "Undo" },
  { keys: "Ctrl / ⌘ + Shift + Z", label: "Redo" },
  { keys: "Delete / Backspace", label: "Remove the selected device or overlay" },
  { keys: "Ctrl / ⌘ + E", label: "Export screenshots" },
  { keys: "?", label: "Show this shortcuts list" },
];

export const ShortcutsModal = ({ isOpen, onClose }: ShortcutsModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ isOpen, onClose, containerRef: modalRef });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-section shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-white/5 px-5 py-2">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.label}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <span className="text-sm text-zinc-300">{shortcut.label}</span>
              <kbd className="shrink-0 rounded-md border border-white/10 bg-input px-2 py-1 text-xs font-medium text-zinc-200">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

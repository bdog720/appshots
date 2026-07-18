/**
 * Toolbar Component
 *
 * Top toolbar for the canvas preview area with screenshot management controls.
 */

import { Plus, Redo2, Undo2 } from "lucide-react";
import { useEditor } from "../../context/EditorContext";

interface ToolbarProps {
  /** Callback to add a new screenshot */
  onAddScreenshot: () => void;
  /** Total number of screenshots */
  screenshotCount: number;
}

/**
 * Toolbar - Canvas top toolbar with controls
 *
 * Displays undo/redo, the "Add Screenshot" button, and the screenshot count.
 */
export const Toolbar = ({ onAddScreenshot, screenshotCount }: ToolbarProps) => {
  const { undo, redo, canUndo, canRedo } = useEditor();

  return (
    <div className="h-14 border-b border-white/10 bg-panel flex items-center px-4 gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl/⌘+Z)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl/⌘+Shift+Z)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="h-5 w-px bg-white/10" />

      <button
        onClick={onAddScreenshot}
        className="flex items-center gap-1.5 bg-white hover:bg-zinc-200 text-black text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Screenshot
      </button>

      <div className="flex-1" />
      <span className="text-xs text-zinc-400">
        {screenshotCount} screenshot{screenshotCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
};

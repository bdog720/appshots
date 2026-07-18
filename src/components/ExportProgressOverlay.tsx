/**
 * ExportProgressOverlay
 *
 * Shown while a batch export is running. The export loop reports progress
 * between screenshots (see export-utils `onProgress`), giving feedback during
 * what can otherwise be a long, silent operation.
 */

import { Loader2 } from "lucide-react";
import { useEditor } from "../context/EditorContext";

export const ExportProgressOverlay = () => {
  const { exportProgress } = useEditor();
  if (!exportProgress) return null;

  const { rendered, total } = exportProgress;
  const fraction = total > 0 ? rendered / total : 0;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-section p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent-bright" />
          <div>
            <p className="text-sm font-medium text-white">
              Exporting screenshots
            </p>
            <p className="text-xs text-zinc-400">
              {rendered} of {total} rendered
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-raised">
          <div
            className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </div>
    </div>
  );
};

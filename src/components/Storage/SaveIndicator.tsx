/** Save status for the current session: unsaved, saving, saved, failed or in conflict. */

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { BROWSER_STORAGE_FULL_MESSAGE } from "../../lib/storage/browser-storage";
import type { StorageMode } from "../../lib/storage/types";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const formatSavedAt = (at: number | null, now: number): string => {
  if (at === null) return "Saved";
  const age = now - at;
  if (age < MINUTE) return "Saved · just now";
  if (age < HOUR) return `Saved · ${Math.floor(age / MINUTE)} min ago`;
  return `Saved · ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

const BUTTON =
  "rounded-md px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent";

export const SaveIndicator = ({
  status,
  storageMode,
  onSaveNow,
  onRetry,
  onOpenHistory,
  now = Date.now,
}: {
  status: SaveStatus;
  storageMode: StorageMode;
  onSaveNow: () => void;
  onRetry: () => void;
  onOpenHistory: () => void;
  now?: () => number;
}) => {
  // Re-render periodically so "just now" ages.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const where = storageMode === "server" ? "Projects are saved in the container" : "Projects are saved in this browser";

  let dot = "bg-emerald-500";
  let label = "";
  let title = where;
  // Set only for a browser-mode error: a tooltip alone isn't visible on touch
  // and isn't reliably announced, and the user needs to act (free up space).
  let visibleDetail: string | null = null;
  let detailHint: string | null = null;
  switch (status.kind) {
    case "dirty":
      dot = "bg-amber-400";
      label = "Unsaved changes";
      break;
    case "saving":
      dot = "bg-zinc-400 animate-pulse";
      label = "Saving…";
      break;
    case "saved":
      label = formatSavedAt(status.at, now());
      break;
    case "error":
      dot = "bg-red-500";
      label = "Couldn't save";
      title = status.message;
      if (storageMode === "browser") {
        visibleDetail = status.message;
        // The shared constant is the primary match; the loose pattern is a
        // fallback in case a differently-worded quota error slips through.
        if (status.message === BROWSER_STORAGE_FULL_MESSAGE || /full/i.test(status.message)) {
          detailHint = "Delete or shrink a project to free up space.";
        }
      }
      break;
    case "conflict":
      dot = "bg-red-500";
      label = "Changed elsewhere";
      break;
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-400">
      {/*
       * One live region for the whole message: the label, the detail and the
       * hint are announced together as a single coherent update. Splitting
       * the detail into its own unlabelled block (as an earlier version did)
       * meant a tooltip-averse detail was visible but never announced.
       */}
      <div role="status" aria-live="polite" title={title} className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </span>
        {visibleDetail && (
          <span className="truncate pl-3.5 text-[11px] text-red-300">
            <span>{visibleDetail}</span>
            {detailHint && <> — <span>{detailHint}</span></>}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        {status.kind === "error" && (
          <button type="button" className={BUTTON} onClick={onRetry}>
            Retry
          </button>
        )}
        <button
          type="button"
          className={BUTTON}
          onClick={onSaveNow}
          disabled={status.kind === "saving" || status.kind === "conflict"}
        >
          Save now
        </button>
        {storageMode === "server" && (
          <button type="button" className={BUTTON} onClick={onOpenHistory} aria-label="Version history">
            <History className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
};

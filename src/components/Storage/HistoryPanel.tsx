/** Side panel listing saved versions of the active project, with restore. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, X } from "lucide-react";
import type { HistoryVersion } from "../../lib/storage/types";
import { useModalDismiss } from "../../lib/useModalDismiss";

export const formatVersionTime = (savedAt: number, now: number): string => {
  const date = new Date(savedAt);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};

const BUTTON =
  "rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50";

export const HistoryPanel = ({
  isOpen,
  projectId,
  onClose,
  loadHistory,
  onRestore,
  now = Date.now,
}: {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  loadHistory: () => Promise<HistoryVersion[]>;
  onRestore: (version: string) => Promise<void>;
  now?: () => number;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // The context recreates loadHistory on every render, so it's read through a
  // ref rather than made a dependency — otherwise the panel would reload on
  // every keystroke elsewhere in the editor.
  const loadRef = useRef(loadHistory);
  loadRef.current = loadHistory;
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useModalDismiss({ isOpen, onClose, containerRef: panelRef });

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setVersions(null);
    setError(null);
    setConfirming(null);
    loadRef
      .current()
      .then((loaded) => {
        if (active) setVersions(loaded);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Couldn't load history");
      });
    return () => {
      active = false;
    };
    // Reload only when the panel opens or the project changes; reloadKey
    // drives an explicit "Try again" retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, reloadKey]);

  if (!isOpen) return null;

  const restore = async (version: string) => {
    setRestoring(true);
    setError(null);
    try {
      await onRestore(version);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't restore this version");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-section shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Version history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {error && (
            <div role="alert" className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
              <p>{error}</p>
              {versions === null && (
                <button type="button" className={BUTTON} onClick={reload}>
                  Try again
                </button>
              )}
            </div>
          )}

          {versions === null && !error && <p role="status">Loading versions…</p>}

          {versions?.length === 0 && <p>No versions yet. Versions are saved as you work.</p>}

          {versions && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((entry) => (
                <li key={entry.version} className="rounded-lg border border-white/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-1.5 text-zinc-200">
                        {entry.pinned && (
                          <span aria-label="Pinned">
                            <Pin className="h-3 w-3 text-violet-400" aria-hidden="true" />
                          </span>
                        )}
                        <span>
                          {formatVersionTime(entry.savedAt, now())} · {entry.screenCount}{" "}
                          {entry.screenCount === 1 ? "screen" : "screens"}
                        </span>
                      </p>
                      {entry.firstHeadline && <p className="truncate text-xs text-zinc-400">“{entry.firstHeadline}”</p>}
                      {entry.label && <p className="text-xs text-zinc-500">{entry.label}</p>}
                    </div>
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={restoring}
                      onClick={() => setConfirming(entry.version)}
                    >
                      Restore
                    </button>
                  </div>
                  {confirming === entry.version && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs">
                      <p>Replace current content with this version? Your current state is saved to history first.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}
                          disabled={restoring}
                          onClick={() => void restore(entry.version)}
                        >
                          Restore this version
                        </button>
                        <button type="button" className={BUTTON} disabled={restoring} onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

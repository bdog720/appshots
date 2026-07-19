import { useCallback, useEffect, useRef, useState } from "react";
import {
  type History,
  canRedo,
  canUndo,
  initHistory,
  record,
  redo,
  undo,
} from "./history";

interface UseSnapshotHistoryParams<T> {
  /** The current snapshot value (may be rebuilt every render). */
  value: T;
  /**
   * Change-detection dependencies. Recording is scheduled when any of these
   * change; use the underlying state values (stable references) rather than a
   * freshly-built `value` object so unrelated re-renders don't record.
   */
  deps: unknown[];
  /** Restore a snapshot into application state (undo/redo call this). */
  apply: (snapshot: T) => void;
  /** How long the state must be stable before a snapshot is recorded. */
  debounceMs?: number;
  /** Maximum number of undo steps retained. */
  limit?: number;
}

interface SnapshotHistoryApi<T> {
  undo: () => void;
  redo: () => void;
  /** Discard history and start fresh from `value` (e.g. on project switch). */
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Debounced undo/redo over application snapshots. Rapid changes (a drag, a
 * slider sweep, a burst of typing) coalesce into a single history entry because
 * a snapshot is only recorded once the tracked state has been stable for
 * `debounceMs`. Undo/redo restore snapshots via `apply` and suppress the
 * re-render they cause from being recorded as new history.
 */
export function useSnapshotHistory<T>({
  value,
  deps,
  apply,
  debounceMs = 500,
  limit = 50,
}: UseSnapshotHistoryParams<T>): SnapshotHistoryApi<T> {
  const historyRef = useRef<History<T> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const isRestoringRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const flushPending = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (historyRef.current) {
      historyRef.current = record(historyRef.current, valueRef.current, limit);
    }
  }, [limit]);

  useEffect(() => {
    if (historyRef.current === null) {
      historyRef.current = initHistory(valueRef.current);
      return;
    }
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const current = historyRef.current;
      if (!current) return;
      const next = record(current, valueRef.current, limit);
      if (next !== current) {
        historyRef.current = next;
        bump();
      }
    }, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Clear any pending timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const doUndo = useCallback(() => {
    flushPending();
    const current = historyRef.current;
    if (!current || !canUndo(current)) return;
    const next = undo(current);
    historyRef.current = next;
    isRestoringRef.current = true;
    applyRef.current(next.present);
    bump();
  }, [flushPending, bump]);

  const doRedo = useCallback(() => {
    flushPending();
    const current = historyRef.current;
    if (!current || !canRedo(current)) return;
    const next = redo(current);
    historyRef.current = next;
    isRestoringRef.current = true;
    applyRef.current(next.present);
    bump();
  }, [flushPending, bump]);

  const reset = useCallback(
    (nextValue: T) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      historyRef.current = initHistory(nextValue);
      // The state change that accompanies a reset (e.g. switching projects)
      // is the reset settling in, not an edit to record.
      isRestoringRef.current = true;
      bump();
    },
    [bump],
  );

  const current = historyRef.current;
  return {
    undo: doUndo,
    redo: doRedo,
    reset,
    canUndo: current ? canUndo(current) : false,
    canRedo: current ? canRedo(current) : false,
  };
}

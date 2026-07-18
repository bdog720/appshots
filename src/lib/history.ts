/**
 * Generic undo/redo history over immutable snapshots.
 *
 * `past` holds prior presents (oldest first), `present` is current, `future`
 * holds undone presents (next-to-redo first). Pure and value-agnostic so it can
 * be unit-tested in isolation and reused for any snapshot type.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const DEFAULT_LIMIT = 50;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/**
 * Commit a new present. The previous present moves onto the past and the redo
 * future is cleared. A record equal (by identity) to the current present is a
 * no-op, so coalesced/idempotent updates don't create empty history steps. The
 * past is capped at `limit`, dropping the oldest entries.
 */
export function record<T>(
  history: History<T>,
  next: T,
  limit = DEFAULT_LIMIT,
): History<T> {
  if (next === history.present) return history;

  const past = [...history.past, history.present];
  const trimmed =
    past.length > limit ? past.slice(past.length - limit) : past;

  return { past: trimmed, present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;

  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;

  const [next, ...future] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future,
  };
}

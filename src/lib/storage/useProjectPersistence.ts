/**
 * Saving for the editor: debounced autosave, a visible save status, Save now,
 * conflict handling and an unload guard — over any ProjectStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../../types";
import { isEmptyPlan, planSave, snapshotOf, type SavedSnapshot } from "./save-plan";
import { StorageError, isServerStorage, type ProjectStorage } from "./types";

export const AUTOSAVE_DELAY_MS = 1000;
export const SAVE_NOW_LABEL = "Saved";

export type SaveStatus =
  | { kind: "saved"; at: number | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

/**
 * A project whose save lost a race with another tab or device. Carried apart
 * from SaveStatus on purpose: the banner that resolves it reads this, so the
 * status is free to report whatever actually just happened — including a
 * sibling project's failed save — instead of having to lie to keep the banner
 * on screen.
 */
export interface SaveConflict {
  kind: "conflict";
  projectId: string;
  revision: number;
  savedAt: number;
}

export interface ProjectPersistence {
  status: SaveStatus;
  /** The conflict to ask about. Every conflicted project is held back from saving. */
  conflict: SaveConflict | null;
  saveNow(): Promise<void>;
  retry(): Promise<void>;
  keepMine(): Promise<void>;
  /**
   * Treat this exact copy of one project as the saved one — used after the
   * editor loads another version. Deliberately per-project: marking the whole
   * editor saved would swallow a sibling whose save never went out.
   */
  markSaved(project: Project): void;
}

const messageOf = (error: unknown): string =>
  error instanceof StorageError ? error.message : "Couldn't save";

export function useProjectPersistence(options: {
  storage: ProjectStorage;
  projects: Project[];
  activeProjectId: string;
  initialProjects: Project[];
  initialActiveProjectId: string;
  delayMs?: number;
  now?: () => number;
}): ProjectPersistence {
  const { storage, projects, activeProjectId } = options;
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
  // Held in a ref so an inline `now` doesn't recreate callbacks every render.
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const now = useCallback(() => nowRef.current(), []);

  const savedRef = useRef<SavedSnapshot | null>(null);
  savedRef.current ??= snapshotOf(options.initialProjects, options.initialActiveProjectId);
  const baseline = () => savedRef.current as SavedSnapshot;
  const latestRef = useRef({ projects, activeProjectId });
  latestRef.current = { projects, activeProjectId };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  /**
   * Every project whose save lost a race, in the order it happened. All of them
   * are held back from saving: a 409 resyncs this client's tracked revision, so
   * a conflicted project that wasn't held would match on its very next save and
   * land on top of the other writer — no banner, no prompt, no pinPrevious.
   * Only the first is shown.
   */
  const conflictsRef = useRef<Map<string, SaveConflict>>(new Map());
  /** Bumped whenever the baseline is resolved out from under a running pass. */
  const generationRef = useRef(0);
  /**
   * Ids to re-send even though the baseline matches. Kept apart from the
   * baseline because that map also answers "does this project still exist?":
   * dropping a key to force a save would drop it from delete detection too.
   */
  const forceSaveRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: null });
  const [conflict, setConflict] = useState<SaveConflict | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** The one on display: the oldest conflict still held. */
  const heldConflict = (): SaveConflict | null => conflictsRef.current.values().next().value ?? null;

  // The stored object is reused, so React bails out when nothing changed.
  const syncConflict = () => setConflict(heldConflict());

  const holdConflict = (projectId: string, found: { revision: number; savedAt: number }) => {
    conflictsRef.current.set(projectId, { kind: "conflict", projectId, ...found });
    syncConflict();
  };

  /**
   * Stop holding a project back. If it no longer exists in the editor, its
   * baseline entry goes too: that entry is what would plan a delete, and
   * resolving a conflict must never delete the copy the other writer saved.
   */
  const releaseConflict = (projectId: string) => {
    conflictsRef.current.delete(projectId);
    if (!latestRef.current.projects.some((project) => project.id === projectId)) {
      baseline().projects.delete(projectId);
    }
    syncConflict();
  };

  const hasChanges = () =>
    !isEmptyPlan(
      planSave(
        baseline(),
        latestRef.current.projects,
        latestRef.current.activeProjectId,
        forceSaveRef.current,
      ),
    );

  /**
   * One storage pass at a time. The handshake: `task()` runs synchronously to
   * its first await, so this call assigns `inFlightRef` and registers `await
   * run` before any queued waiter can resume — which means the owner's
   * `finally` always clears the ref before a waiter re-checks the loop.
   */
  const runExclusive = useCallback(async (task: () => Promise<void>): Promise<void> => {
    // Swallow a previous caller's failure: waiting on it must not reject here.
    while (inFlightRef.current) await inFlightRef.current.catch(() => undefined);
    const run = task();
    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  const runFlush = useCallback(
    async (pinActive: boolean): Promise<void> => {
      // A pass the user has since resolved (markSaved/keepMine) must not write
      // status, re-open a settled conflict, or advance a baseline it no longer owns.
      const generation = generationRef.current;
      const superseded = () => generationRef.current !== generation;
      // planSave and the status writes sit inside the try as well: a throw out
      // here would reject through runExclusive and flush into the un-awaited
      // `void flush()` as an unhandled rejection.
      try {
        const saved = baseline();
        const { projects: current, activeProjectId: active } = latestRef.current;
        // A force left over for a project that has since been deleted would
        // otherwise keep the editor dirty forever.
        const present = new Set(current.map((project) => project.id));
        for (const id of forceSaveRef.current) if (!present.has(id)) forceSaveRef.current.delete(id);
        const plan = planSave(saved, current, active, forceSaveRef.current);
        // A conflict holds back its own project, not the editor: the siblings
        // keep saving, because stopping them leaves their edits in this tab
        // only with nothing on screen saying so.
        const held = conflictsRef.current;
        const toSave = plan.save.filter((project) => !held.has(project.id));
        // Deleting a held project would discard the other side's version
        // without asking, which is what the banner exists to prevent. It goes
        // out once the user resolves the conflict.
        const toRemove = plan.remove.filter((id) => !held.has(id));
        const forcePin = pinActive && isServerStorage(storage);
        const activeProject = current.find((project) => project.id === active);
        if (forcePin && activeProject && !held.has(active) && !toSave.some((project) => project.id === active)) {
          toSave.push(activeProject);
        }
        if (toSave.length === 0 && toRemove.length === 0 && !plan.meta) {
          // hasChanges() ignores the hold, which keeps this honest: nothing
          // could be sent, but a held project still has unsaved changes.
          setStatus((previous) => {
            if (hasChanges()) return previous.kind === "dirty" ? previous : { kind: "dirty" };
            return previous.kind === "saved" ? previous : { kind: "saved", at: now() };
          });
          return;
        }

        setStatus({ kind: "saving" });
        for (const project of toSave) {
          const result = await storage.saveProject(
            project,
            forcePin && project.id === active ? { pin: true, label: SAVE_NOW_LABEL } : {},
          );
          if (superseded()) return;
          if (!result.ok) {
            // Hold it — every conflicted project is held, whether or not it's
            // the one shown — and carry on with the projects that aren't.
            holdConflict(project.id, result.conflict);
            continue;
          }
          // Baseline advances only for the projects that actually saved.
          saved.projects.set(project.id, project);
          forceSaveRef.current.delete(project.id);
        }
        for (const id of toRemove) {
          await storage.deleteProject(id);
          if (superseded()) return;
          saved.projects.delete(id);
        }
        if (plan.meta) {
          const order = current.map((project) => project.id);
          await storage.saveMeta(active, order);
          if (superseded()) return;
          saved.activeProjectId = active;
          saved.order = order;
        }
        setStatus(hasChanges() ? { kind: "dirty" } : { kind: "saved", at: now() });
      } catch (error) {
        if (superseded()) return;
        setStatus({ kind: "error", message: messageOf(error) });
      }
    },
    [storage, now],
  );

  const flush = useCallback(
    async (pinActive = false): Promise<void> => {
      clearTimer();
      await runExclusive(() => runFlush(pinActive));
    },
    [runExclusive, runFlush],
  );

  /** Returns the handle, so a caller can tell its own timer from a later one. */
  const scheduleFlush = () => {
    clearTimer();
    const handle = setTimeout(() => {
      void flush();
    }, delayMs);
    timerRef.current = handle;
    return handle;
  };

  /**
   * Best-effort write while the page or the editor goes away. Returns whether
   * there was anything to write.
   */
  const writeBeforeTeardown = (): boolean => {
    const { projects: current, activeProjectId: active } = latestRef.current;
    const plan = planSave(baseline(), current, active, forceSaveRef.current);
    if (isEmptyPlan(plan)) return false;
    if (isServerStorage(storage)) {
      // The keepalive API takes whole projects only, so removals and order
      // settle on the next load instead.
      for (const project of plan.save) {
        // A live conflict means the server (or another tab/user) holds a
        // version this tab has never seen; closing the tab must not let this
        // keepalive save silently pick a winner. Pin the copy it's about to
        // overwrite so neither is lost — the conflict UI is exactly what
        // would otherwise let the user choose between them. Scoped to the
        // conflicted project only, so an ordinary unload doesn't consume a
        // pinned-retention slot for nothing.
        if (conflictsRef.current.has(project.id)) {
          storage.saveProjectOnUnload(project, { pinPrevious: true });
        } else {
          storage.saveProjectOnUnload(project);
        }
      }
      return true;
    }
    // BrowserStorage writes before its first await, so these land synchronously.
    for (const project of plan.save) void storage.saveProject(project).catch(() => undefined);
    for (const id of plan.remove) void storage.deleteProject(id).catch(() => undefined);
    if (plan.meta) {
      void storage.saveMeta(active, current.map((project) => project.id)).catch(() => undefined);
    }
    return true;
  };
  // Effects below run once, so they reach the current writer through a ref.
  const teardownRef = useRef(writeBeforeTeardown);
  teardownRef.current = writeBeforeTeardown;

  // Autosave: mark dirty right away, save after a quiet period.
  useEffect(() => {
    if (!hasChanges()) {
      // Nothing is pending. Usually that means markSaved replaced the baseline
      // before React re-rendered with the loaded copy, so it had to report
      // dirty against a copy that is now gone — settle it here rather than
      // leaving "Unsaved changes" on screen with nothing to save, and rather
      // than asking every caller to land its state update first.
      // No `at`: the content matches storage, but no write happened in this
      // tick, so this must read "Saved" and not "Saved · just now".
      setStatus((previous) => (previous.kind === "dirty" ? { kind: "saved", at: null } : previous));
      return;
    }
    // Return the same object when already dirty/saving so this doesn't re-render in a loop.
    setStatus((previous) => (previous.kind === "saving" || previous.kind === "dirty" ? previous : { kind: "dirty" }));
    const scheduled = scheduleFlush();
    // Only this effect's own timer: markSaved may have armed a later one, and
    // cancelling that would strand the re-send it scheduled.
    return () => {
      if (timerRef.current === scheduled) clearTimer();
    };
  }, [projects, activeProjectId, delayMs, flush]);

  // Unmounting mid-debounce would drop up to delayMs of edits, and the unload
  // listener goes away in this same pass — so write what's pending here.
  useEffect(
    () => () => {
      clearTimer();
      teardownRef.current();
    },
    [],
  );

  // Unload guard.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const pending = teardownRef.current();
      if (!pending && !inFlightRef.current) return;
      // Browser storage has already written synchronously; only a server save
      // needs the extra moment the prompt buys.
      if (!isServerStorage(storage)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [storage]);

  const saveNow = useCallback(() => flush(true), [flush]);
  const retry = useCallback(() => flush(false), [flush]);

  const keepMine = useCallback(async () => {
    const pending = heldConflict();
    if (!pending) return;
    let failure: unknown;
    // Serialized like any other pass, so a double click can't send two saves
    // against the same baseRevision.
    await runExclusive(async () => {
      const current = heldConflict();
      if (!current) return;
      const mine = latestRef.current.projects.find((project) => project.id === current.projectId);
      if (!mine) {
        // Deleted in this tab while the banner was up, so there is no copy to
        // keep. Releasing the hold drops the baseline entry with it, so the
        // delete it would otherwise plan never goes out: a button labelled
        // "Keep mine" must not turn into "delete theirs".
        releaseConflict(current.projectId);
        generationRef.current += 1;
        return;
      }
      setStatus({ kind: "saving" });
      try {
        const result = await storage.saveProject(mine, {
          baseRevision: current.revision,
          pinPrevious: true,
        });
        if (!result.ok) {
          holdConflict(mine.id, result.conflict);
          setStatus({ kind: "dirty" });
          return;
        }
        baseline().projects.set(mine.id, mine);
        releaseConflict(mine.id);
        generationRef.current += 1;
      } catch (error) {
        // The conflict stays live and the banner reports this beside its own
        // buttons, so the user can try again. An error status instead would
        // offer Retry, which can't help a project that is deliberately held.
        setStatus({ kind: "dirty" });
        failure = error;
      }
    });
    if (failure) throw failure;
    if (!conflictsRef.current.has(pending.projectId)) await flush();
  }, [runExclusive, storage, flush]);

  const markSaved = useCallback(
    (project: Project) => {
      // Only this project's entry: a sibling whose save never went out has to
      // stay plannable. activeProjectId/order are untouched for the same reason.
      baseline().projects.set(project.id, project);
      if (inFlightRef.current) {
        // A save of the pre-load copy is in flight, and the generation bump
        // below stops it advancing the baseline — so storage may end up holding
        // that copy as its last write. Force one re-send of the editor's copy
        // rather than reporting "Saved" over content that no longer matches.
        forceSaveRef.current.add(project.id);
      }
      // Only this project's hold: a sibling's conflict is still unresolved.
      releaseConflict(project.id);
      generationRef.current += 1;
      if (hasChanges()) {
        // Nothing re-arms the timer on our behalf, so schedule the leftovers.
        setStatus({ kind: "dirty" });
        scheduleFlush();
        return;
      }
      clearTimer();
      // No `at`, for the same reason as the settle above: markSaved means
      // storage already holds this copy — written on the server or in another
      // tab — so there is no save time from this tick to report.
      setStatus({ kind: "saved", at: null });
    },
    [flush, delayMs, now],
  );

  return { status, conflict, saveNow, retry, keepMine, markSaved };
}

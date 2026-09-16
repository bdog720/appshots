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
  | { kind: "error"; message: string }
  | { kind: "conflict"; projectId: string; revision: number; savedAt: number };

export interface ProjectPersistence {
  status: SaveStatus;
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
  const conflictRef = useRef<Extract<SaveStatus, { kind: "conflict" }> | null>(null);
  /** Bumped whenever the baseline is resolved out from under a running pass. */
  const generationRef = useRef(0);
  /**
   * Ids to re-send even though the baseline matches. Kept apart from the
   * baseline because that map also answers "does this project still exist?":
   * dropping a key to force a save would drop it from delete detection too.
   */
  const forceSaveRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: null });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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
      if (conflictRef.current) return;
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
        const forcePin = pinActive && isServerStorage(storage);
        if (isEmptyPlan(plan) && !forcePin) {
          setStatus((previous) => (previous.kind === "saved" ? previous : { kind: "saved", at: now() }));
          return;
        }

        setStatus({ kind: "saving" });
        const toSave = [...plan.save];
        const activeProject = current.find((project) => project.id === active);
        if (forcePin && activeProject && !toSave.some((project) => project.id === active)) {
          toSave.push(activeProject);
        }
        for (const project of toSave) {
          const result = await storage.saveProject(
            project,
            forcePin && project.id === active ? { pin: true, label: SAVE_NOW_LABEL } : {},
          );
          if (superseded()) return;
          if (!result.ok) {
            conflictRef.current = { kind: "conflict", projectId: project.id, ...result.conflict };
            setStatus(conflictRef.current);
            return;
          }
          // Baseline advances only for the projects that actually saved.
          saved.projects.set(project.id, project);
          forceSaveRef.current.delete(project.id);
        }
        for (const id of plan.remove) {
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
        if (conflictRef.current?.projectId === project.id) {
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
    if (conflictRef.current) return;
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
    if (!conflictRef.current) return;
    // Serialized like any other pass, so a double click can't send two saves
    // against the same baseRevision.
    await runExclusive(async () => {
      const conflict = conflictRef.current;
      if (!conflict) return;
      const mine = latestRef.current.projects.find((project) => project.id === conflict.projectId);
      if (!mine) {
        conflictRef.current = null;
        generationRef.current += 1;
        return;
      }
      setStatus({ kind: "saving" });
      try {
        const result = await storage.saveProject(mine, {
          baseRevision: conflict.revision,
          pinPrevious: true,
        });
        if (!result.ok) {
          conflictRef.current = { kind: "conflict", projectId: mine.id, ...result.conflict };
          setStatus(conflictRef.current);
          return;
        }
        baseline().projects.set(mine.id, mine);
        conflictRef.current = null;
        generationRef.current += 1;
      } catch {
        // Keep the conflict live. Falling back to an error status would leave
        // conflictRef set with no way to clear it, silently blocking every
        // later save and losing the work on unload.
        setStatus(conflict);
      }
    });
    if (!conflictRef.current) await flush();
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
      conflictRef.current = null;
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

  return { status, saveNow, retry, keepMine, markSaved };
}

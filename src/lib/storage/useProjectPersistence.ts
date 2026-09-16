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
  markSaved(projects: Project[], activeProjectId: string): void;
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
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: null });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hasChanges = () =>
    !isEmptyPlan(planSave(baseline(), latestRef.current.projects, latestRef.current.activeProjectId));

  const runFlush = useCallback(
    async (pinActive: boolean): Promise<void> => {
      if (conflictRef.current) return;
      const saved = baseline();
      const { projects: current, activeProjectId: active } = latestRef.current;
      const plan = planSave(saved, current, active);
      const forcePin = pinActive && isServerStorage(storage);
      if (isEmptyPlan(plan) && !forcePin) {
        setStatus((previous) => (previous.kind === "saved" ? previous : { kind: "saved", at: now() }));
        return;
      }

      setStatus({ kind: "saving" });
      try {
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
          if (!result.ok) {
            conflictRef.current = { kind: "conflict", projectId: project.id, ...result.conflict };
            setStatus(conflictRef.current);
            return;
          }
          // Baseline advances only for the projects that actually saved.
          saved.projects.set(project.id, project);
        }
        for (const id of plan.remove) {
          await storage.deleteProject(id);
          saved.projects.delete(id);
        }
        if (plan.meta) {
          const order = current.map((project) => project.id);
          await storage.saveMeta(active, order);
          saved.activeProjectId = active;
          saved.order = order;
        }
        setStatus(hasChanges() ? { kind: "dirty" } : { kind: "saved", at: now() });
      } catch (error) {
        setStatus({ kind: "error", message: messageOf(error) });
      }
    },
    [storage, now],
  );

  const flush = useCallback(
    async (pinActive = false): Promise<void> => {
      clearTimer();
      while (inFlightRef.current) await inFlightRef.current;
      const run = runFlush(pinActive);
      inFlightRef.current = run;
      try {
        await run;
      } finally {
        inFlightRef.current = null;
      }
    },
    [runFlush],
  );

  // Autosave: mark dirty right away, save after a quiet period.
  useEffect(() => {
    if (conflictRef.current || !hasChanges()) return;
    // Return the same object when already dirty/saving so this doesn't re-render in a loop.
    setStatus((previous) => (previous.kind === "saving" || previous.kind === "dirty" ? previous : { kind: "dirty" }));
    clearTimer();
    timerRef.current = setTimeout(() => {
      void flush();
    }, delayMs);
    return clearTimer;
  }, [projects, activeProjectId, delayMs, flush]);

  // Clear any pending autosave when the editor goes away.
  useEffect(() => clearTimer, []);

  // Unload guard.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const saved = baseline();
      const { projects: current, activeProjectId: active } = latestRef.current;
      const plan = planSave(saved, current, active);
      if (isEmptyPlan(plan) && !inFlightRef.current) return;

      if (isServerStorage(storage)) {
        for (const project of plan.save) storage.saveProjectOnUnload(project);
        event.preventDefault();
        event.returnValue = "";
        return;
      }
      // Browser storage writes synchronously inside these calls.
      for (const project of plan.save) void storage.saveProject(project).catch(() => undefined);
      for (const id of plan.remove) void storage.deleteProject(id).catch(() => undefined);
      if (plan.meta) {
        void storage.saveMeta(active, current.map((project) => project.id)).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [storage]);

  const saveNow = useCallback(() => flush(true), [flush]);
  const retry = useCallback(() => flush(false), [flush]);

  const keepMine = useCallback(async () => {
    const conflict = conflictRef.current;
    if (!conflict) return;
    const mine = latestRef.current.projects.find((project) => project.id === conflict.projectId);
    if (!mine) {
      conflictRef.current = null;
      await flush();
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const result = await storage.saveProject(mine, { baseRevision: conflict.revision, pinPrevious: true });
      if (!result.ok) {
        conflictRef.current = { kind: "conflict", projectId: mine.id, ...result.conflict };
        setStatus(conflictRef.current);
        return;
      }
      baseline().projects.set(mine.id, mine);
      conflictRef.current = null;
      await flush();
    } catch (error) {
      setStatus({ kind: "error", message: messageOf(error) });
    }
  }, [storage, flush]);

  const markSaved = useCallback(
    (savedProjects: Project[], savedActiveProjectId: string) => {
      clearTimer();
      savedRef.current = snapshotOf(savedProjects, savedActiveProjectId);
      conflictRef.current = null;
      setStatus({ kind: "saved", at: now() });
    },
    [now],
  );

  return { status, saveNow, retry, keepMine, markSaved };
}

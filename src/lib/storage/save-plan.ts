/** Work out what needs saving by comparing editor projects with the last saved copy. */

import type { Project } from "../../types";

export interface SavedSnapshot {
  projects: Map<string, Project>;
  activeProjectId: string;
  order: string[];
}

export interface SavePlan {
  save: Project[];
  remove: string[];
  meta: boolean;
}

export const snapshotOf = (projects: Project[], activeProjectId: string): SavedSnapshot => ({
  projects: new Map(projects.map((project) => [project.id, project])),
  activeProjectId,
  order: projects.map((project) => project.id),
});

const IGNORED_FIELDS = new Set(["updatedAt"]);

/**
 * The editor rebuilds the active project object (and stamps updatedAt) whenever
 * its state syncs, but unchanged fields keep their references — so a shallow
 * compare is both cheap and accurate.
 */
export const sameProjectContent = (a: Project, b: Project): boolean => {
  if (a === b) return true;
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (!IGNORED_FIELDS.has(key) && left[key] !== right[key]) return false;
  }
  return true;
};

export const planSave = (previous: SavedSnapshot, projects: Project[], activeProjectId: string): SavePlan => {
  const save = projects.filter((project) => {
    const saved = previous.projects.get(project.id);
    return !saved || !sameProjectContent(saved, project);
  });
  const currentIds = new Set(projects.map((project) => project.id));
  const remove = [...previous.projects.keys()].filter((id) => !currentIds.has(id));
  const order = projects.map((project) => project.id);
  const meta =
    previous.activeProjectId !== activeProjectId ||
    previous.order.length !== order.length ||
    previous.order.some((id, index) => id !== order[index]);
  return { save, remove, meta };
};

export const isEmptyPlan = (plan: SavePlan): boolean =>
  plan.save.length === 0 && plan.remove.length === 0 && !plan.meta;

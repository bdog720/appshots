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

export const planSave = (
  previous: SavedSnapshot,
  projects: Project[],
  activeProjectId: string,
  /** Ids to save even when their content matches the baseline. */
  forceSave?: ReadonlySet<string>,
  /**
   * Ids in the baseline that storage doesn't hold yet: the default project an
   * empty store opens on. Written along with any other change, never on their
   * own, so merely opening the editor leaves an empty store empty.
   */
  unstored?: ReadonlySet<string>,
): SavePlan => {
  const needsSave = (project: Project) => {
    // The baseline can be up to date while storage is not — see markSaved's
    // in-flight branch. Only `save` is affected: `remove` and `meta` still come
    // from the baseline alone.
    if (forceSave?.has(project.id)) return true;
    const saved = previous.projects.get(project.id);
    return !saved || !sameProjectContent(saved, project);
  };
  const currentIds = new Set(projects.map((project) => project.id));
  const remove = [...previous.projects.keys()].filter((id) => !currentIds.has(id) && !unstored?.has(id));
  const order = projects.map((project) => project.id);
  const meta =
    previous.activeProjectId !== activeProjectId ||
    previous.order.length !== order.length ||
    previous.order.some((id, index) => id !== order[index]);
  const hasWork = remove.length > 0 || meta || projects.some(needsSave);
  const save = projects.filter((project) => needsSave(project) || (hasWork && unstored?.has(project.id)));
  return { save, remove, meta };
};

export const isEmptyPlan = (plan: SavePlan): boolean =>
  plan.save.length === 0 && plan.remove.length === 0 && !plan.meta;

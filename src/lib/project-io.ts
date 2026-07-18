/**
 * Project import/export.
 *
 * Serializes a single project to a self-describing JSON envelope the user can
 * download as a backup and re-import later. Parsing validates the envelope and
 * returns the raw project; the caller is responsible for normalizing it and
 * assigning a fresh id before adding it to the workspace.
 */

import type { Project } from "../types";

export const PROJECT_FILE_TYPE = "appshots-project";
export const PROJECT_FILE_VERSION = 1;

export type ProjectFile = {
  type: typeof PROJECT_FILE_TYPE;
  version: number;
  project: Project;
};

/** Serializes a project to a pretty-printed JSON envelope. */
export const serializeProject = (project: Project): string =>
  JSON.stringify(
    { type: PROJECT_FILE_TYPE, version: PROJECT_FILE_VERSION, project },
    null,
    2,
  );

/**
 * Parses and validates an exported project file, returning the contained
 * project. Throws a descriptive error if the text isn't a valid project file.
 */
export const parseProjectFile = (text: string): Project => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("This doesn't look like an AppShots project file.");
  }

  const file = data as Partial<ProjectFile>;
  if (file.type !== PROJECT_FILE_TYPE || !file.project) {
    throw new Error("This doesn't look like an AppShots project file.");
  }

  const project = file.project as Project;
  if (!Array.isArray(project.screenshots)) {
    throw new Error("This project file is missing its screenshots.");
  }

  return project;
};

/** Builds a safe download filename from a project name. */
export const suggestProjectFilename = (name: string): string => {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `${slug}.appshots.json`;
};

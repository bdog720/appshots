/**
 * End-to-end import: bundle → manifest → decode referenced images → compile.
 * Every expected failure comes back as `{ ok: false, errors }` so the UI can
 * list them; only genuine bugs throw.
 */

import type { Project } from "../../types";
import { collectBundle, imageMimeType, readFileAsDataUrl } from "./bundle";
import {
  compileManifest,
  findMissingImages,
  imageKey,
  listImageReferences,
  type LoadedImage,
} from "./compile";
import { ImportError, checkStorageBudget, type ImportIssue } from "./issues";
import { parseManifest } from "./schema";

export type ReadImage = (file: File) => Promise<LoadedImage>;

export interface PipelineOptions {
  readImage: ReadImage;
  generateId: () => string;
  /** Characters already persisted (e.g. JSON.stringify(projects).length). */
  existingStorageChars: number;
}

export type PipelineResult =
  | { ok: false; errors: ImportIssue[] }
  | { ok: true; project: Project; warnings: ImportIssue[] };

export const runAgentImport = async (
  files: File[],
  { readImage, generateId, existingStorageChars }: PipelineOptions,
): Promise<PipelineResult> => {
  try {
    const bundle = await collectBundle(files);

    const parsed = parseManifest(bundle.manifestText);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const missing = findMissingImages(parsed.manifest, new Set(bundle.images.keys()));
    if (missing.length > 0) return { ok: false, errors: missing };

    const referencedKeys = [
      ...new Set(listImageReferences(parsed.manifest).map((ref) => imageKey(ref.name))),
    ];
    const images = new Map<string, LoadedImage>();
    for (const key of referencedKeys) {
      const file = bundle.images.get(key) as File;
      try {
        images.set(key, await readImage(file));
      } catch {
        return { ok: false, errors: [{ path: file.name, message: "this image could not be read" }] };
      }
    }

    const { project, warnings } = compileManifest({
      manifest: parsed.manifest,
      images,
      bundleImageNames: [...bundle.images.values()].map((file) => file.name),
      generateId,
    });
    const storage = checkStorageBudget(existingStorageChars, project);
    return { ok: true, project, warnings: storage ? [storage, ...warnings] : warnings };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, errors: error.issues };
    throw error;
  }
};

/** Browser decoder: data URL plus natural pixel size. */
export const readImageFile: ReadImage = async (file) => {
  // Loose/folder-dropped files can arrive with an empty MIME type, which would
  // yield a `data:application/octet-stream` URL; infer it from the extension.
  const typed = file.type
    ? file
    : new File([file], file.name, { type: imageMimeType(file.name) ?? "" });
  const dataUrl = await readFileAsDataUrl(typed);
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error(`could not decode ${file.name}`));
      img.src = dataUrl;
    },
  );
  return { dataUrl, width, height };
};

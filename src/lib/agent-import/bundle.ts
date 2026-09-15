/**
 * Gathers an agent bundle from whatever the user dropped or picked: loose files,
 * a folder's files, or zips (expanded in place). Images are matched later by
 * lowercase basename, so folder structure inside the bundle doesn't matter.
 */

import JSZip from "jszip";
import { ImportError, type ImportIssue } from "./issues";

export const MANIFEST_FILENAME = "appshots.json";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export const imageMimeType = (name: string): string | null =>
  IMAGE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

const isJunk = (path: string): boolean =>
  path.split(/[\\/]/).includes("__MACOSX") || basename(path).startsWith(".");

const readWith = <T>(read: (reader: FileReader) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    read(reader);
  });

export const readFileAsText = (file: Blob): Promise<string> =>
  readWith<string>((reader) => reader.readAsText(file));

export const readFileAsDataUrl = (file: Blob): Promise<string> =>
  readWith<string>((reader) => reader.readAsDataURL(file));

export interface Bundle {
  manifestText: string;
  /** Image files keyed by lowercase basename. */
  images: Map<string, File>;
}

const expandZip = async (zipFile: File): Promise<File[]> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch {
    throw new ImportError([{ path: zipFile.name, message: "could not open this zip file" }]);
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !isJunk(e.name));
  return Promise.all(
    entries.map(async (entry) => {
      const name = basename(entry.name);
      const blob = await entry.async("blob");
      return new File([blob], name, {
        type: imageMimeType(name) ?? "application/octet-stream",
      });
    }),
  );
};

export const collectBundle = async (files: File[]): Promise<Bundle> => {
  const expanded: File[] = [];
  for (const file of files) {
    if (isJunk(file.name)) continue;
    if (file.name.toLowerCase().endsWith(".zip")) {
      expanded.push(...(await expandZip(file)));
    } else {
      expanded.push(file);
    }
  }

  const manifests = expanded.filter(
    (f) => basename(f.name).toLowerCase() === MANIFEST_FILENAME,
  );
  if (manifests.length === 0) {
    throw new ImportError([
      {
        path: "",
        message: `no ${MANIFEST_FILENAME} found — drop the folder that contains it, or include it in your selection`,
      },
    ]);
  }
  if (manifests.length > 1) {
    throw new ImportError([
      {
        path: "",
        message: `found ${manifests.length} ${MANIFEST_FILENAME} files; import one screenshot set at a time`,
      },
    ]);
  }

  const images = new Map<string, File>();
  const duplicates: ImportIssue[] = [];
  for (const file of expanded) {
    if (!imageMimeType(file.name)) continue;
    const key = basename(file.name).toLowerCase();
    if (images.has(key)) {
      duplicates.push({
        path: "",
        message: `more than one image is named "${basename(file.name)}"; image names must be unique`,
      });
      continue;
    }
    images.set(key, file);
  }
  if (duplicates.length > 0) throw new ImportError(duplicates);

  return { manifestText: await readFileAsText(manifests[0]), images };
};

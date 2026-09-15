/**
 * Version-history rules for the storage server. Pure: callers pass in the
 * clock and the list of versions; nothing here touches the filesystem.
 */

export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const RECENT_VERSIONS_KEPT = 20;
export const DAILY_VERSIONS_DAYS = 7;
export const PINNED_VERSIONS_KEPT = 10;

export interface VersionMeta {
  version: string;
  savedAt: number;
  pinned: boolean;
}

export const versionName = (savedAt: number, revision: number): string =>
  `${savedAt}-${revision}`;

export const shouldAutoSnapshot = (newestSavedAt: number | null, now: number): boolean =>
  newestSavedAt === null || now - newestSavedAt > SNAPSHOT_INTERVAL_MS;

const localDayKey = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export const selectVersionsToKeep = (versions: VersionMeta[], now: number): Set<string> => {
  const newestFirst = [...versions].sort((a, b) => b.savedAt - a.savedAt);
  const keep = new Set<string>();

  for (const version of newestFirst.slice(0, RECENT_VERSIONS_KEPT)) keep.add(version.version);

  const recentDays = new Set(
    Array.from({ length: DAILY_VERSIONS_DAYS }, (_, i) => {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      return localDayKey(day.getTime());
    }),
  );
  const coveredDays = new Set<string>();
  for (const version of newestFirst) {
    const day = localDayKey(version.savedAt);
    if (recentDays.has(day) && !coveredDays.has(day)) {
      coveredDays.add(day);
      keep.add(version.version);
    }
  }

  const pinned = newestFirst.filter((version) => version.pinned);
  for (const version of pinned.slice(0, PINNED_VERSIONS_KEPT)) keep.add(version.version);

  return keep;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export interface ProjectSummary {
  screenCount: number;
  firstHeadline: string;
}

const toPlainText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export const summarizeProject = (project: unknown): ProjectSummary => {
  const screenshots =
    isRecord(project) && Array.isArray(project.screenshots) ? project.screenshots : [];
  const first = screenshots[0];
  const headline = isRecord(first) && typeof first.headline === "string" ? first.headline : "";
  return { screenCount: screenshots.length, firstHeadline: toPlainText(headline).slice(0, 80) };
};

const IMAGE_URL = /\/api\/images\/([a-f0-9]{64}\.(?:png|jpg|webp))/g;

export const collectImageNames = (value: unknown, into: Set<string> = new Set()): Set<string> => {
  if (typeof value === "string") {
    for (const match of value.matchAll(IMAGE_URL)) into.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectImageNames(item, into);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) collectImageNames(item, into);
  }
  return into;
};

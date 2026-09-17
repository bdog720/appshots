/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  collectImageNames,
  selectVersionsToKeep,
  shouldAutoSnapshot,
  summarizeProject,
  versionName,
  type VersionMeta,
} from "./history";

const MINUTE = 60 * 1000;
// Local-time dates so "calendar day" tests don't depend on the machine's timezone.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const NOW = at(15, 12);

const meta = (savedAt: number, revision: number, pinned = false): VersionMeta => ({
  version: versionName(savedAt, revision),
  savedAt,
  pinned,
});

describe("versionName", () => {
  it("joins savedAt and revision", () => {
    expect(versionName(1757900000000, 7)).toBe("1757900000000-7");
  });
});

describe("shouldAutoSnapshot", () => {
  it("snapshots when there is no history or the newest version is over 10 minutes old", () => {
    expect(shouldAutoSnapshot(null, NOW)).toBe(true);
    expect(shouldAutoSnapshot(NOW - 11 * MINUTE, NOW)).toBe(true);
    expect(shouldAutoSnapshot(NOW - 10 * MINUTE, NOW)).toBe(false);
    expect(shouldAutoSnapshot(NOW - 9 * MINUTE, NOW)).toBe(false);
  });
});

describe("selectVersionsToKeep", () => {
  it("keeps the 20 newest versions", () => {
    const versions = Array.from({ length: 30 }, (_, i) => meta(NOW - i * MINUTE, 30 - i));
    const keep = selectVersionsToKeep(versions, NOW);
    expect(keep.size).toBe(20);
    expect(keep.has(versions[0].version)).toBe(true);
    expect(keep.has(versions[19].version)).toBe(true);
    expect(keep.has(versions[20].version)).toBe(false);
  });

  it("also keeps the newest version from each of the last 7 calendar days", () => {
    const today = Array.from({ length: 25 }, (_, i) => meta(NOW - i * MINUTE, 100 - i));
    const olderDays = Array.from({ length: 9 }, (_, i) => [
      meta(at(14 - i, 18), 50 - i * 2), // newest on that day
      meta(at(14 - i, 9), 49 - i * 2), // older on that day
    ]).flat();
    const keep = selectVersionsToKeep([...today, ...olderDays], NOW);

    // 20 newest from today + newest of days 14..9 (6 days; today already covered)
    expect(keep.size).toBe(26);
    expect(keep.has(meta(at(14, 18), 50).version)).toBe(true);
    expect(keep.has(meta(at(9, 18), 40).version)).toBe(true);
    expect(keep.has(meta(at(14, 9), 49).version)).toBe(false);
    expect(keep.has(meta(at(8, 18), 38).version)).toBe(false);
  });

  it("keeps the 10 newest pinned versions regardless of age", () => {
    const recent = Array.from({ length: 20 }, (_, i) => meta(NOW - i * MINUTE, 200 - i));
    const pinned = Array.from({ length: 15 }, (_, i) => meta(at(1, 10, i), 100 - i, true));
    const keep = selectVersionsToKeep([...recent, ...pinned], NOW);
    expect(keep.size).toBe(30);
    const pinnedNewestFirst = [...pinned].sort((a, b) => b.savedAt - a.savedAt);
    expect(keep.has(pinnedNewestFirst[9].version)).toBe(true);
    expect(keep.has(pinnedNewestFirst[10].version)).toBe(false);
  });
});

describe("summarizeProject", () => {
  it("counts screens and returns the first headline as plain text", () => {
    expect(
      summarizeProject({
        screenshots: [
          { headline: "Build habits <mark style=\"background-color: rgb(1,2,3)\">that stick</mark><br>today &amp; forever" },
          { headline: "Second" },
        ],
      }),
    ).toEqual({ screenCount: 2, firstHeadline: "Build habits that stick today & forever" });
  });

  it("truncates to 80 characters and tolerates bad shapes", () => {
    expect(summarizeProject({ screenshots: [{ headline: "x".repeat(100) }] }).firstHeadline).toHaveLength(80);
    expect(summarizeProject(null)).toEqual({ screenCount: 0, firstHeadline: "" });
    expect(summarizeProject({ screenshots: "nope" })).toEqual({ screenCount: 0, firstHeadline: "" });
  });
});

describe("collectImageNames", () => {
  it("finds image names referenced anywhere in a project", () => {
    const a = `${"a".repeat(64)}.png`;
    const b = `${"b".repeat(64)}.webp`;
    const names = collectImageNames({
      screenshots: [
        { devices: [{ screenshotSrc: `/api/images/${a}` }, { screenshotSrc: null }] },
        { overlayImages: [{ src: `/api/images/${b}` }, { src: "data:image/png;base64,AAA" }] },
      ],
    });
    expect([...names].sort()).toEqual([a, b].sort());
  });
});

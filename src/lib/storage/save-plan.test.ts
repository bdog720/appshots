import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { isEmptyPlan, planSave, sameProjectContent, snapshotOf } from "./save-plan";

const shots: unknown[] = [];
const project = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, screenshots: shots, updatedAt: 1, ...extra }) as unknown as Project;

describe("sameProjectContent", () => {
  it("ignores updatedAt and compares top-level fields by reference", () => {
    const a = project("a");
    expect(sameProjectContent(a, { ...a, updatedAt: 99 } as Project)).toBe(true);
    expect(sameProjectContent(a, { ...a, name: "renamed" } as Project)).toBe(false);
    expect(sameProjectContent(a, { ...a, screenshots: [] } as unknown as Project)).toBe(false);
  });
});

describe("planSave", () => {
  it("is empty when nothing changed except timestamps", () => {
    const a = project("a");
    const plan = planSave(snapshotOf([a], "a"), [{ ...a, updatedAt: 5 } as Project], "a");
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("saves new and changed projects and removes deleted ones", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    const changedA = { ...a, name: "A2" } as Project;
    const c = project("c");
    const plan = planSave(previous, [changedA, c], "a");
    expect(plan.save.map((p) => p.id)).toEqual(["a", "c"]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.meta).toBe(true);
  });

  it("forces listed ids into save even when their content matches the baseline", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    const plan = planSave(previous, [a, b], "a", new Set(["a"]));
    expect(plan.save.map((p) => p.id)).toEqual(["a"]);
    expect(plan.remove).toEqual([]);
    expect(plan.meta).toBe(false);
  });

  it("still removes a deleted project whose id is forced", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    const plan = planSave(previous, [b], "b", new Set(["a"]));
    expect(plan.save).toEqual([]);
    expect(plan.remove).toEqual(["a"]);
  });

  it("saves an unstored project only alongside other work", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a], "a");
    const unstored = new Set(["a"]);
    expect(isEmptyPlan(planSave(previous, [a], "a", undefined, unstored))).toBe(true);
    const plan = planSave(previous, [a, b], "b", undefined, unstored);
    expect(plan.save.map((p) => p.id)).toEqual(["a", "b"]);
    expect(plan.meta).toBe(true);
  });

  it("never removes an unstored project, because storage doesn't have it", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    expect(planSave(previous, [b], "b", undefined, new Set(["a"]))).toEqual({ save: [], remove: [], meta: true });
  });

  it("flags meta when the active project or order changes", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    expect(planSave(previous, [a, b], "b")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [b, a], "a")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [a, b], "a")).toEqual({ save: [], remove: [], meta: false });
  });
});

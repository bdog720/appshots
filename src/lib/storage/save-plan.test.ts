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

  it("flags meta when the active project or order changes", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    expect(planSave(previous, [a, b], "b")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [b, a], "a")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [a, b], "a")).toEqual({ save: [], remove: [], meta: false });
  });
});

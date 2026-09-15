import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  ImportError,
  checkStorageBudget,
  formatIssue,
  formatIssuePath,
} from "./issues";

const tinyProject = { id: "p", screenshots: [] } as unknown as Project;

describe("issues", () => {
  it("formats zod-style paths with array indexes", () => {
    expect(formatIssuePath(["screens", 2, "device", "color"])).toBe(
      "screens[2].device.color",
    );
    expect(formatIssuePath([])).toBe("");
  });

  it("formats issues with and without a path", () => {
    expect(formatIssue({ path: "brand.primary", message: "bad" })).toBe(
      "brand.primary: bad",
    );
    expect(formatIssue({ path: "", message: "no manifest" })).toBe("no manifest");
  });

  it("carries issues on ImportError and joins them into the message", () => {
    const error = new ImportError([
      { path: "a", message: "one" },
      { path: "", message: "two" },
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ImportError");
    expect(error.issues).toHaveLength(2);
    expect(error.message).toBe("a: one\ntwo");
  });

  it("warns only when existing + new data exceeds the budget", () => {
    expect(checkStorageBudget(0, tinyProject)).toBeNull();
    const issue = checkStorageBudget(4_500_000, tinyProject);
    expect(issue?.path).toBe("");
    expect(issue?.message).toMatch(/stop saving/i);
    expect(checkStorageBudget(10, tinyProject, 5)).not.toBeNull();
  });
});

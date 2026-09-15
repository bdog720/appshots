import { describe, expect, it } from "vitest";
import type { Screenshot } from "../types";
import { reconcileActiveScreenshotId } from "./active-screenshot";

const shots = (...ids: string[]) =>
  ids.map((id) => ({ id })) as unknown as Screenshot[];

describe("reconcileActiveScreenshotId", () => {
  it("keeps the current id when that screenshot still exists", () => {
    expect(reconcileActiveScreenshotId("b", shots("a", "b"))).toBe("b");
  });

  it("falls back to the first screenshot when the current id is gone", () => {
    expect(reconcileActiveScreenshotId("imported", shots("a", "b"))).toBe("a");
  });

  it("keeps the current id when there are no screenshots", () => {
    expect(reconcileActiveScreenshotId("a", [])).toBe("a");
  });
});

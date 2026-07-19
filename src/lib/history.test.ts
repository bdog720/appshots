import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  initHistory,
  record,
  redo,
  undo,
} from "./history";

describe("history", () => {
  it("starts with no undo or redo available", () => {
    const h = initHistory("a");
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("records a new present, moving the old one into the past", () => {
    const h = record(initHistory("a"), "b");
    expect(h.present).toBe("b");
    expect(h.past).toEqual(["a"]);
    expect(canUndo(h)).toBe(true);
  });

  it("ignores a record whose value equals the current present", () => {
    const h = initHistory("a");
    expect(record(h, "a")).toBe(h);
  });

  it("undo returns to the previous present and enables redo", () => {
    const h = undo(record(initHistory("a"), "b"));
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });

  it("redo re-applies the undone present", () => {
    const h = redo(undo(record(initHistory("a"), "b")));
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(false);
  });

  it("recording after an undo clears the redo future", () => {
    const undone = undo(record(initHistory("a"), "b"));
    const h = record(undone, "c");
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a"]);
  });

  it("undo and redo at the ends are no-ops", () => {
    const base = initHistory("a");
    expect(undo(base)).toBe(base);
    expect(redo(base)).toBe(base);
  });

  it("caps the past at the given limit, dropping the oldest entries", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 5; i++) h = record(h, i, 3);
    expect(h.present).toBe(5);
    // only the 3 most recent prior states are retained
    expect(h.past).toEqual([2, 3, 4]);
  });
});

/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSnapshotHistory } from "./useSnapshotHistory";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initial: string) {
  const apply = vi.fn();
  const view = renderHook(
    ({ v }) =>
      useSnapshotHistory({
        value: v,
        deps: [v],
        apply,
        debounceMs: 500,
      }),
    { initialProps: { v: initial } },
  );
  return { ...view, apply };
}

describe("useSnapshotHistory", () => {
  it("records a change after the debounce, enabling undo", () => {
    const { result, rerender } = setup("a");
    expect(result.current.canUndo).toBe(false);

    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.canUndo).toBe(true);
  });

  it("undo applies the previous snapshot and enables redo", () => {
    const { result, rerender, apply } = setup("a");

    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.undo());

    expect(apply).toHaveBeenLastCalledWith("a");
    expect(result.current.canRedo).toBe(true);
  });

  it("coalesces rapid changes into a single undo step", () => {
    const { result, rerender, apply } = setup("a");

    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: "c" });
    act(() => vi.advanceTimersByTime(500));

    act(() => result.current.undo());
    expect(apply).toHaveBeenLastCalledWith("a");
  });

  it("flushes a pending edit when undo is pressed before the debounce fires", () => {
    const { result, rerender, apply } = setup("a");

    rerender({ v: "b" });
    // no timer advance: the debounce has not recorded "b" yet
    act(() => result.current.undo());

    expect(apply).toHaveBeenLastCalledWith("a");
  });

  it("reset clears history for the given value", () => {
    const { result, rerender } = setup("a");
    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.reset("x"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});

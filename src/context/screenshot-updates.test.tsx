import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { EditorProvider, useEditor } from "./EditorContext";

const wrapper = ({ children }: { children: ReactNode }) => <EditorProvider>{children}</EditorProvider>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("updateActiveScreenshot", () => {
  it("changes nothing when every value is already set", async () => {
    // The headline editor reports its HTML on blur even when nothing was typed.
    const { result } = renderHook(() => useEditor(), { wrapper });
    const before = result.current.screenshots;

    act(() => result.current.updateActiveScreenshot({ headline: result.current.activeScreenshot.headline }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.screenshots).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});

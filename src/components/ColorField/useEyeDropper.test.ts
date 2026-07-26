/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEyeDropper } from "./useEyeDropper";

describe("useEyeDropper", () => {
  afterEach(() => {
    delete window.EyeDropper;
  });

  it("reports unsupported when window.EyeDropper is undefined", () => {
    const { result } = renderHook(() => useEyeDropper());
    expect(result.current.isSupported).toBe(false);
  });

  it("reports supported when window.EyeDropper exists", () => {
    window.EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#abcdef" });
      }
    };
    const { result } = renderHook(() => useEyeDropper());
    expect(result.current.isSupported).toBe(true);
  });

  it("resolves the sampled hex when supported", async () => {
    window.EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#112233" });
      }
    };
    const { result } = renderHook(() => useEyeDropper());

    let sampled: string | null = null;
    await act(async () => {
      sampled = await result.current.open();
    });

    expect(sampled).toBe("#112233");
  });

  it("resolves null when the user cancels the sample", async () => {
    window.EyeDropper = class {
      open() {
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }
    };
    const { result } = renderHook(() => useEyeDropper());

    let sampled: string | null = "unset";
    await act(async () => {
      sampled = await result.current.open();
    });

    expect(sampled).toBeNull();
  });

  it("resolves null when opened while unsupported", async () => {
    const { result } = renderHook(() => useEyeDropper());

    let sampled: string | null = "unset";
    await act(async () => {
      sampled = await result.current.open();
    });

    expect(sampled).toBeNull();
  });
});

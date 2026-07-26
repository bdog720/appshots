import { useCallback } from "react";

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>;
}

declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperInstance;
  }
}

interface UseEyeDropperResult {
  /** Whether the browser exposes the native EyeDropper API. */
  isSupported: boolean;
  /** Opens the native eyedropper; resolves the sampled hex, or null if cancelled/unsupported. */
  open: () => Promise<string | null>;
}

/** Wraps the native EyeDropper API so callers don't touch window.EyeDropper directly. */
export function useEyeDropper(): UseEyeDropperResult {
  const isSupported =
    typeof window !== "undefined" && typeof window.EyeDropper === "function";

  const open = useCallback(async (): Promise<string | null> => {
    if (!window.EyeDropper) return null;
    try {
      const result = await new window.EyeDropper().open();
      return result.sRGBHex;
    } catch {
      return null;
    }
  }, []);

  return { isSupported, open };
}

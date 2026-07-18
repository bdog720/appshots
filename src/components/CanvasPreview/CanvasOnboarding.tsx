/**
 * CanvasOnboarding
 *
 * A contextual, non-blocking first-run hint shown under the toolbar until the
 * user has added a screenshot image (or dismissed it). Teaches the core flow
 * and offers a shortcut to the upload action. Lives entirely in the editor
 * chrome; it never touches the device-frame preview.
 */

import { useState } from "react";
import { Upload, X } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import {
  dismissOnboarding,
  hasAnyScreenshotImage,
  isOnboardingDismissed,
} from "../../lib/onboarding";

export const CanvasOnboarding = () => {
  const { screenshots, fileInputRef } = useEditor();
  const [dismissed, setDismissed] = useState(isOnboardingDismissed);

  if (dismissed || hasAnyScreenshotImage(screenshots)) return null;

  const handleDismiss = () => {
    dismissOnboarding();
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-panel px-4 py-2.5">
      <p className="text-sm text-zinc-400">
        <span className="font-medium text-white">Get started:</span> pick a
        device on the left, add your screenshot, then export.
      </p>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-bright transition-colors hover:bg-accent/25"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload screenshot
      </button>
      <div className="flex-1" />
      <button
        onClick={handleDismiss}
        aria-label="Dismiss getting-started tips"
        title="Dismiss"
        className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

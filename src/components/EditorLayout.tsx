import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { CanvasPreview } from "./CanvasPreview";
import { FontPicker } from "./FontPicker";
import { GitHubStarModal } from "./GitHubStarModal";
import { useEditor } from "../context/EditorContext";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { GITHUB_REPO_URL } from "../constants";
import { Star, X } from "lucide-react";
import { useCallback, useState } from "react";

export const EditorLayout = () => {
  const {
    isFontPickerOpen,
    setIsFontPickerOpen,
    fontPickerScope,
    isStarModalOpen,
    setIsStarModalOpen,
    activeScreenshot,
    textDefaults,
    setTextDefault,
    setActiveScreenshotText,
    undo,
    redo,
    selectedElement,
    removeDevice,
    removeOverlayImage,
    handleExport,
  } = useEditor();

  const [showBanner, setShowBanner] = useState(true);

  const deleteSelection = useCallback(() => {
    if (!selectedElement?.id) return;
    if (selectedElement.type === "device") removeDevice(selectedElement.id);
    else if (selectedElement.type === "image")
      removeOverlayImage(selectedElement.id);
  }, [selectedElement, removeDevice, removeOverlayImage]);

  useKeyboardShortcuts({
    undo,
    redo,
    delete: deleteSelection,
    export: handleExport,
  });

  return (
    <div className="flex flex-col h-screen bg-base text-white overflow-hidden">
      {showBanner && (
        <div className="flex items-center justify-center gap-2 bg-zinc-800 px-4 py-1.5 text-xs text-zinc-300 relative shrink-0">
          <Star size={12} className="text-yellow-400 fill-yellow-400" />
          <span>
            AppShots is open source —{" "}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2 hover:text-zinc-100"
            >
              Star us on GitHub
            </a>
          </span>
          <button
            onClick={() => setShowBanner(false)}
            className="absolute right-3 text-zinc-500 hover:text-zinc-300"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <CanvasPreview />
        <RightSidebar />
        <FontPicker
          isOpen={isFontPickerOpen}
          onClose={() => setIsFontPickerOpen(false)}
          selectedFontFamily={
            fontPickerScope === "global"
              ? textDefaults.fontFamily
              : activeScreenshot.fontFamily
          }
          onSelect={(fontFamily: string) =>
            fontPickerScope === "global"
              ? setTextDefault("fontFamily", fontFamily)
              : setActiveScreenshotText("fontFamily", fontFamily)
          }
        />
        <GitHubStarModal
          isOpen={isStarModalOpen}
          onClose={() => setIsStarModalOpen(false)}
        />
      </div>
    </div>
  );
};

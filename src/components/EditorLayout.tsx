import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { CanvasPreview } from "./CanvasPreview";
import { FontPicker } from "./FontPicker";
import { GitHubStarModal } from "./GitHubStarModal";
import { NarrowScreenNotice } from "./NarrowScreenNotice";
import { ShortcutsModal } from "./ShortcutsModal";
import { AgentImportModal } from "./AgentImport/AgentImportModal";
import { ExportProgressOverlay } from "./ExportProgressOverlay";
import { StorageBanners } from "./Storage/StorageBanners";
import { HistoryPanel } from "./Storage/HistoryPanel";
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
    isShortcutsOpen,
    setIsShortcutsOpen,
    isAgentImportOpen,
    setIsAgentImportOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    listProjectHistory,
    restoreProjectVersion,
    activeProjectId,
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
    projects,
    saveNow,
    saveStatus,
    startupNotice,
    dismissStartupNotice,
    keepMyVersion,
    loadTheirVersion,
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
    help: () => setIsShortcutsOpen(true),
    save: () => void saveNow(),
  });

  return (
    <div className="flex flex-col h-screen bg-base text-white overflow-hidden">
      <NarrowScreenNotice />
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
            aria-label="Dismiss GitHub star banner"
            className="absolute right-3 text-zinc-500 hover:text-zinc-300"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <StorageBanners
        notice={startupNotice}
        conflict={saveStatus.kind === "conflict" ? saveStatus : null}
        conflictProjectName={
          saveStatus.kind === "conflict"
            ? (projects.find((project) => project.id === saveStatus.projectId)?.name ?? null)
            : null
        }
        onDismissNotice={dismissStartupNotice}
        onKeepMine={keepMyVersion}
        onLoadTheirs={loadTheirVersion}
      />
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
        <ShortcutsModal
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />
        <AgentImportModal
          isOpen={isAgentImportOpen}
          onClose={() => setIsAgentImportOpen(false)}
        />
        <HistoryPanel
          isOpen={isHistoryOpen}
          projectId={activeProjectId}
          onClose={() => setIsHistoryOpen(false)}
          loadHistory={listProjectHistory}
          onRestore={restoreProjectVersion}
        />
      </div>
      <ExportProgressOverlay />
    </div>
  );
};

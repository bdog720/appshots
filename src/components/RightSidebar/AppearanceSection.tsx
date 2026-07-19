/**
 * AppearanceSection Component
 *
 * Background controls with a global-default / per-screenshot-override scope
 * toggle, mirroring TextSection. Global scope edits the project default (flows to
 * every non-customized screenshot); screenshot scope pins this screenshot.
 */

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Screenshot, GradientPreset, BackgroundSettings } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { BackgroundPicker } from "./BackgroundPicker";
import { ContrastIndicator } from "./ContrastIndicator";
import { STYLES } from "./constants";

interface AppearanceSectionProps {
  screenshot: Screenshot;
  gradientPresets: GradientPreset[];
  onSetBackgroundDefault: (patch: Partial<BackgroundSettings>) => void;
  onSetScreenshotBackground: (patch: Partial<BackgroundSettings>) => void;
  onResetScreenshotBackground: () => void;
  onFixTextColor: (color: string) => void;
}

type Scope = "global" | "screenshot";

export const AppearanceSection = ({
  screenshot,
  gradientPresets,
  onSetBackgroundDefault,
  onSetScreenshotBackground,
  onResetScreenshotBackground,
  onFixTextColor,
}: AppearanceSectionProps) => {
  const [scope, setScope] = useState<Scope>("global");
  const isGlobal = scope === "global";
  const isOverridden = screenshot.backgroundOverride === true;

  const onUpdate = (patch: Partial<Screenshot>) => {
    const bgPatch = patch as Partial<BackgroundSettings>;
    if (isGlobal) onSetBackgroundDefault(bgPatch);
    else onSetScreenshotBackground(bgPatch);
  };

  return (
    <SidebarSection title="Background">
      <div className="flex gap-1 p-0.5 bg-input rounded-lg mb-3">
        <button
          className={`${STYLES.modeButton} ${isGlobal ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
          onClick={() => setScope("global")}
        >
          Global default
        </button>
        <button
          className={`${STYLES.modeButton} ${!isGlobal ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
          onClick={() => setScope("screenshot")}
        >
          This screenshot
        </button>
      </div>

      {!isGlobal && isOverridden && (
        <button
          type="button"
          onClick={onResetScreenshotBackground}
          className="mb-2 flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200"
          title="Reset to global default"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      )}

      <div className="space-y-4">
        <BackgroundPicker
          screenshot={screenshot}
          gradientPresets={gradientPresets}
          onUpdateScreenshot={onUpdate}
        />
        <ContrastIndicator
          textColor={screenshot.textColor}
          screenshot={screenshot}
          onFix={onFixTextColor}
        />
      </div>
    </SidebarSection>
  );
};

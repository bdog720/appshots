/**
 * AppearanceSection Component
 *
 * Visual appearance controls including background, text color, font, and screenshot image.
 */

import type { Screenshot, GradientPreset } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { BackgroundPicker } from "./BackgroundPicker";

interface AppearanceSectionProps {
  /** Active screenshot data */
  screenshot: Screenshot;
  /** Available gradient presets */
  gradientPresets: GradientPreset[];
  /** Update screenshot handler */
  onUpdateScreenshot: (updates: Partial<Screenshot>) => void;
}

/**
 * AppearanceSection - Background controls
 *
 * Background color / gradient settings. Text color and font live in the
 * TextSection alongside the other typography controls.
 *
 * @param props - Component props
 */
export const AppearanceSection = ({
  screenshot,
  gradientPresets,
  onUpdateScreenshot,
}: AppearanceSectionProps) => (
  <SidebarSection title="Background">
    <div className="space-y-4">
      <BackgroundPicker
        screenshot={screenshot}
        gradientPresets={gradientPresets}
        onUpdateScreenshot={onUpdateScreenshot}
      />
    </div>
  </SidebarSection>
);

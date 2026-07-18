/**
 * ExportSection Component
 *
 * Export size selection and export button section.
 */

import type { ExportSize } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { SelectionButton } from "./SelectionButton";
import { CollapsibleGroup } from "./CollapsibleGroup";
import {
  groupExportSizesByStore,
  isLandscapeExportSize,
} from "../../lib/sidebar-groups";
import { STYLES } from "./constants";

interface ExportSectionProps {
  /** Available export sizes */
  exportSizes: ExportSize[];
  /** Currently selected export size ID */
  selectedSizeId: string;
  /** Number of screenshots to export */
  screenshotCount: number;
  /** Handler for size selection */
  onSizeSelect: (sizeId: string) => void;
  /** Handler for export action */
  onExport: () => void;
}

/**
 * ExportSection - Export size and action section
 *
 * Displays export size options and the export button
 * with screenshot count.
 *
 * @param props - Component props
 *
 * @example
 * <ExportSection
 *   exportSizes={exportSizes}
 *   selectedSizeId={exportSizeId}
 *   screenshotCount={screenshots.length}
 *   onSizeSelect={setExportSizeId}
 *   onExport={handleExport}
 * />
 */
export const ExportSection = ({
  exportSizes,
  selectedSizeId,
  screenshotCount,
  onSizeSelect,
  onExport,
}: ExportSectionProps) => {
  const groups = groupExportSizesByStore(exportSizes);

  return (
    <SidebarSection title="Export">
      {/* Size options, grouped by store */}
      <div className="space-y-1.5">
        {groups.map((group) => (
          <CollapsibleGroup
            key={group.id}
            label={group.label}
            count={group.sizes.length}
            defaultOpen={group.sizes.some((s) => s.id === selectedSizeId)}
          >
            <div className={STYLES.buttonList}>
              {group.sizes.map((size) => (
                <SelectionButton
                  key={size.id}
                  label={size.label}
                  isSelected={selectedSizeId === size.id}
                  onClick={() => onSizeSelect(size.id)}
                  badge={
                    isLandscapeExportSize(size) ? (
                      <span className="mt-0.5 shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                        Banner
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </CollapsibleGroup>
        ))}
      </div>

      {/* Export button */}
      <button onClick={onExport} className={STYLES.primaryButton}>
        Export All ({screenshotCount})
      </button>
    </SidebarSection>
  );
};

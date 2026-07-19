/**
 * FontPicker Component
 *
 * Modal dialog for selecting Google Fonts with search functionality.
 *
 * Features:
 * - Searchable font list
 * - Font preview with sample text
 * - Category badges
 * - Keyboard accessible
 * - Animated transitions
 */

import { useMemo, useRef, useState } from "react";
import { googleFonts } from "../../lib/google-fonts";
import { useModalDismiss } from "../../lib/useModalDismiss";
import { FontPickerHeader } from "./FontPickerHeader";
import { SearchInput } from "./SearchInput";
import { FontGrid } from "./FontGrid";
import { FontPickerFooter } from "./FontPickerFooter";
import { filterFonts } from "./utils";
import { STYLES } from "./constants";

interface FontPickerProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler to close the modal */
  onClose: () => void;
  /** Currently selected font family */
  selectedFontFamily: string;
  /** Handler called when a font is selected */
  onSelect: (fontFamily: string) => void;
}

/**
 * FontPicker - Google Fonts selection modal
 *
 * A full-screen modal for browsing and selecting from available Google Fonts.
 * Includes search, font previews, and category information.
 *
 * @param props - Component props
 * @param props.isOpen - Controls modal visibility
 * @param props.onClose - Handler to close modal
 * @param props.selectedFontFamily - Currently selected font
 * @param props.onSelect - Handler for font selection
 *
 * @example
 * <FontPicker
 *   isOpen={isFontPickerOpen}
 *   onClose={() => setIsFontPickerOpen(false)}
 *   selectedFontFamily={currentFont}
 *   onSelect={(font) => updateFont(font)}
 * />
 */
export const FontPicker = ({
  isOpen,
  onClose,
  selectedFontFamily,
  onSelect,
}: FontPickerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useModalDismiss({ isOpen, onClose, containerRef: modalRef });

  // Filter fonts based on search query
  const filteredFonts = useMemo(
    () => filterFonts(googleFonts, searchQuery),
    [searchQuery],
  );

  // Handle font selection
  const handleSelect = (fontFamily: string) => {
    onSelect(fontFamily);
    onClose();
  };

  // Clear search query
  const handleClearSearch = () => setSearchQuery("");

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className={STYLES.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select a Google Font"
        tabIndex={-1}
        className={STYLES.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <FontPickerHeader onClose={onClose} />

        <SearchInput value={searchQuery} onChange={setSearchQuery} />

        <FontGrid
          fonts={filteredFonts}
          selectedFontFamily={selectedFontFamily}
          searchQuery={searchQuery}
          onSelect={handleSelect}
          onClearSearch={handleClearSearch}
        />

        <FontPickerFooter onCancel={onClose} />
      </div>
    </div>
  );
};

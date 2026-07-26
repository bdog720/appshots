/**
 * ColorPopover Component
 *
 * Popover contents for ColorField: saturation/hue picker, hex entry row
 * (hex input + eyedropper + save-to-palette), and the project's saved-swatch
 * grid. Positioned absolutely over a transparent full-viewport backdrop that
 * captures outside-clicks; the caller (ColorField) provides the `relative`
 * anchor. Escape + focus handling comes from useModalDismiss.
 */

import { useRef } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { Plus, X } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import { normalizeColor } from "../../lib/saved-colors";
import { useModalDismiss } from "../../lib/useModalDismiss";
import { EyedropperButton } from "./EyedropperButton";
import { STYLES } from "./constants";

interface ColorPopoverProps {
  /** Current color value */
  value: string;
  /** Change handler, called with a normalized hex string */
  onChange: (color: string) => void;
  /** Called to dismiss the popover (Escape, backdrop click, swatch pick) */
  onClose: () => void;
  /** Accessible label for the dialog, mirrors the field's label */
  label?: string;
  /** Whether to show the saved-swatch grid */
  showSavedColors?: boolean;
}

export const ColorPopover = ({
  value,
  onChange,
  onClose,
  label = "Color",
  showSavedColors = true,
}: ColorPopoverProps) => {
  const { savedColors, addSavedColor, removeSavedColor } = useEditor();
  const popoverRef = useRef<HTMLDivElement>(null);
  const current = normalizeColor(value);

  useModalDismiss({ isOpen: true, onClose, containerRef: popoverRef });

  return (
    <>
      <div role="presentation" className={STYLES.backdrop} onClick={onClose} />
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={STYLES.popover}
      >
        <HexColorPicker color={value} onChange={onChange} />

        <div className="mt-3 flex items-center gap-1.5">
          <HexColorInput
            color={value}
            onChange={onChange}
            prefixed
            aria-label="Hex color"
            className={STYLES.hexInput}
          />
          <EyedropperButton onChange={onChange} />
          <button
            type="button"
            onClick={() => addSavedColor(value)}
            title="Save color to palette"
            aria-label="Save color to palette"
            className={STYLES.iconButton}
          >
            <Plus size={14} />
          </button>
        </div>

        {showSavedColors && savedColors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {savedColors.map((color) => (
              <div key={color} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    onChange(color);
                    onClose();
                  }}
                  title={color}
                  aria-label={`Use ${color}`}
                  className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                    normalizeColor(color) === current
                      ? "border-white ring-1 ring-white"
                      : "border-white/20"
                  }`}
                  style={{ backgroundColor: color }}
                />
                <button
                  type="button"
                  onClick={() => removeSavedColor(color)}
                  title="Remove from palette"
                  aria-label={`Remove ${color}`}
                  className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/40 group-hover:flex"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

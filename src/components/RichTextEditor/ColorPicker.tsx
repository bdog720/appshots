/**
 * ColorPicker Component
 *
 * Color picker button for text styling selection with a custom tooltip.
 */

import type { ReactNode } from "react";
import { Palette } from "lucide-react";
import { ColorField } from "../ColorField/ColorField";
import { ICON_SIZE, STYLES } from "./constants";
import { Tooltip } from "./Tooltip";

interface ColorPickerProps {
  /** Current color value */
  value: string;
  /** Change handler */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Mouse down handler (for focus management) */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Accessible label and tooltip */
  tooltip?: string;
  /** Icon to render inside the trigger */
  icon?: ReactNode;
}

/**
 * ColorPicker - Text color selection button
 *
 * Displays a palette icon with color indicator and hidden color input.
 *
 * @param props - Component props
 *
 * @example
 * <ColorPicker
 *   value={textColor}
 *   onChange={handleColorChange}
  *   onMouseDown={preventFocus}
 *   tooltip="Text Color"
 * />
 */
export const ColorPicker = ({
  value,
  onChange,
  onMouseDown,
  tooltip = "Text Color",
  icon,
}: ColorPickerProps) => (
  <ColorField
    value={value}
    onChange={(color) =>
      onChange({
        target: { value: color },
      } as React.ChangeEvent<HTMLInputElement>)
    }
    label={tooltip}
    renderTrigger={({ open }) => (
      <Tooltip content={tooltip}>
        <button
          type="button"
          onMouseDown={onMouseDown}
          onClick={open}
          aria-label={tooltip}
          className={`relative ${STYLES.toolbarButton} ${STYLES.toolbarButtonInactive}`}
        >
          {icon ?? <Palette size={ICON_SIZE} />}
          {/* Color indicator bar */}
          <div
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
            style={{ backgroundColor: value }}
          />
        </button>
      </Tooltip>
    )}
  />
);

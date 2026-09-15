/**
 * ColorField Component
 *
 * Public, reusable in-app color field: a trigger (default: a swatch button,
 * or a caller-supplied renderTrigger) that opens a ColorPopover with
 * first-class hex entry, an eyedropper, and the project's saved-swatch
 * palette.
 */

import { useState } from "react";
import { ColorPopover } from "./ColorPopover";
import { STYLES } from "./constants";

interface RenderTriggerArgs {
  value: string;
  open: () => void;
  isOpen: boolean;
}

interface ColorFieldProps {
  /** Current color value */
  value: string;
  /** Change handler */
  onChange: (color: string) => void;
  /** Accessible label, used for the default trigger and the popover dialog */
  label?: string;
  /** Whether to show the saved-swatch palette (default true) */
  showSavedColors?: boolean;
  /** Custom trigger renderer; defaults to a swatch button */
  renderTrigger?: (args: RenderTriggerArgs) => React.ReactNode;
}

export const ColorField = ({
  value,
  onChange,
  label = "Color",
  showSavedColors = true,
  renderTrigger,
}: ColorFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <div className="relative inline-block">
      {renderTrigger ? (
        renderTrigger({ value, open, isOpen })
      ) : (
        <button
          type="button"
          onClick={open}
          title={label}
          aria-label={label}
          className={STYLES.trigger}
          style={{ backgroundColor: value }}
        />
      )}

      {isOpen && (
        <ColorPopover
          value={value}
          onChange={onChange}
          onClose={close}
          label={label}
          showSavedColors={showSavedColors}
        />
      )}
    </div>
  );
};

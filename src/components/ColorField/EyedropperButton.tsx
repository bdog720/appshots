/**
 * EyedropperButton Component
 *
 * Renders a native screen-color-sampling button, but only where the browser
 * supports the EyeDropper API (Chromium). Absent elsewhere.
 */

import { Pipette } from "lucide-react";
import { useEyeDropper } from "./useEyeDropper";
import { STYLES } from "./constants";

interface EyedropperButtonProps {
  /** Called with the sampled hex color; not called if the sample is cancelled. */
  onChange: (color: string) => void;
}

export const EyedropperButton = ({ onChange }: EyedropperButtonProps) => {
  const { isSupported, open } = useEyeDropper();

  if (!isSupported) return null;

  const handleClick = async () => {
    const sampled = await open();
    if (sampled) onChange(sampled);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Pick color from screen"
      aria-label="Pick color from screen with eyedropper"
      className={STYLES.iconButton}
    >
      <Pipette size={14} />
    </button>
  );
};

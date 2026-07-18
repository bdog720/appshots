/**
 * SwatchColorInput Component
 *
 * A native color input paired with a project-level palette of saved swatches.
 * The "+" button saves the current color; saved swatches can be re-applied with
 * a click or removed via the hover ✕. The palette lives on the project (via
 * EditorContext) so it persists and travels with export/import.
 */

import { Plus, X } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import { normalizeColor } from "../../lib/saved-colors";

interface SwatchColorInputProps {
  /** Current color value */
  value: string;
  /** Change handler */
  onChange: (color: string) => void;
  /** Optional class override for the native input */
  inputClassName?: string;
}

export const SwatchColorInput = ({
  value,
  onChange,
  inputClassName = "flex-1 h-8 rounded-md cursor-pointer bg-transparent",
}: SwatchColorInputProps) => {
  const { savedColors, addSavedColor, removeSavedColor } = useEditor();
  const current = normalizeColor(value);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={() => addSavedColor(value)}
          title="Save color to palette"
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-[#2a2a2a] text-gray-300 hover:bg-[#333] hover:text-white"
        >
          <Plus size={14} />
        </button>
      </div>

      {savedColors.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {savedColors.map((color) => (
            <div key={color} className="group relative">
              <button
                type="button"
                onClick={() => onChange(color)}
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
  );
};

/**
 * TextSection Component
 *
 * Typography controls for the active screenshot, separated from device Layout.
 * Implements the global-default / per-screenshot-override model (Model A): a
 * scope toggle switches between editing the project-wide defaults (which flow
 * into every screenshot that hasn't been customized) and overriding just the
 * active screenshot. Overridden values can be reset back to the global default.
 */

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import type { TextSettingKey } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { SwatchColorInput } from "./SwatchColorInput";
import { ContrastIndicator } from "./ContrastIndicator";
import { STYLES, SLIDER_RANGES } from "./constants";

type Scope = "global" | "screenshot";

const SLIDER_CONTROLS: {
  key: TextSettingKey;
  label: string;
  range: { min: number; max: number; step?: number };
  unit: string;
}[] = [
  { key: "headlineFontSize", label: "Headline Size", range: SLIDER_RANGES.headlineSize, unit: "px" },
  { key: "subheadlineFontSize", label: "Subheadline Size", range: SLIDER_RANGES.subheadlineSize, unit: "px" },
  { key: "headlineWidth", label: "Headline Width", range: SLIDER_RANGES.textWidth, unit: "%" },
  { key: "subheadlineWidth", label: "Subheadline Width", range: SLIDER_RANGES.textWidth, unit: "%" },
];

export const TextSection = () => {
  const {
    textDefaults,
    setTextDefault,
    activeScreenshot,
    setActiveScreenshotText,
    resetActiveScreenshotText,
    setIsFontPickerOpen,
    setFontPickerScope,
  } = useEditor();

  const [scope, setScope] = useState<Scope>("global");
  const isGlobal = scope === "global";
  const source = isGlobal ? textDefaults : activeScreenshot;

  const setValue = <K extends TextSettingKey>(
    key: K,
    value: (typeof textDefaults)[K],
  ) => {
    if (isGlobal) setTextDefault(key, value);
    else setActiveScreenshotText(key, value);
  };

  const isOverridden = (key: TextSettingKey) =>
    !isGlobal && activeScreenshot.textOverrides.includes(key);

  const openFontPicker = () => {
    setFontPickerScope(scope);
    setIsFontPickerOpen(true);
  };

  // A label row with a "reset to default" button shown only for overridden keys.
  const LabelRow = ({
    label,
    valueText,
    settingKey,
  }: {
    label: string;
    valueText?: string;
    settingKey: TextSettingKey;
  }) => (
    <div className="flex items-center justify-between mb-1">
      <span className={STYLES.label}>
        {label}
        {valueText ? `: ${valueText}` : ""}
      </span>
      {isOverridden(settingKey) && (
        <button
          type="button"
          onClick={() => resetActiveScreenshotText(settingKey)}
          className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200"
          title="Reset to global default"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      )}
    </div>
  );

  return (
    <SidebarSection title="Text">
      {/* Scope toggle */}
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

      <p className="text-[11px] text-zinc-500 mb-3">
        {isGlobal
          ? "Applies to every screenshot that hasn't been customized."
          : "Overrides just this screenshot. Reset a value to follow the global default again."}
      </p>

      <div className="space-y-3">
        {/* Font family */}
        <div>
          <LabelRow label="Font" settingKey="fontFamily" />
          <button onClick={openFontPicker} className={STYLES.dropdownButton}>
            <span style={{ fontFamily: `'${source.fontFamily}', sans-serif` }}>
              {source.fontFamily}
            </span>
            <ChevronDown size={16} className="text-zinc-400" />
          </button>
        </div>

        {/* Size / width sliders */}
        {SLIDER_CONTROLS.map(({ key, label, range, unit }) => (
          <div key={key}>
            <LabelRow
              label={label}
              valueText={`${source[key]}${unit}`}
              settingKey={key}
            />
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step ?? 1}
              value={source[key] as number}
              onChange={(e) => setValue(key, Number(e.target.value))}
              className={STYLES.rangeSlider}
              aria-label={label}
            />
          </div>
        ))}

        {/* Text color */}
        <div>
          <LabelRow label="Text Color" settingKey="textColor" />
          <SwatchColorInput
            value={source.textColor}
            onChange={(color) => setValue("textColor", color)}
            label="Text color"
          />
          <ContrastIndicator
            textColor={source.textColor}
            screenshot={activeScreenshot}
            onFix={(color) => setValue("textColor", color)}
          />
        </div>
      </div>
    </SidebarSection>
  );
};

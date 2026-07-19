/**
 * BrandGuideSection
 *
 * Define a brand once (color + a guided "vibe", or manual controls) and generate a
 * coordinated, contrast-validated look. Two axis questions (Character x Energy)
 * recommend one of six vibes; the user can also pick any vibe card directly. A live
 * preview reuses the contrast chip. Apply (Task 8) writes the project defaults.
 * Collapsible; placed first in the right sidebar.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import {
  VIBES,
  vibeForAxes,
  generateBrandLook,
  type Character,
  type Energy,
} from "../../lib/brand-guide";
import { resolveGradientStops } from "../../lib/background-settings";
import { assessScreenshotContrast } from "../../lib/design-guidance";
import { SwatchColorInput } from "./SwatchColorInput";
import { STYLES } from "./constants";
import type { Screenshot } from "../../types";

type Mode = "guided" | "advanced";

const CHARACTERS: { value: Character; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "friendly", label: "Friendly" },
  { value: "classic", label: "Classic" },
];
const ENERGIES: { value: Energy; label: string }[] = [
  { value: "calm", label: "Calm & minimal" },
  { value: "bold", label: "Bold & vivid" },
];

export const BrandGuideSection = () => {
  const { backgroundDefaults, screenshots, setTextDefault, applyBrandBackground } =
    useEditor();
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<Mode>("guided");
  const [brandColor, setBrandColor] = useState<string>(
    backgroundDefaults.backgroundColor ?? "#8b5cf6",
  );
  const [character, setCharacter] = useState<Character | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [vibeId, setVibeId] = useState<string>("minimal");
  const [advancedFont, setAdvancedFont] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // When both axes are answered, recommend (and select) the matching vibe.
  const recommend = (c: Character | null, e: Energy | null) => {
    if (c && e) setVibeId(vibeForAxes(c, e).id);
  };

  const look = useMemo(
    () => generateBrandLook(brandColor, vibeId),
    [brandColor, vibeId],
  );

  // Advanced mode lets the user override the resolved font directly; the
  // background/text-color recipe still comes from the selected vibe.
  const effective = useMemo(
    () => (advancedFont ? { ...look, fontFamily: advancedFont } : look),
    [look, advancedFont],
  );

  // Build a Screenshot-shaped probe so the contrast chip can assess the look.
  // `assessScreenshotContrast` (via backgroundContrast/resolveGradientStops and
  // visibleElements) currently only reads: backgroundMode, backgroundColor,
  // gradientPresetId, gradientFrom, gradientTo, headline, subheadline,
  // headlineFontSize, subheadlineFontSize. The cast below is intentional —
  // it's a partial Screenshot carrying exactly those fields — and must be kept
  // in sync if the contrast engine starts reading more of Screenshot.
  const probe = useMemo(
    () =>
      ({
        headline: "Aa",
        subheadline: "Aa",
        ...effective.background,
        headlineFontSize: effective.headlineFontSize,
        subheadlineFontSize: effective.subheadlineFontSize,
      }) as unknown as Screenshot,
    [effective],
  );
  const assessment = assessScreenshotContrast(effective.textColor, probe);

  const stops = resolveGradientStops(effective.background);
  const previewBg = stops
    ? `linear-gradient(180deg, ${stops.from}, ${stops.to})`
    : effective.background.backgroundColor;

  const applyBrand = () => {
    setTextDefault("fontFamily", effective.fontFamily);
    setTextDefault("headlineFontSize", effective.headlineFontSize);
    setTextDefault("subheadlineFontSize", effective.subheadlineFontSize);
    setTextDefault("textColor", effective.textColor);
    applyBrandBackground(effective.background);
    setConfirming(false);
  };

  return (
    <section className={STYLES.section}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between"
      >
        <span className={`${STYLES.sectionTitle} mb-0`}>Brand guide</span>
        {expanded ? (
          <ChevronDown size={16} className="text-zinc-400" />
        ) : (
          <ChevronRight size={16} className="text-zinc-400" />
        )}
      </button>

      {expanded && (
        <div className={`${STYLES.sectionContent} mt-3`}>
          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 bg-input rounded-lg">
            <button
              type="button"
              className={`${STYLES.modeButton} ${mode === "guided" ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => setMode("guided")}
            >
              Guided
            </button>
            <button
              type="button"
              className={`${STYLES.modeButton} ${mode === "advanced" ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => setMode("advanced")}
            >
              I'll set it myself
            </button>
          </div>

          {/* Brand color (shared) */}
          <div>
            <label className={STYLES.label}>Brand color</label>
            <SwatchColorInput
              value={brandColor}
              onChange={setBrandColor}
              label="Brand color"
            />
          </div>

          {mode === "guided" && (
            <>
              <div>
                <p className={STYLES.label}>Character</p>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {CHARACTERS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => {
                        setCharacter(c.value);
                        recommend(c.value, energy);
                      }}
                      aria-pressed={character === c.value}
                      className={`${STYLES.modeButton} ${character === c.value ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={STYLES.label}>Energy</p>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {ENERGIES.map((e) => (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => {
                        setEnergy(e.value);
                        recommend(character, e.value);
                      }}
                      aria-pressed={energy === e.value}
                      className={`${STYLES.modeButton} ${energy === e.value ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vibe cards */}
              <div className="grid grid-cols-2 gap-1">
                {VIBES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setVibeId(v.id);
                      setCharacter(v.character);
                      setEnergy(v.energy);
                    }}
                    aria-pressed={vibeId === v.id}
                    aria-label={v.label}
                    className={`rounded-md px-2 py-1.5 text-left text-xs ${vibeId === v.id ? "ring-2 ring-violet-400 bg-input" : "bg-input/50 hover:bg-input"}`}
                  >
                    <span style={{ fontFamily: `'${v.fontFamily}', sans-serif` }}>
                      {v.label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "advanced" && (
            <div className="space-y-2">
              <label className={STYLES.label}>Font</label>
              <select
                value={effective.fontFamily}
                onChange={(e) => setAdvancedFont(e.target.value)}
                className={STYLES.dropdownButton}
              >
                {VIBES.map((v) => (
                  <option key={v.id} value={v.fontFamily}>
                    {v.fontFamily}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500">
                Pick any brand color and font; the background and readable text color
                are still derived and contrast-checked from your chosen vibe.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {VIBES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVibeId(v.id);
                      setAdvancedFont(null);
                    }}
                    aria-pressed={vibeId === v.id}
                    aria-label={v.label}
                    className={`rounded-md px-2 py-1.5 text-left text-xs ${vibeId === v.id ? "ring-2 ring-violet-400 bg-input" : "bg-input/50 hover:bg-input"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live preview */}
          <div>
            <p className={STYLES.label}>Preview</p>
            <div
              className="rounded-lg p-4 text-center mt-1"
              style={{ background: previewBg }}
            >
              <div
                style={{
                  color: effective.textColor,
                  fontFamily: `'${effective.fontFamily}', sans-serif`,
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                Aa
              </div>
              <div
                style={{
                  color: effective.textColor,
                  fontFamily: `'${effective.fontFamily}', sans-serif`,
                  fontSize: 12,
                }}
              >
                Your headline
              </div>
            </div>
            {assessment && (
              <p
                className={`mt-1 text-[11px] ${assessment.passes ? "text-emerald-400" : "text-amber-300"}`}
              >
                {assessment.passes ? "Readable" : "Low contrast"} ·{" "}
                {assessment.ratio.toFixed(1)}:1
              </p>
            )}
          </div>

          {/* Apply — two-step inline confirm */}
          {confirming ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={applyBrand}
                className="flex-1 rounded-md bg-violet-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
              >
                Apply to {screenshots.length} screenshot
                {screenshots.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md bg-input px-2 py-1.5 text-xs text-zinc-300 hover:bg-input/70"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full rounded-md bg-violet-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
            >
              Apply brand to project
            </button>
          )}
          <p className="text-[10px] text-zinc-500">
            Sets your global text + background. Screenshots with a custom background
            will be reset to the brand look. Undo reverts it.
          </p>
        </div>
      )}
    </section>
  );
};

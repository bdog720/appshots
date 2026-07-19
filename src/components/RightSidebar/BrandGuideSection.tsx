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
  const { backgroundDefaults } = useEditor();
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<Mode>("guided");
  const [brandColor, setBrandColor] = useState<string>(
    backgroundDefaults.backgroundColor ?? "#8b5cf6",
  );
  const [character, setCharacter] = useState<Character | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [vibeId, setVibeId] = useState<string>("minimal");

  // When both axes are answered, recommend (and select) the matching vibe.
  const recommend = (c: Character | null, e: Energy | null) => {
    if (c && e) setVibeId(vibeForAxes(c, e).id);
  };

  const look = useMemo(
    () => generateBrandLook(brandColor, vibeId),
    [brandColor, vibeId],
  );

  // Build a Screenshot-shaped probe so the contrast chip can assess the look.
  const probe = useMemo(
    () =>
      ({
        headline: "Aa",
        subheadline: "Aa",
        ...look.background,
        headlineFontSize: look.headlineFontSize,
        subheadlineFontSize: look.subheadlineFontSize,
      }) as unknown as Screenshot,
    [look],
  );
  const assessment = assessScreenshotContrast(look.textColor, probe);

  const stops = resolveGradientStops(look.background);
  const previewBg = stops
    ? `linear-gradient(180deg, ${stops.from}, ${stops.to})`
    : look.background.backgroundColor;

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
            <p className="text-[11px] text-zinc-500">
              Advanced controls appear here (font, background, sizes) — added next.
            </p>
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
                  color: look.textColor,
                  fontFamily: `'${look.fontFamily}', sans-serif`,
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                Aa
              </div>
              <div
                style={{
                  color: look.textColor,
                  fontFamily: `'${look.fontFamily}', sans-serif`,
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

          {/* Apply placeholder — wired in Task 8 */}
          <button
            type="button"
            disabled
            className={`${STYLES.dropdownButton} justify-center opacity-50 cursor-not-allowed`}
          >
            Apply brand to project
          </button>
        </div>
      )}
    </section>
  );
};

import { describe, it, expect } from "vitest";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  applyBackgroundDefaultToScreenshots,
} from "../lib/background-settings";

// Mirrors the rule normalizeScreenshot applies: a persisted screenshot with no
// backgroundOverride flag must become overridden so it keeps its own background.
// Generic (rather than a fixed `{ backgroundOverride?: boolean }` param type) so
// the return type still carries the rest of the screenshot's fields — otherwise
// TS narrows the spread's type to just the override flag and callers below fail
// to satisfy BackgroundOverrideCarrier. `Record<string, unknown>` (rather than
// `{ backgroundOverride?: boolean }`) sidesteps TS's "weak type" excess-property
// check, which would otherwise reject a legacy object with no matching keys.
const migrateFlag = <T extends Record<string, unknown>>(
  s: T,
): T & { backgroundOverride: boolean } => ({
  ...s,
  backgroundOverride: (s as { backgroundOverride?: boolean }).backgroundOverride ?? true,
});

describe("background migration contract", () => {
  it("marks legacy screenshots as overridden so their look is preserved", () => {
    const legacy = { id: "a", backgroundColor: "#123", backgroundMode: "solid" as const, gradientPresetId: null };
    const migrated = migrateFlag(legacy);
    expect(migrated.backgroundOverride).toBe(true);

    // A later Apply of a new default must NOT touch this preserved screenshot.
    const result = applyBackgroundDefaultToScreenshots(
      [migrated],
      { ...DEFAULT_BACKGROUND_SETTINGS, backgroundColor: "#ff0000" },
    );
    expect(result[0].backgroundColor).toBe("#123");
  });

  it("keeps an explicit false flag as inheriting", () => {
    const fresh = { id: "b", backgroundColor: "#123", backgroundMode: "solid" as const, gradientPresetId: null, backgroundOverride: false };
    expect(migrateFlag(fresh).backgroundOverride).toBe(false);
  });
});

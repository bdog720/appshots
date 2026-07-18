/**
 * Text settings — global defaults with per-screenshot overrides (Model A).
 *
 * Six text properties (headline/subheadline size, font family, text color,
 * headline/subheadline width) each have a project-level default that a
 * screenshot inherits until it explicitly overrides that property. The
 * concrete, resolved value always lives on the screenshot so the preview and
 * export pipelines can keep reading it directly; `textOverrides` records which
 * of those values are explicit overrides rather than inherited defaults.
 */

export type TextSettings = {
  headlineFontSize: number;
  subheadlineFontSize: number;
  fontFamily: string;
  textColor: string;
  headlineWidth: number;
  subheadlineWidth: number;
};

export type TextSettingKey = keyof TextSettings;

/** Canonical key order — also drives `pickTextSettings` output shape. */
export const TEXT_SETTING_KEYS: TextSettingKey[] = [
  "headlineFontSize",
  "subheadlineFontSize",
  "fontFamily",
  "textColor",
  "headlineWidth",
  "subheadlineWidth",
];

/** Baseline defaults for a fresh project. */
export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  headlineFontSize: 72,
  subheadlineFontSize: 42,
  fontFamily: "Inter",
  textColor: "#ffffff",
  headlineWidth: 80,
  subheadlineWidth: 80,
};

/** Anything that carries the resolved text values plus an override list. */
export type TextOverrideCarrier = TextSettings & {
  textOverrides: TextSettingKey[];
};

/** Extracts only the six text-setting fields from a larger object. */
export const pickTextSettings = (source: TextSettings): TextSettings => ({
  headlineFontSize: source.headlineFontSize,
  subheadlineFontSize: source.subheadlineFontSize,
  fontFamily: source.fontFamily,
  textColor: source.textColor,
  headlineWidth: source.headlineWidth,
  subheadlineWidth: source.subheadlineWidth,
});

/** True when `key` is explicitly overridden on this carrier. */
export const isTextOverridden = (
  item: TextOverrideCarrier,
  key: TextSettingKey,
): boolean => item.textOverrides.includes(key);

/** Sets `key` to `value` and records it as an override (idempotent). */
export const overrideScreenshotText = <
  T extends TextOverrideCarrier,
  K extends TextSettingKey,
>(
  item: T,
  key: K,
  value: TextSettings[K],
): T => ({
  ...item,
  [key]: value,
  textOverrides: item.textOverrides.includes(key)
    ? item.textOverrides
    : [...item.textOverrides, key],
});

/** Restores `key` to the default value and clears its override flag. */
export const resetScreenshotText = <T extends TextOverrideCarrier>(
  item: T,
  key: TextSettingKey,
  defaults: TextSettings,
): T => ({
  ...item,
  [key]: defaults[key],
  textOverrides: item.textOverrides.filter((k) => k !== key),
});

/**
 * Propagates a changed default to every screenshot that does not override the
 * key, leaving overriding screenshots untouched (true Model A inheritance).
 */
export const applyTextDefaultToScreenshots = <T extends TextOverrideCarrier>(
  screenshots: T[],
  key: TextSettingKey,
  value: TextSettings[TextSettingKey],
): T[] =>
  screenshots.map((s) =>
    s.textOverrides.includes(key) ? s : { ...s, [key]: value },
  );

/** Keys whose current value differs from the defaults (used during migration). */
export const deriveTextOverrides = (
  item: TextSettings,
  defaults: TextSettings,
): TextSettingKey[] =>
  TEXT_SETTING_KEYS.filter((key) => item[key] !== defaults[key]);

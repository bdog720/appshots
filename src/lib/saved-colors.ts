/**
 * Saved color palette helpers.
 *
 * A project keeps a small list of user-saved color swatches, shown alongside
 * the native color pickers. Colors are stored normalized (lowercase) so the
 * same color entered in different casing de-duplicates, and the list is capped
 * so it can't grow without bound.
 */

/** Maximum number of swatches kept per project. */
export const MAX_SAVED_COLORS = 24;

/** Normalizes a color string for comparison and storage. */
export const normalizeColor = (color: string): string =>
  color.trim().toLowerCase();

/**
 * Adds a color to the front of the palette (most-recent-first), skipping it if
 * an equal color already exists and trimming the oldest entries past the cap.
 */
export const addColorToPalette = (
  colors: string[],
  color: string,
): string[] => {
  const normalized = normalizeColor(color);
  if (colors.some((c) => normalizeColor(c) === normalized)) return colors;
  return [normalized, ...colors].slice(0, MAX_SAVED_COLORS);
};

/** Removes a color from the palette, comparing case-insensitively. */
export const removeColorFromPalette = (
  colors: string[],
  color: string,
): string[] => {
  const normalized = normalizeColor(color);
  return colors.filter((c) => normalizeColor(c) !== normalized);
};

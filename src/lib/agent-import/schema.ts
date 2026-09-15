/**
 * The agent import manifest (`appshots.json`), defined once in Zod. Types,
 * validation (with issue paths), and the published JSON Schema all derive from
 * this file. Enum-like fields that have a closed, stable list (layout, style,
 * gradient preset) are enums; device / color / font / export size are plain
 * strings resolved in compile so unknown values become fallback warnings.
 *
 * Keep this schema free of `.transform()` — `z.toJSONSchema` cannot represent
 * transforms. Normalization (hex casing, defaults) happens in compile.
 */

import { z } from "zod";
import { gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { LAYOUT_PRESET_IDS } from "../layout-presets";
import { formatIssuePath, type ImportIssue } from "./issues";

export const IMPORT_FORMAT = "appshots-import";
export const IMPORT_VERSION = 1;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hex = () =>
  z.string().regex(HEX_COLOR, "expected a hex color like #5B5BD6");

const stringEnum = (values: readonly string[]) =>
  z.enum(values as [string, ...string[]]);

const range = (min: number, max: number) => z.number().min(min).max(max);

const backgroundSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("solid"), color: hex() }),
  z.strictObject({ type: z.literal("gradient"), from: hex(), to: hex() }),
  z.strictObject({
    type: z.literal("preset"),
    id: stringEnum(gradientPresets.map((p) => p.id)),
  }),
]);

const shadowSchema = z.union([
  z.boolean(),
  z.strictObject({
    enabled: z.boolean().optional(),
    color: hex().optional(),
    blur: range(0, 100).optional(),
    offsetX: range(-50, 50).optional(),
    offsetY: range(-50, 50).optional(),
  }),
]);

const deviceIdentityFields = {
  id: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  style: z.enum(["flat", "3d"]).optional(),
  shadow: shadowSchema.optional(),
};

const devicePlacementFields = {
  x: range(-100, 200).optional(),
  y: range(-50, 150).optional(),
  scale: range(10, 150).optional(),
  rotation: range(-360, 360).optional(),
  rotateX: range(-30, 30).optional(),
  rotateY: range(-45, 45).optional(),
};

const projectDeviceSchema = z.strictObject(deviceIdentityFields);

const screenDeviceSchema = z.strictObject({
  ...deviceIdentityFields,
  ...devicePlacementFields,
});

const deviceEntrySchema = z.strictObject({
  image: z.string().min(1).optional(),
  ...deviceIdentityFields,
  ...devicePlacementFields,
});

const textBoxSchema = z.strictObject({
  x: range(0, 100).optional(),
  y: range(0, 100).optional(),
  width: range(20, 120).optional(),
});

const screenTextSchema = z.strictObject({
  color: hex().optional(),
  font: z.string().min(1).optional(),
  headlineSize: range(12, 200).optional(),
  subheadlineSize: range(12, 200).optional(),
  headline: textBoxSchema.optional(),
  subheadline: textBoxSchema.optional(),
});

const overlaySchema = z.strictObject({
  image: z.string().min(1),
  x: range(-50, 150).optional(),
  y: range(-50, 150).optional(),
  width: range(1, 100).optional(),
  layer: z.enum(["behind", "front"]).optional(),
  rotation: range(-360, 360).optional(),
  shadow: shadowSchema.optional(),
});

const screenSchema = z
  .strictObject({
    image: z.string().min(1).optional(),
    devices: z.array(deviceEntrySchema).min(1).optional(),
    headline: z.string().min(1),
    subheadline: z.string().optional(),
    layout: stringEnum(LAYOUT_PRESET_IDS).optional(),
    background: backgroundSchema.optional(),
    text: screenTextSchema.optional(),
    device: screenDeviceSchema.optional(),
    overlays: z.array(overlaySchema).optional(),
  })
  .superRefine((screen, ctx) => {
    const hasImage = screen.image !== undefined;
    const hasDevices = screen.devices !== undefined;
    if (hasImage === hasDevices) {
      ctx.addIssue({
        code: "custom",
        path: ["image"],
        message: hasImage
          ? "use either image or devices, not both"
          : "a screen needs an image or a devices list",
      });
    }
  });

const brandSchema = z.strictObject({
  primary: hex().optional(),
  style: stringEnum(VIBES.map((v) => v.id)).optional(),
  font: z.string().min(1).optional(),
  textColor: hex().optional(),
  highlightColor: hex().optional(),
  headlineSize: range(12, 200).optional(),
  subheadlineSize: range(12, 200).optional(),
  background: backgroundSchema.optional(),
});

export const importManifestSchema = z.strictObject({
  $schema: z.string().optional(),
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(IMPORT_VERSION),
  name: z.string().min(1).max(100).optional(),
  exportSize: z.string().min(1).optional(),
  brand: brandSchema.optional(),
  device: projectDeviceSchema.optional(),
  screens: z.array(screenSchema).min(1),
});

export type ImportManifest = z.infer<typeof importManifestSchema>;
export type ManifestScreen = ImportManifest["screens"][number];
export type ManifestBackground = z.infer<typeof backgroundSchema>;
export type ManifestShadow = z.infer<typeof shadowSchema>;
export type ManifestDeviceEntry = z.infer<typeof deviceEntrySchema>;

export type ParseResult =
  | { ok: true; manifest: ImportManifest }
  | { ok: false; errors: ImportIssue[] };

export const parseManifest = (text: string): ParseResult => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ path: "appshots.json", message: "file is not valid JSON" }],
    };
  }

  const result = importManifestSchema.safeParse(data);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
    })),
  };
};

export const buildJsonSchema = (): Record<string, unknown> => ({
  ...(z.toJSONSchema(importManifestSchema) as Record<string, unknown>),
  title: "AppShots agent import manifest (appshots.json)",
});

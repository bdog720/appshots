/**
 * Compiles a validated manifest plus its decoded images into an ordinary
 * Project, the same shape the editor builds by hand. Pure: ids and time are
 * injected, images arrive already decoded.
 */

import type { DeviceInstance, ImageOverlay, Project, Screenshot } from "../../types";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  overrideScreenshotBackground,
  pickBackgroundSettings,
  type BackgroundSettings,
} from "../background-settings";
import { generateBrandLook, pickReadableTextColor } from "../brand-guide";
import { contrastRatio, evaluateProjectContrast } from "../design-guidance";
import { DEFAULT_DEVICE_SHADOW, createDeviceInstance } from "../device-instances";
import {
  DEFAULT_LAYOUT_PRESET_ID,
  getLayoutPreset,
  type LayoutPreset,
} from "../layout-presets";
import { addColorToPalette } from "../saved-colors";
import {
  DEFAULT_TEXT_SETTINGS,
  overrideScreenshotText,
  type TextSettings,
} from "../text-settings";
import { ImportError, type ImportIssue } from "./issues";
import {
  DEFAULT_OVERLAY_SHADOW,
  backgroundStopsOf,
  checkPlatformMismatch,
  deriveHighlightColor,
  normalizeHex,
  resolveDevice,
  resolveDeviceColor,
  resolveExportSize,
  resolveFont,
  resolveShadow,
  toBackgroundSettings,
  type Resolved,
} from "./resolve";
import { applyHighlightColor, sanitizeRichText } from "./sanitize";
import type { ImportManifest, ManifestDeviceEntry, ManifestScreen } from "./schema";

export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export const imageKey = (reference: string): string =>
  (reference.split(/[\\/]/).pop() ?? reference).toLowerCase();

export interface ImageReference {
  path: string;
  name: string;
}

export const listImageReferences = (manifest: ImportManifest): ImageReference[] =>
  manifest.screens.flatMap((screen, i) => [
    ...(screen.image ? [{ path: `screens[${i}].image`, name: screen.image }] : []),
    ...(screen.overlays ?? []).map((overlay, k) => ({
      path: `screens[${i}].overlays[${k}].image`,
      name: overlay.image,
    })),
    ...(screen.devices ?? []).flatMap((device, j) =>
      device.image
        ? [{ path: `screens[${i}].devices[${j}].image`, name: device.image }]
        : [],
    ),
  ]);

export const findMissingImages = (
  manifest: ImportManifest,
  availableKeys: Set<string>,
): ImportIssue[] =>
  listImageReferences(manifest)
    .filter((ref) => !availableKeys.has(imageKey(ref.name)))
    .map((ref) => ({ path: ref.path, message: `image "${ref.name}" is not in the bundle` }));

export interface CompileParams {
  manifest: ImportManifest;
  /** Decoded images keyed by `imageKey`. */
  images: Map<string, LoadedImage>;
  /** Every image filename in the bundle, for the "unused image" warning. */
  bundleImageNames?: string[];
  generateId: () => string;
  now?: () => number;
}

export interface CompileResult {
  project: Project;
  warnings: ImportIssue[];
}

type DeviceOverrides = Omit<ManifestDeviceEntry, "image">;

export const compileManifest = ({
  manifest,
  images,
  bundleImageNames = [],
  generateId,
  now = Date.now,
}: CompileParams): CompileResult => {
  const missing = findMissingImages(manifest, new Set(images.keys()));
  if (missing.length > 0) throw new ImportError(missing);

  const warnings: ImportIssue[] = [];
  const note = (warning: ImportIssue | null) => {
    if (warning) warnings.push(warning);
  };
  const track = <T>(resolved: Resolved<T>): T => {
    note(resolved.warning);
    return resolved.value;
  };
  const image = (name: string): LoadedImage => images.get(imageKey(name)) as LoadedImage;

  // --- Brand → project defaults -------------------------------------------
  const brand = manifest.brand ?? {};
  const primary = brand.primary ? normalizeHex(brand.primary) : undefined;
  if (brand.style && !primary) {
    note({
      path: "brand.style",
      message: "style needs brand.primary to generate a look; ignoring style",
    });
  }
  const look = primary ? generateBrandLook(primary, brand.style ?? "minimal") : null;

  const backgroundDefaults: BackgroundSettings = brand.background
    ? toBackgroundSettings(brand.background)
    : (look?.background ?? { ...DEFAULT_BACKGROUND_SETTINGS });

  const textDefaults: TextSettings = {
    ...DEFAULT_TEXT_SETTINGS,
    fontFamily:
      brand.font !== undefined
        ? track(resolveFont(brand.font, "brand.font"))
        : (look?.fontFamily ?? DEFAULT_TEXT_SETTINGS.fontFamily),
    headlineFontSize:
      brand.headlineSize ?? look?.headlineFontSize ?? DEFAULT_TEXT_SETTINGS.headlineFontSize,
    subheadlineFontSize:
      brand.subheadlineSize ??
      look?.subheadlineFontSize ??
      DEFAULT_TEXT_SETTINGS.subheadlineFontSize,
    textColor: brand.textColor
      ? normalizeHex(brand.textColor)
      : look || brand.background
        ? pickReadableTextColor(backgroundDefaults)
        : DEFAULT_TEXT_SETTINGS.textColor,
  };

  // --- Project device + export size ----------------------------------------
  const projectDevice = manifest.device ?? {};
  const spec = track(resolveDevice(projectDevice.id, "device.id"));
  const colorId = track(resolveDeviceColor(spec, projectDevice.color, "device.color"));
  const projectShadow = resolveShadow(projectDevice.shadow, DEFAULT_DEVICE_SHADOW);
  const exportSize = track(resolveExportSize(manifest.exportSize, spec.id, "exportSize"));
  note(checkPlatformMismatch(spec.id, exportSize.id));

  // --- Screens ---------------------------------------------------------------
  const buildDevice = (
    overrides: DeviceOverrides,
    layout: LayoutPreset,
    imageName: string | undefined,
    path: string,
  ): DeviceInstance => {
    const deviceSpec =
      overrides.id !== undefined ? track(resolveDevice(overrides.id, `${path}.id`)) : spec;
    const deviceColor =
      overrides.color !== undefined
        ? track(resolveDeviceColor(deviceSpec, overrides.color, `${path}.color`))
        : deviceSpec.id === spec.id
          ? colorId
          : deviceSpec.colors[0].id;

    return createDeviceInstance({
      id: generateId(),
      deviceId: deviceSpec.id,
      colorId: deviceColor,
      screenshotSrc: imageName ? image(imageName).dataUrl : null,
      x: overrides.x ?? 50,
      y: overrides.y ?? layout.device.y,
      scale: overrides.scale ?? layout.device.scale,
      rotation: overrides.rotation ?? layout.device.rotation,
      style: overrides.style ?? layout.device.style ?? projectDevice.style ?? "flat",
      rotateX: overrides.rotateX ?? layout.device.rotateX,
      rotateY: overrides.rotateY ?? layout.device.rotateY,
      shadow: resolveShadow(overrides.shadow, projectShadow),
    });
  };

  const buildOverlay = (overlay: NonNullable<ManifestScreen["overlays"]>[number]): ImageOverlay => {
    const img = image(overlay.image);
    const aspect = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
    const width = overlay.width ?? 30;
    return {
      id: generateId(),
      src: img.dataUrl,
      x: overlay.x ?? 50,
      y: overlay.y ?? 50,
      width,
      height: width / aspect,
      layer: overlay.layer ?? "front",
      rotation: overlay.rotation ?? 0,
      shadow: resolveShadow(overlay.shadow, DEFAULT_OVERLAY_SHADOW),
    };
  };

  const buildScreen = (screen: ManifestScreen, i: number): Screenshot => {
    const path = `screens[${i}]`;
    const layout = getLayoutPreset(screen.layout ?? DEFAULT_LAYOUT_PRESET_ID);

    if (screen.devices && screen.device) {
      note({ path: `${path}.device`, message: "ignored because devices is set" });
    }
    const deviceList = screen.devices
      ? screen.devices.map(({ image: imageName, ...overrides }, j) =>
          buildDevice(overrides, layout, imageName, `${path}.devices[${j}]`),
        )
      : [buildDevice(screen.device ?? {}, layout, screen.image, `${path}.device`)];

    const headline = sanitizeRichText(screen.headline);
    const subheadline = sanitizeRichText(screen.subheadline ?? "");
    if (headline.stripped) {
      note({ path: `${path}.headline`, message: "unsupported HTML was removed" });
    }
    if (subheadline.stripped) {
      note({ path: `${path}.subheadline`, message: "unsupported HTML was removed" });
    }

    const text = screen.text;
    let shot: Screenshot = {
      id: generateId(),
      headline: headline.html,
      subheadline: subheadline.html,
      ...pickBackgroundSettings(backgroundDefaults),
      backgroundOverride: false,
      ...textDefaults,
      headlineX: text?.headline?.x ?? layout.text.headline.x,
      headlineY: text?.headline?.y ?? layout.text.headline.y,
      subheadlineX: text?.subheadline?.x ?? layout.text.subheadline.x,
      subheadlineY: text?.subheadline?.y ?? layout.text.subheadline.y,
      textOverrides: [],
      overlayImages: (screen.overlays ?? []).map(buildOverlay),
      devices: deviceList,
      activeDeviceId: deviceList[0].id,
    };

    if (screen.background) {
      shot = overrideScreenshotBackground(shot, toBackgroundSettings(screen.background));
    }
    if (text?.color) shot = overrideScreenshotText(shot, "textColor", normalizeHex(text.color));
    if (text?.font) {
      shot = overrideScreenshotText(shot, "fontFamily", track(resolveFont(text.font, `${path}.text.font`)));
    }
    if (text?.headlineSize !== undefined) {
      shot = overrideScreenshotText(shot, "headlineFontSize", text.headlineSize);
    }
    if (text?.subheadlineSize !== undefined) {
      shot = overrideScreenshotText(shot, "subheadlineFontSize", text.subheadlineSize);
    }
    if (text?.headline?.width !== undefined) {
      shot = overrideScreenshotText(shot, "headlineWidth", text.headline.width);
    }
    if (text?.subheadline?.width !== undefined) {
      shot = overrideScreenshotText(shot, "subheadlineWidth", text.subheadline.width);
    }

    const highlight = brand.highlightColor
      ? normalizeHex(brand.highlightColor)
      : deriveHighlightColor(primary, shot.textColor, backgroundStopsOf(shot));
    const headlineHtml = applyHighlightColor(shot.headline, highlight);
    const subheadlineHtml = applyHighlightColor(shot.subheadline, highlight);
    // Highlighted text keeps the text color, so an explicit highlight must contrast with it.
    if (brand.highlightColor && /<mark/i.test(headlineHtml + subheadlineHtml)) {
      const ratio = contrastRatio(shot.textColor, highlight);
      if (ratio < 3) {
        note({
          path: "brand.highlightColor",
          message: `highlighted text on ${path} is ${ratio.toFixed(2)}:1 against its text color ${shot.textColor}; pick a highlight that contrasts with the text (≥ 3:1) or omit highlightColor`,
        });
      }
    }
    return { ...shot, headline: headlineHtml, subheadline: subheadlineHtml };
  };

  const screenshots = manifest.screens.map(buildScreen);

  // --- Whole-set warnings --------------------------------------------------
  const indexById = new Map(screenshots.map((s, i) => [s.id, i]));
  for (const issue of evaluateProjectContrast(screenshots)) {
    warnings.push({
      path: `screens[${indexById.get(issue.screenshotId)}].${issue.element}`,
      message: `text contrast ${issue.ratio.toFixed(2)}:1 fails WCAG AA; ${issue.suggestedTextColor} would be readable`,
    });
  }

  const referenced = new Set(listImageReferences(manifest).map((ref) => imageKey(ref.name)));
  for (const name of bundleImageNames) {
    if (!referenced.has(imageKey(name))) {
      warnings.push({ path: "", message: `image "${name}" is in the bundle but no screen uses it` });
    }
  }

  const brandColors = [
    primary,
    brand.textColor ? normalizeHex(brand.textColor) : undefined,
    brand.highlightColor ? normalizeHex(brand.highlightColor) : undefined,
    ...backgroundStopsOf(backgroundDefaults),
  ].filter((c): c is string => Boolean(c));
  const savedColors = brandColors.reduceRight<string[]>(
    (palette, color) => addColorToPalette(palette, color),
    [],
  );

  const timestamp = now();
  return {
    project: {
      id: generateId(),
      name: manifest.name ?? "Imported Project",
      createdAt: timestamp,
      updatedAt: timestamp,
      screenshots,
      selectedDeviceId: spec.id,
      selectedColorId: colorId,
      exportSizeId: exportSize.id,
      activeScreenshotId: screenshots[0].id,
      textDefaults,
      backgroundDefaults,
      savedColors,
    },
    warnings,
  };
};

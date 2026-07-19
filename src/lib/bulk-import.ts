import type { DeviceInstance, Screenshot } from "../types";
import type { TextSettings } from "./text-settings";
import { cloneDeviceInstance, createDeviceInstance } from "./device-instances";

interface BuildImportedScreenshotsParams {
  /** The current screenshot whose style (background, devices) new tiles inherit. */
  base: Screenshot;
  /** Project text defaults applied to the new tiles' text. */
  textDefaults: TextSettings;
  /** Image data URLs, one per new tile, in the order they should appear. */
  images: string[];
  generateId: () => string;
}

/**
 * Build one screenshot tile per imported image. Each tile is cloned from the
 * current screenshot's style so an imported set looks consistent, carries the
 * image on its primary device (any additional devices are cleared of their
 * image), and gets fresh ids. Overlays are not copied; text uses the same
 * placeholders a normal "Add Screenshot" uses.
 */
export function buildImportedScreenshots({
  base,
  textDefaults,
  images,
  generateId,
}: BuildImportedScreenshotsParams): Screenshot[] {
  return images.map((image) => {
    const devices: DeviceInstance[] =
      base.devices.length > 0
        ? base.devices.map((device, index) =>
            cloneDeviceInstance(device, {
              id: generateId(),
              screenshotSrc: index === 0 ? image : null,
            }),
          )
        : [createDeviceInstance({ id: generateId(), screenshotSrc: image })];

    return {
      id: generateId(),
      headline: "New Screenshot",
      subheadline: "Add your description here",
      backgroundColor: base.backgroundColor,
      backgroundMode: base.backgroundMode,
      gradientPresetId: base.gradientPresetId,
      textColor: textDefaults.textColor,
      headlineX: 50,
      headlineY: 10,
      headlineWidth: textDefaults.headlineWidth,
      subheadlineX: 50,
      subheadlineY: 18,
      subheadlineWidth: textDefaults.subheadlineWidth,
      fontFamily: textDefaults.fontFamily,
      headlineFontSize: textDefaults.headlineFontSize,
      subheadlineFontSize: textDefaults.subheadlineFontSize,
      textOverrides: [],
      overlayImages: [],
      backgroundOverride: false,
      devices,
      activeDeviceId: devices[0].id,
    };
  });
}

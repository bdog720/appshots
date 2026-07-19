import type { DeviceInstance, Screenshot } from "../types";
import type { TextSettings } from "./text-settings";
import { cloneDeviceInstance, createDeviceInstance } from "./device-instances";
import {
  pickBackgroundSettings,
  type BackgroundSettings,
} from "./background-settings";

interface BuildImportedScreenshotsParams {
  /** The current screenshot whose style (devices) new tiles inherit. */
  base: Screenshot;
  /** Project text defaults applied to the new tiles' text. */
  textDefaults: TextSettings;
  /** Project background default new tiles inherit (they start un-overridden). */
  backgroundDefaults: BackgroundSettings;
  /** Image data URLs, one per new tile, in the order they should appear. */
  images: string[];
  generateId: () => string;
}

/**
 * Build one screenshot tile per imported image. Each tile clones the current
 * screenshot's devices so an imported set looks consistent, carries the image
 * on its primary device (any additional devices are cleared of their image),
 * and gets fresh ids. Background comes from the project default (not `base`)
 * so tiles inherit brand-applied gradients the same way `addScreenshot` does,
 * and starts un-overridden. Overlays are not copied; text uses the same
 * placeholders a normal "Add Screenshot" uses.
 */
export function buildImportedScreenshots({
  base,
  textDefaults,
  backgroundDefaults,
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
      ...pickBackgroundSettings(backgroundDefaults),
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

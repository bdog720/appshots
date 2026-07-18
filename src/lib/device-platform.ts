/**
 * Device platform detection
 *
 * The visual treatment of a device frame (camera cutout style and physical
 * button layout) is inferred from its `DeviceSpec.id` prefix rather than
 * stored explicitly. These helpers centralize that inference so the live
 * preview (DeviceFrame / DeviceFrame3D) and the canvas exporter stay in sync.
 *
 * Android brands (Samsung, Pixel) share a punch-hole camera and a right-side
 * button layout; Apple devices use a Dynamic Island / notch and the iPhone
 * button layout.
 */

const ANDROID_PREFIXES = ["samsung-", "pixel-"];

/**
 * True for Android devices (Samsung, Pixel) — punch-hole camera + Android buttons.
 */
export const isAndroidDevice = (deviceId: string): boolean =>
  ANDROID_PREFIXES.some((prefix) => deviceId.startsWith(prefix));

/**
 * True for Android tablets (e.g. Galaxy Tab) — affects punch-hole camera placement.
 * Apple tablets (iPad) are intentionally excluded; their id uses "ipad", not "tab".
 */
export const isAndroidTablet = (deviceId: string): boolean =>
  isAndroidDevice(deviceId) && deviceId.includes("tab");

/**
 * Camera Element Components
 *
 * Components that render the various camera/notch styles for different devices:
 * - Dynamic Island (iPhone 14 Pro and later)
 * - Notch (iPhone X through iPhone 13)
 * - Punch-hole camera (Samsung devices)
 */

import type { DeviceSpec } from "../../types";

/**
 * Dynamic Island - Modern iPhone camera housing (iPhone 14 Pro+)
 *
 * Renders the pill-shaped camera cutout used in newer iPhones.
 * Positioned at the top center of the screen.
 */
export const DynamicIsland = () => (
  <div
    className="absolute left-1/2 -translate-x-1/2 bg-black z-20"
    style={{
      top: "1.8%",
      width: "28%",
      height: "3.2%",
      borderRadius: "50px",
    }}
  />
);

/**
 * Notch - Classic iPhone notch (iPhone X - iPhone 13)
 *
 * Renders the wider notch design used in older Face ID iPhones.
 * Extends from the top edge of the screen.
 */
export const Notch = () => (
  <div
    className="absolute top-0 left-1/2 -translate-x-1/2 bg-black z-20"
    style={{
      width: "35%",
      height: "3.5%",
      borderRadius: "0 0 20px 20px",
    }}
  />
);

interface PunchHoleCameraProps {
  /** Whether the device is a tablet (affects camera position) */
  isTablet: boolean;
}

/**
 * Punch-hole Camera - Samsung device camera
 *
 * Renders a small circular camera cutout used in Samsung devices.
 * Position varies between phones (center) and tablets (offset left).
 *
 * @param props - Component props
 * @param props.isTablet - True for tablets, false for phones
 */
export const PunchHoleCamera = ({ isTablet }: PunchHoleCameraProps) => {
  const style = isTablet
    ? { top: "1.5%", left: "35%", width: "1.8%" }
    : { top: "2%", left: "50%", transform: "translateX(-50%)", width: "2.5%" };

  return (
    <div
      className={`absolute bg-black z-20 rounded-full ${!isTablet ? "-translate-x-1/2" : ""}`}
      style={{ ...style, aspectRatio: "1" }}
    />
  );
};

interface CameraElementProps {
  /** Device specification containing camera type info */
  device: DeviceSpec;
  /** Whether this is an Android device (Samsung, Pixel) */
  isAndroid: boolean;
  /** Whether this is an Android tablet (e.g. Galaxy Tab) */
  isAndroidTablet: boolean;
}

/**
 * CameraElement - Smart camera component selector
 *
 * Determines and renders the appropriate camera element based on device type.
 * Handles the logic for choosing between Dynamic Island, Notch, or Punch-hole.
 *
 * @param props - Component props
 * @param props.device - The device specification
 * @param props.isAndroid - Whether the device is Android (Samsung, Pixel)
 * @param props.isAndroidTablet - Whether the device is an Android tablet
 *
 * @example
 * <CameraElement
 *   device={selectedDevice}
 *   isAndroid={false}
 *   isAndroidTablet={false}
 * />
 */
export const CameraElement = ({
  device,
  isAndroid,
  isAndroidTablet,
}: CameraElementProps) => {
  // Android devices use punch-hole camera
  if (isAndroid) {
    return <PunchHoleCamera isTablet={isAndroidTablet} />;
  }

  // Modern iPhones use Dynamic Island
  if (device.hasIsland) {
    return <DynamicIsland />;
  }

  // Older iPhones use notch
  if (device.notchWidth > 0) {
    return <Notch />;
  }

  // No camera element (e.g., older devices without notch)
  return null;
};

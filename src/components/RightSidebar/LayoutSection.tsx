/**
 * LayoutSection Component
 *
 * Device layout and sizing controls including 2D/3D style toggle.
 */

import type { DeviceInstance, ShadowConfig } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { RangeSlider } from "./RangeSlider";
import { ShadowControls } from "./ShadowControls";
import { SLIDER_RANGES, STYLES } from "./constants";

interface LayoutSectionProps {
  /** Active device data */
  device: DeviceInstance;
  /** Update device handler */
  onUpdateDevice: (updates: Partial<DeviceInstance>) => void;
}

/**
 * LayoutSection - Device layout controls
 *
 * Contains the device style toggle (flat/3D), sliders for device size,
 * position, rotation / 3D rotation, and shadow settings. Text typography
 * lives in the separate TextSection.
 */
export const LayoutSection = ({
  device,
  onUpdateDevice,
}: LayoutSectionProps) => {
  const handleShadowUpdate = (updates: Partial<ShadowConfig>) => {
    onUpdateDevice({
      shadow: { ...device.shadow, ...updates },
    });
  };

  const is3D = device.style === "3d";

  return (
    <SidebarSection title="Layout">
      <div className="space-y-3">
        {/* Device Style Toggle */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">
            Device Style
          </label>
          <div className="flex gap-1 p-0.5 bg-[#2a2a2a] rounded-lg">
            <button
              className={`${STYLES.modeButton} ${!is3D ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => onUpdateDevice({ style: "flat" })}
            >
              Flat
            </button>
            <button
              className={`${STYLES.modeButton} ${is3D ? STYLES.modeButtonActive : STYLES.modeButtonInactive}`}
              onClick={() => onUpdateDevice({ style: "3d" })}
            >
              3D
            </button>
          </div>
        </div>

        <RangeSlider
          label="Device Size"
          value={device.scale}
          min={SLIDER_RANGES.deviceScale.min}
          max={SLIDER_RANGES.deviceScale.max}
          unit="%"
          onChange={(v) => onUpdateDevice({ scale: v })}
        />

        <RangeSlider
          label="Device Position"
          value={device.y}
          min={SLIDER_RANGES.devicePosition.min}
          max={SLIDER_RANGES.devicePosition.max}
          unit="%"
          onChange={(v) => onUpdateDevice({ y: v })}
        />

        {/* Show rotation for flat mode, 3D controls for 3D mode */}
        {is3D ? (
          <>
            <RangeSlider
              label="3D Rotate Y"
              value={device.rotateY}
              min={SLIDER_RANGES.device3dRotateY.min}
              max={SLIDER_RANGES.device3dRotateY.max}
              unit="°"
              onChange={(v) => onUpdateDevice({ rotateY: v })}
            />
            <RangeSlider
              label="3D Rotate X"
              value={device.rotateX}
              min={SLIDER_RANGES.device3dRotateX.min}
              max={SLIDER_RANGES.device3dRotateX.max}
              unit="°"
              onChange={(v) => onUpdateDevice({ rotateX: v })}
            />
          </>
        ) : (
          <RangeSlider
            label="Device Rotation"
            value={device.rotation}
            min={SLIDER_RANGES.deviceRotation.min}
            max={SLIDER_RANGES.deviceRotation.max}
            unit="°"
            onChange={(v) => onUpdateDevice({ rotation: v })}
          />
        )}

        <ShadowControls
          shadow={device.shadow}
          onToggle={() =>
            handleShadowUpdate({ enabled: !device.shadow.enabled })
          }
          onColorChange={(color) => handleShadowUpdate({ color })}
          onBlurChange={(blur) => handleShadowUpdate({ blur })}
          onOffsetYChange={(offsetY) => handleShadowUpdate({ offsetY })}
        />
      </div>
    </SidebarSection>
  );
};

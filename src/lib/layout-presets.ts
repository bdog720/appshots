/**
 * Layout presets — the named device + text arrangements shared by the editor's
 * Position Presets panel (which applies only the device part) and the agent
 * importer (which applies both). Text positions are percent of the canvas.
 */

import type { DeviceInstance, DeviceStyle } from "../types";

export type LayoutPresetId =
  | "centered"
  | "bleed-bottom"
  | "bleed-top"
  | "float-center"
  | "tilt-left"
  | "tilt-right"
  | "perspective"
  | "float-bottom";

export interface TextPosition {
  x: number;
  y: number;
}

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  /** One line for the agent prompt: what the layout looks like and when to use it. */
  description: string;
  device: {
    scale: number;
    y: number;
    rotation: number;
    /** Set only when the layout is intrinsically 3D; otherwise the project style applies. */
    style?: DeviceStyle;
    rotateX?: number;
    rotateY?: number;
  };
  text: { headline: TextPosition; subheadline: TextPosition };
}

const TEXT_TOP = { headline: { x: 50, y: 10 }, subheadline: { x: 50, y: 18 } };
const TEXT_BOTTOM = { headline: { x: 50, y: 87 }, subheadline: { x: 50, y: 94 } };

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "centered",
    label: "Centered",
    description: "Upright device in the middle, text above. Safe default for any screen.",
    device: { scale: 65, y: 35, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "bleed-bottom",
    label: "Bleed Bottom",
    description: "Large upright device running off the bottom edge, text above. Strong hero layout.",
    device: { scale: 70, y: 45, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "bleed-top",
    label: "Bleed Top",
    description: "Large device running off the top edge, text below. Use to break rhythm mid-set.",
    device: { scale: 70, y: 15, rotation: 0 },
    text: TEXT_BOTTOM,
  },
  {
    id: "float-center",
    label: "Float Center",
    description: "Smaller floating device with generous space. Good for dense screens that need air.",
    device: { scale: 55, y: 30, rotation: 0 },
    text: TEXT_TOP,
  },
  {
    id: "tilt-left",
    label: "Tilt Left",
    description: "Device rotated 15° counter-clockwise, text above. Adds energy; alternate with tilt-right.",
    device: { scale: 60, y: 35, rotation: -15 },
    text: TEXT_TOP,
  },
  {
    id: "tilt-right",
    label: "Tilt Right",
    description: "Device rotated 15° clockwise, text above. Adds energy; alternate with tilt-left.",
    device: { scale: 60, y: 35, rotation: 15 },
    text: TEXT_TOP,
  },
  {
    id: "perspective",
    label: "Perspective",
    description: "3D device turned toward the viewer, text above. Premium feel; use once or twice per set.",
    device: { scale: 60, y: 35, rotation: 0, style: "3d", rotateY: -20, rotateX: 5 },
    text: TEXT_TOP,
  },
  {
    id: "float-bottom",
    label: "Float Bottom",
    description: "Small device low on the canvas, text above with room for a longer subheadline.",
    device: { scale: 50, y: 50, rotation: 0 },
    text: TEXT_TOP,
  },
];

export const LAYOUT_PRESET_IDS = LAYOUT_PRESETS.map((p) => p.id) as [
  LayoutPresetId,
  ...LayoutPresetId[],
];

export const DEFAULT_LAYOUT_PRESET_ID: LayoutPresetId = "bleed-bottom";

export const getLayoutPreset = (id: string): LayoutPreset =>
  LAYOUT_PRESETS.find((p) => p.id === id) ??
  (LAYOUT_PRESETS.find((p) => p.id === DEFAULT_LAYOUT_PRESET_ID) as LayoutPreset);

/** The device patch the editor applies when a preset is clicked. */
export const presetDeviceSettings = (
  preset: LayoutPreset,
): Partial<DeviceInstance> => ({ style: "flat", ...preset.device });

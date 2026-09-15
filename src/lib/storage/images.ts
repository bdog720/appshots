/** Converting project image fields between inline data URLs and server URLs. */

import type { Project } from "../../types";

export const isDataUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:");

export const isServerImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/api/images/");

export const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; contentType: string } => {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice("data:".length, comma);
  const payload = dataUrl.slice(comma + 1);
  const contentType = header.split(";")[0] || "application/octet-stream";
  if (header.endsWith(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), contentType };
};

export const bytesToDataUrl = (bytes: Uint8Array, contentType: string): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
};

export const mapProjectImages = async (
  project: Project,
  transform: (src: string) => Promise<string>,
): Promise<Project> => ({
  ...project,
  screenshots: await Promise.all(
    project.screenshots.map(async (screenshot) => ({
      ...screenshot,
      devices: await Promise.all(
        screenshot.devices.map(async (device) =>
          device.screenshotSrc ? { ...device, screenshotSrc: await transform(device.screenshotSrc) } : device,
        ),
      ),
      overlayImages: await Promise.all(
        screenshot.overlayImages.map(async (overlay) => ({ ...overlay, src: await transform(overlay.src) })),
      ),
    })),
  ),
});

export const mapProjectImagesSync = (
  project: Project,
  transform: (src: string) => string | null,
): Project | null => {
  let failed = false;
  const apply = (src: string): string => {
    const next = transform(src);
    if (next === null) failed = true;
    return next ?? src;
  };
  const mapped: Project = {
    ...project,
    screenshots: project.screenshots.map((screenshot) => ({
      ...screenshot,
      devices: screenshot.devices.map((device) =>
        device.screenshotSrc ? { ...device, screenshotSrc: apply(device.screenshotSrc) } : device,
      ),
      overlayImages: screenshot.overlayImages.map((overlay) => ({ ...overlay, src: apply(overlay.src) })),
    })),
  };
  return failed ? null : mapped;
};

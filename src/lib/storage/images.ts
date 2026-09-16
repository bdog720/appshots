/** Converting project image fields between inline data URLs and server URLs. */

import { exportSizes } from "../../constants";
import type { Project } from "../../types";

export const isDataUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:");

export const isServerImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/api/images/");

/** The lower-cased media type a data URL declares. */
export const dataUrlContentType = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice("data:".length, comma < 0 ? undefined : comma);
  return (header.split(";")[0] || "application/octet-stream").toLowerCase();
};

export const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; contentType: string } => {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) throw new Error("Malformed data URL");
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

/**
 * The longest edge an SVG is rendered at. A converted SVG stops being vector,
 * so it's drawn large enough to stay sharp in the biggest export.
 */
export const SVG_RASTER_LONG_EDGE = Math.max(
  ...exportSizes.map((size) => Math.max(size.width, size.height)),
);

/** A positive pixel length from an SVG width/height attribute; percentages and units other than px don't count. */
const svgLength = (value: string | null): number | null => {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)(px)?$/);
  const length = match ? Number(match[1]) : 0;
  return length > 0 ? length : null;
};

/** Width over height as the SVG declares it: width/height attributes, then the viewBox. */
const svgAspectRatio = (source: string): number | null => {
  const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
  if (root.nodeName !== "svg") return null;
  const width = svgLength(root.getAttribute("width"));
  const height = svgLength(root.getAttribute("height"));
  if (width && height) return width / height;
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return viewBox[2] / viewBox[3];
  return null;
};

/**
 * The canvas size to convert an image at. Raster images keep their pixels;
 * SVGs are scaled to SVG_RASTER_LONG_EDGE, because browsers report tiny
 * default sizes for them (Chrome gives a viewBox-only SVG a 150px height).
 */
export const rasterSizeFor = (image: {
  contentType: string;
  svgSource?: string;
  naturalWidth: number;
  naturalHeight: number;
}): { width: number; height: number } => {
  const { naturalWidth, naturalHeight } = image;
  if (image.contentType !== "image/svg+xml") return { width: naturalWidth, height: naturalHeight };
  const ratio =
    svgAspectRatio(image.svgSource ?? "") ??
    (naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1);
  return ratio >= 1
    ? { width: SVG_RASTER_LONG_EDGE, height: Math.round(SVG_RASTER_LONG_EDGE / ratio) }
    : { width: Math.round(SVG_RASTER_LONG_EDGE * ratio), height: SVG_RASTER_LONG_EDGE };
};

/**
 * Re-encodes any image the browser can decode (GIF, SVG, AVIF…) as a PNG data
 * URL. Browser-only: jsdom can't decode images, so only the sizing is unit-tested.
 */
export const convertDataUrlToPng = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const contentType = dataUrlContentType(dataUrl);
        const size = rasterSizeFor({
          contentType,
          svgSource:
            contentType === "image/svg+xml" ? new TextDecoder().decode(dataUrlToBytes(dataUrl).bytes) : undefined,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        });
        if (size.width <= 0 || size.height <= 0) throw new Error("The image has no size");
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D is unavailable");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("The image couldn't be decoded"));
    image.src = dataUrl;
  });

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

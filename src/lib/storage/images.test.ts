import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  isDataUrl,
  isServerImageUrl,
  mapProjectImages,
  mapProjectImagesSync,
  rasterSizeFor,
  SVG_RASTER_LONG_EDGE,
} from "./images";
import { exportSizes } from "../../constants";

const project = {
  id: "p",
  screenshots: [
    {
      devices: [{ screenshotSrc: "data:image/png;base64,AQID" }, { screenshotSrc: null }],
      overlayImages: [{ src: "/api/images/abc.png" }],
    },
  ],
} as unknown as Project;

describe("image helpers", () => {
  it("recognizes data and server image URLs", () => {
    expect(isDataUrl("data:image/png;base64,AA")).toBe(true);
    expect(isDataUrl("/api/images/a.png")).toBe(false);
    expect(isServerImageUrl("/api/images/a.png")).toBe(true);
    expect(isServerImageUrl(null)).toBe(false);
  });

  it("round-trips bytes through data URLs", () => {
    const { bytes, contentType } = dataUrlToBytes("data:image/png;base64,AQID");
    expect(contentType).toBe("image/png");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(bytesToDataUrl(new Uint8Array([1, 2, 3]), "image/png")).toBe("data:image/png;base64,AQID");
    const large = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(Array.from(dataUrlToBytes(bytesToDataUrl(large, "image/webp")).bytes)).toEqual(Array.from(large));
  });

  it("rejects a data URL without a payload", () => {
    expect(() => dataUrlToBytes("data:image/png")).toThrow();
  });

  it("maps every device and overlay image without touching the original", async () => {
    const mapped = await mapProjectImages(project, async (src) => `mapped:${src}`);
    expect(mapped.screenshots[0].devices[0].screenshotSrc).toBe("mapped:data:image/png;base64,AQID");
    expect(mapped.screenshots[0].devices[1].screenshotSrc).toBeNull();
    expect(mapped.screenshots[0].overlayImages[0].src).toBe("mapped:/api/images/abc.png");
    expect(project.screenshots[0].devices[0].screenshotSrc).toBe("data:image/png;base64,AQID");
  });

  describe("rasterSizeFor", () => {
    const svg = (attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}></svg>`;

    it("renders SVGs at the largest export edge", () => {
      const longest = Math.max(...exportSizes.map((size) => Math.max(size.width, size.height)));
      expect(SVG_RASTER_LONG_EDGE).toBe(longest);
    });

    it("keeps a raster image at its natural size", () => {
      expect(
        rasterSizeFor({ contentType: "image/gif", naturalWidth: 390, naturalHeight: 844 }),
      ).toEqual({ width: 390, height: 844 });
    });

    it("scales a viewBox-only SVG up with the viewBox aspect ratio", () => {
      // Chrome reports 69×150 for this SVG: a default 150px height.
      expect(
        rasterSizeFor({
          contentType: "image/svg+xml",
          svgSource: svg('viewBox="0 0 390 844"'),
          naturalWidth: 69,
          naturalHeight: 150,
        }),
      ).toEqual({ width: 1325, height: SVG_RASTER_LONG_EDGE });
    });

    it("scales a sized SVG up rather than keeping its declared pixels", () => {
      expect(
        rasterSizeFor({
          contentType: "image/svg+xml",
          svgSource: svg('width="390px" height="844" viewBox="0 0 10 10"'),
          naturalWidth: 390,
          naturalHeight: 844,
        }),
      ).toEqual({ width: 1325, height: SVG_RASTER_LONG_EDGE });
    });

    it("scales a landscape SVG by its width", () => {
      expect(
        rasterSizeFor({
          contentType: "image/svg+xml",
          svgSource: svg('width="100%" viewBox="0 0 1000 500"'),
          naturalWidth: 0,
          naturalHeight: 0,
        }),
      ).toEqual({ width: SVG_RASTER_LONG_EDGE, height: 1434 });
    });

    it("falls back to the natural aspect ratio, then a square", () => {
      expect(
        rasterSizeFor({ contentType: "image/svg+xml", svgSource: svg(""), naturalWidth: 300, naturalHeight: 150 }),
      ).toEqual({ width: SVG_RASTER_LONG_EDGE, height: 1434 });
      expect(
        rasterSizeFor({ contentType: "image/svg+xml", svgSource: "not svg", naturalWidth: 0, naturalHeight: 0 }),
      ).toEqual({ width: SVG_RASTER_LONG_EDGE, height: SVG_RASTER_LONG_EDGE });
    });
  });

  it("maps synchronously or gives up", () => {
    expect(mapProjectImagesSync(project, (src) => src)?.screenshots[0].overlayImages[0].src).toBe("/api/images/abc.png");
    expect(mapProjectImagesSync(project, (src) => (isDataUrl(src) ? null : src))).toBeNull();
  });
});

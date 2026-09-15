import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  isDataUrl,
  isServerImageUrl,
  mapProjectImages,
  mapProjectImagesSync,
} from "./images";

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

  it("maps synchronously or gives up", () => {
    expect(mapProjectImagesSync(project, (src) => src)?.screenshots[0].overlayImages[0].src).toBe("/api/images/abc.png");
    expect(mapProjectImagesSync(project, (src) => (isDataUrl(src) ? null : src))).toBeNull();
  });
});

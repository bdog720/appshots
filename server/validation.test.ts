/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_JSON_BYTES,
  detectImageType,
  isValidImageName,
  isValidProjectId,
  isValidVersion,
} from "./validation";

describe("validation", () => {
  it("accepts only safe project ids", () => {
    expect(isValidProjectId("k3x9a1")).toBe(true);
    expect(isValidProjectId("A_b-9")).toBe(true);
    expect(isValidProjectId("")).toBe(false);
    expect(isValidProjectId("../etc")).toBe(false);
    expect(isValidProjectId("a/b")).toBe(false);
    expect(isValidProjectId("x".repeat(65))).toBe(false);
  });

  it("accepts history version names", () => {
    expect(isValidVersion("1757900000000-7")).toBe(true);
    expect(isValidVersion("175790000000-7")).toBe(false);
    expect(isValidVersion("1757900000000-")).toBe(false);
    expect(isValidVersion("../1757900000000-7")).toBe(false);
  });

  it("accepts content-hashed image names", () => {
    const hash = "a".repeat(64);
    expect(isValidImageName(`${hash}.png`)).toBe(true);
    expect(isValidImageName(`${hash}.jpg`)).toBe(true);
    expect(isValidImageName(`${hash}.webp`)).toBe(true);
    expect(isValidImageName(`${hash}.gif`)).toBe(false);
    expect(isValidImageName(`${"A".repeat(64)}.png`)).toBe(false);
    expect(isValidImageName("../x.png")).toBe(false);
  });

  it("detects image types from magic bytes", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectImageType(webp)).toBe("webp");
    expect(detectImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(detectImageType(new Uint8Array([0x89]))).toBeNull();
  });

  it("exposes the limits", () => {
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_JSON_BYTES).toBe(5 * 1024 * 1024);
  });
});

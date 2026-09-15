/** Input validation shared by the storage server. Pure; no I/O. */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^\d{13}-\d+$/;
const IMAGE_NAME = /^[a-f0-9]{64}\.(png|jpg|webp)$/;

export const isValidProjectId = (id: string): boolean => PROJECT_ID.test(id);
export const isValidVersion = (version: string): boolean => VERSION.test(version);
export const isValidImageName = (name: string): boolean => IMAGE_NAME.test(name);

export type ImageExt = "png" | "jpg" | "webp";

export const IMAGE_CONTENT_TYPES: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

export const detectImageType = (bytes: Uint8Array): ImageExt | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
};

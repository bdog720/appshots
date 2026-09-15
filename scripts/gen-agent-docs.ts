/// <reference types="node" />
/**
 * Regenerates the committed agent-import docs from code:
 *   bun run gen:agent-docs
 * src/lib/agent-import/prompt.test.ts fails when the committed files are stale.
 * Placeholder example PNGs are written only when missing, so they don't churn.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { AGENT_DOC_PATHS, renderAgentDocs } from "../src/lib/agent-import/docs";
import { EXAMPLE_IMAGES } from "../src/lib/agent-import/example";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const write = (relativePath: string, content: string | Buffer) => {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${relativePath}`);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

/** Minimal solid-color RGB PNG. */
const solidPng = (width: number, height: number, [r, g, b]: [number, number, number]): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  const row = Buffer.alloc(1 + width * 3); // leading 0 = no filter
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const [path, content] of Object.entries(renderAgentDocs())) write(path, content);

const exampleDir = dirname(AGENT_DOC_PATHS.example);
for (const image of EXAMPLE_IMAGES) {
  const path = `${exampleDir}/${image.name}`;
  if (!existsSync(resolve(root, path))) {
    write(path, solidPng(image.width, image.height, image.color));
  }
}

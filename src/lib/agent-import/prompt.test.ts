/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { devices, exportSizes, gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { googleFonts } from "../google-fonts";
import { LAYOUT_PRESETS, LAYOUT_PRESET_IDS } from "../layout-presets";
import { compileManifest, imageKey, listImageReferences, type LoadedImage } from "./compile";
import { renderAgentDocs } from "./docs";
import { EXAMPLE_IMAGES, EXAMPLE_MANIFEST } from "./example";
import { STYLE_DESCRIPTIONS, buildAgentPrompt } from "./prompt";
import { parseManifest } from "./schema";

describe("example manifest", () => {
  it("is valid and exercises every layout, multi-device and overlays", () => {
    expect(parseManifest(JSON.stringify(EXAMPLE_MANIFEST)).ok).toBe(true);
    const layouts = new Set(EXAMPLE_MANIFEST.screens.map((s) => s.layout).filter(Boolean));
    expect([...layouts].sort()).toEqual([...LAYOUT_PRESET_IDS].sort());
    expect(EXAMPLE_MANIFEST.screens.some((s) => s.devices && s.devices.length > 1)).toBe(true);
    expect(EXAMPLE_MANIFEST.screens.some((s) => (s.overlays ?? []).length > 0)).toBe(true);
  });

  it("ships exactly the images it references", () => {
    const referenced = new Set(listImageReferences(EXAMPLE_MANIFEST).map((r) => imageKey(r.name)));
    expect(new Set(EXAMPLE_IMAGES.map((i) => imageKey(i.name)))).toEqual(referenced);
  });

  it("compiles without warnings", () => {
    let n = 0;
    const images = new Map<string, LoadedImage>(
      EXAMPLE_IMAGES.map((i) => [imageKey(i.name), { dataUrl: `data:${i.name}`, width: i.width, height: i.height }]),
    );
    const { warnings } = compileManifest({
      manifest: EXAMPLE_MANIFEST,
      images,
      generateId: () => `id${++n}`,
    });
    expect(warnings).toEqual([]);
  });
});

describe("buildAgentPrompt", () => {
  const prompt = buildAgentPrompt();

  it("describes every style", () => {
    expect(Object.keys(STYLE_DESCRIPTIONS).sort()).toEqual(VIBES.map((v) => v.id).sort());
    for (const vibe of VIBES) expect(prompt).toContain(`\`${vibe.id}\``);
  });

  it("lists every layout, device, color, font, export size and preset", () => {
    for (const layout of LAYOUT_PRESETS) expect(prompt).toContain(`\`${layout.id}\``);
    for (const device of devices) {
      expect(prompt).toContain(`\`${device.id}\``);
      for (const color of device.colors) expect(prompt).toContain(`\`${color.id}\``);
    }
    for (const font of googleFonts) expect(prompt).toContain(font.family);
    for (const size of exportSizes) expect(prompt).toContain(`\`${size.id}\``);
    for (const preset of gradientPresets) expect(prompt).toContain(`\`${preset.id}\``);
  });

  it("states the output contract and embeds the example", () => {
    expect(prompt).toContain("appshots.json");
    expect(prompt).toContain('"format": "appshots-import"');
    expect(prompt).toContain(JSON.stringify(EXAMPLE_MANIFEST, null, 2));
  });
});

describe("committed agent docs", () => {
  it("match the generated output (run `bun run gen:agent-docs` if this fails)", () => {
    for (const [path, content] of Object.entries(renderAgentDocs())) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8"), path).toBe(content);
    }
  });
});

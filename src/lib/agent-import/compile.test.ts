import { describe, expect, it } from "vitest";
import { normalizeProject } from "../../context/EditorContext";
import { contrastRatio } from "../design-guidance";
import { LAYOUT_PRESETS } from "../layout-presets";
import {
  compileManifest,
  findMissingImages,
  imageKey,
  listImageReferences,
  type LoadedImage,
} from "./compile";
import { ImportError } from "./issues";
import type { ImportManifest } from "./schema";

const loaded = (name: string, width = 1206, height = 2622): [string, LoadedImage] => [
  imageKey(name),
  { dataUrl: `data:image/png;base64,${name}`, width, height },
];

const idGen = () => {
  let n = 0;
  return () => `id${++n}`;
};

const manifestOf = (over: Partial<ImportManifest> = {}): ImportManifest => ({
  format: "appshots-import",
  version: 1,
  screens: [{ image: "01.png", headline: "Plan your week" }],
  ...over,
});

const compile = (
  manifest: ImportManifest,
  images: [string, LoadedImage][] = [loaded("01.png")],
  bundleImageNames?: string[],
) =>
  compileManifest({
    manifest,
    images: new Map(images),
    bundleImageNames,
    generateId: idGen(),
    now: () => 1000,
  });

const markBackground = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body.querySelector<HTMLElement>("mark")
    ?.style.backgroundColor;

describe("image references", () => {
  it("keys images by lowercase basename", () => {
    expect(imageKey("shots/01-Home.PNG")).toBe("01-home.png");
  });

  it("lists every image reference with its path and reports missing ones", () => {
    const manifest = manifestOf({
      screens: [
        { image: "a.png", headline: "H", overlays: [{ image: "badge.png" }] },
        { headline: "H", devices: [{ image: "b.png" }, {}] },
      ],
    });
    expect(listImageReferences(manifest)).toEqual([
      { path: "screens[0].image", name: "a.png" },
      { path: "screens[0].overlays[0].image", name: "badge.png" },
      { path: "screens[1].devices[0].image", name: "b.png" },
    ]);
    expect(findMissingImages(manifest, new Set(["a.png", "b.png"]))).toEqual([
      { path: "screens[0].overlays[0].image", message: 'image "badge.png" is not in the bundle' },
    ]);
  });
});

describe("compileManifest", () => {
  it("builds a complete project from a minimal manifest", () => {
    const { project, warnings } = compile(manifestOf());
    expect(warnings).toEqual([]);
    expect(project.name).toBe("Imported Project");
    expect(project.exportSizeId).toBe("6.9");
    expect(project.screenshots).toHaveLength(1);
    const [shot] = project.screenshots;
    expect(project.activeScreenshotId).toBe(shot.id);
    expect(shot.headline).toBe("Plan your week");
    expect(shot.subheadline).toBe("");
    expect(shot.backgroundOverride).toBe(false);
    expect(shot.textOverrides).toEqual([]);
    expect(shot.devices).toHaveLength(1);
    expect(shot.devices[0].screenshotSrc).toBe("data:image/png;base64,01.png");
    // default layout: bleed-bottom
    expect(shot.devices[0]).toMatchObject({ scale: 70, y: 45, rotation: 0, style: "flat" });
    expect(shot).toMatchObject({ headlineX: 50, headlineY: 10, subheadlineY: 18 });
  });

  it("applies the style preset, then explicit brand fields", () => {
    const { project } = compile(
      manifestOf({ brand: { primary: "#5B5BD6", style: "bold", headlineSize: 80 } }),
    );
    expect(project.textDefaults.fontFamily).toBe("Poppins");
    expect(project.textDefaults.headlineFontSize).toBe(80);
    expect(project.textDefaults.subheadlineFontSize).toBe(42);
    expect(project.backgroundDefaults?.backgroundMode).toBe("gradient");
    expect(project.backgroundDefaults?.gradientFrom).toBe("#5b5bd6");

    const withFont = compile(manifestOf({ brand: { primary: "#5B5BD6", style: "bold", font: "Lora" } }));
    expect(withFont.project.textDefaults.fontFamily).toBe("Lora");
  });

  it("picks a readable text color for an explicit brand background", () => {
    const { project } = compile(
      manifestOf({ brand: { background: { type: "solid", color: "#FAFAFA" } } }),
    );
    expect(project.backgroundDefaults?.backgroundColor).toBe("#fafafa");
    expect(contrastRatio(project.textDefaults.textColor, "#fafafa")).toBeGreaterThanOrEqual(4.5);
    expect(project.screenshots[0].textColor).toBe(project.textDefaults.textColor);
  });

  it("warns when style is given without a primary color", () => {
    const { project, warnings } = compile(manifestOf({ brand: { style: "bold" } }));
    expect(project.textDefaults.fontFamily).toBe("Inter");
    expect(warnings.map((w) => w.path)).toContain("brand.style");
  });

  it("records per-screen overrides so project defaults keep working", () => {
    const { project } = compile(
      manifestOf({
        screens: [
          {
            image: "01.png",
            headline: "H",
            background: { type: "solid", color: "#111827" },
            text: { color: "#F9FAFB", headline: { y: 8, width: 70 } },
          },
        ],
      }),
    );
    const [shot] = project.screenshots;
    expect(shot.backgroundOverride).toBe(true);
    expect(shot.backgroundColor).toBe("#111827");
    expect(shot.textColor).toBe("#f9fafb");
    expect(shot.headlineWidth).toBe(70);
    expect(shot.headlineY).toBe(8);
    expect(shot.textOverrides).toEqual(["textColor", "headlineWidth"]);
  });

  it("applies every layout's device settings and text positions", () => {
    const manifest = manifestOf({
      screens: LAYOUT_PRESETS.map((preset) => ({
        image: "01.png",
        headline: preset.label,
        layout: preset.id,
      })),
    });
    const { project } = compile(manifest);
    LAYOUT_PRESETS.forEach((preset, i) => {
      const shot = project.screenshots[i];
      expect(shot.devices[0]).toMatchObject({
        scale: preset.device.scale,
        y: preset.device.y,
        rotation: preset.device.rotation,
        style: preset.device.style ?? "flat",
      });
      expect(shot.headlineY).toBe(preset.text.headline.y);
      expect(shot.subheadlineY).toBe(preset.text.subheadline.y);
    });
    expect(project.screenshots[6].devices[0]).toMatchObject({ rotateY: -20, rotateX: 5 });
  });

  it("lets explicit device fields beat the layout, and project style fill in", () => {
    const { project } = compile(
      manifestOf({
        device: { style: "3d" },
        screens: [
          { image: "01.png", headline: "A", layout: "tilt-right", device: { scale: 64, rotation: 12 } },
          { image: "01.png", headline: "B", layout: "perspective", device: { style: "flat" } },
        ],
      }),
    );
    expect(project.screenshots[0].devices[0]).toMatchObject({ scale: 64, rotation: 12, style: "3d" });
    expect(project.screenshots[1].devices[0].style).toBe("flat");
  });

  it("colors highlights explicitly", () => {
    const branded = compile(
      manifestOf({
        brand: { highlightColor: "#FFD60A" },
        screens: [{ image: "01.png", headline: "Build <mark>habits</mark>" }],
      }),
    );
    expect(markBackground(branded.project.screenshots[0].headline)).toBe("rgb(255, 214, 10)");

    const derived = compile(
      manifestOf({ screens: [{ image: "01.png", headline: "Build <mark>habits</mark>" }] }),
    );
    expect(markBackground(derived.project.screenshots[0].headline)).toBeTruthy();
  });

  it("falls back on unknown ids with warnings", () => {
    const { project, warnings } = compile(
      manifestOf({
        exportSize: "7.7",
        brand: { font: "Comic Sans" },
        device: { id: "iphone-99", color: "neon" },
      }),
    );
    expect(project.textDefaults.fontFamily).toBe("Inter");
    expect(project.exportSizeId).toBe("6.9");
    expect(warnings.map((w) => w.path)).toEqual(
      expect.arrayContaining(["brand.font", "device.id", "device.color", "exportSize"]),
    );
  });

  it("defaults the export size to the device and flags mismatches", () => {
    expect(compile(manifestOf({ device: { id: "pixel-10" } })).project.exportSizeId).toBe(
      "play-phone-20-9",
    );
    const mismatch = compile(manifestOf({ device: { id: "pixel-10" }, exportSize: "6.9" }));
    expect(mismatch.warnings.map((w) => w.path)).toContain("exportSize");
  });

  it("throws ImportError for missing images", () => {
    expect(() => compile(manifestOf(), [])).toThrow(ImportError);
    try {
      compile(manifestOf(), []);
    } catch (error) {
      expect((error as ImportError).issues[0].path).toBe("screens[0].image");
    }
  });

  it("builds multi-device screens and ignores screen.device alongside them", () => {
    const { project, warnings } = compile(
      manifestOf({
        screens: [
          {
            headline: "Two",
            device: { scale: 99 },
            devices: [
              { image: "a.png", x: 32, scale: 55, rotation: -8 },
              { id: "iphone-17", x: 68, scale: 55, rotation: 8 },
            ],
          },
        ],
      }),
      [loaded("a.png")],
    );
    const [shot] = project.screenshots;
    expect(shot.devices).toHaveLength(2);
    expect(shot.devices[0]).toMatchObject({ x: 32, scale: 55, rotation: -8, screenshotSrc: "data:image/png;base64,a.png" });
    expect(shot.devices[1]).toMatchObject({ x: 68, deviceId: "iphone-17", screenshotSrc: null });
    expect(shot.activeDeviceId).toBe(shot.devices[0].id);
    expect(warnings.map((w) => w.path)).toContain("screens[0].device");
  });

  it("sizes overlays from the image aspect ratio", () => {
    const { project } = compile(
      manifestOf({
        screens: [{ image: "01.png", headline: "H", overlays: [{ image: "badge.png", width: 20, x: 80, y: 12 }] }],
      }),
      [loaded("01.png"), loaded("badge.png", 100, 50)],
    );
    expect(project.screenshots[0].overlayImages[0]).toMatchObject({
      src: "data:image/png;base64,badge.png",
      x: 80,
      y: 12,
      width: 20,
      height: 10,
      layer: "front",
      rotation: 0,
      shadow: { enabled: false },
    });
  });

  it("warns about unused bundle images, stripped HTML, and contrast", () => {
    const { warnings } = compile(
      manifestOf({
        brand: { textColor: "#FFFFFF", background: { type: "solid", color: "#FFFFFF" } },
        screens: [{ image: "01.png", headline: "Hi<script>x</script>" }],
      }),
      [loaded("01.png")],
      ["01.png", "extra.png"],
    );
    const paths = warnings.map((w) => w.path);
    expect(paths).toContain("screens[0].headline");
    expect(warnings.some((w) => w.message.includes("extra.png"))).toBe(true);
    expect(warnings.some((w) => /unsupported HTML/.test(w.message))).toBe(true);
    expect(warnings.some((w) => /contrast/.test(w.message))).toBe(true);
  });

  it("seeds saved colors from the brand, primary first", () => {
    const { project } = compile(
      manifestOf({ brand: { primary: "#5B5BD6", highlightColor: "#FFD60A" } }),
    );
    expect(project.savedColors[0]).toBe("#5b5bd6");
    expect(project.savedColors).toContain("#ffd60a");
  });

  it("produces a project that normalizeProject leaves unchanged", () => {
    const { project } = compile(
      manifestOf({
        brand: { primary: "#5B5BD6", style: "playful" },
        screens: [
          { image: "01.png", headline: "A", layout: "perspective", text: { font: "Lora" } },
          { image: "01.png", headline: "B", background: { type: "preset", id: "ocean" } },
        ],
      }),
    );
    expect(normalizeProject(project)).toEqual(project);
  });
});

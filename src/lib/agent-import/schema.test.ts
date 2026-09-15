import { describe, expect, it } from "vitest";
import { buildJsonSchema, parseManifest } from "./schema";

const minimal = {
  format: "appshots-import",
  version: 1,
  screens: [{ image: "01.png", headline: "Plan your week" }],
};

const full = {
  $schema: "./appshots-import.schema.json",
  format: "appshots-import",
  version: 1,
  name: "Habitly — App Store",
  exportSize: "6.9",
  brand: {
    primary: "#5B5BD6",
    style: "bold",
    font: "Poppins",
    textColor: "#FFF",
    highlightColor: "#FFD60A",
    headlineSize: 72,
    subheadlineSize: 42,
    background: { type: "gradient", from: "#5B5BD6", to: "#3A3AA0" },
  },
  device: { id: "iphone-17-pro", color: "cosmic-orange", style: "flat", shadow: true },
  screens: [
    {
      image: "01-home.png",
      headline: "Build habits <mark>that stick</mark>",
      subheadline: "Tiny daily wins",
      layout: "bleed-bottom",
    },
    {
      image: "02-stats.png",
      headline: "See your streaks",
      layout: "tilt-right",
      background: { type: "solid", color: "#111827" },
      text: {
        color: "#F9FAFB",
        font: "Inter",
        headlineSize: 68,
        subheadlineSize: 40,
        headline: { x: 50, y: 8, width: 70 },
        subheadline: { x: 50, y: 16, width: 70 },
      },
      device: { scale: 64, rotation: 12, rotateX: 5, rotateY: -20, shadow: { blur: 30 } },
      overlays: [{ image: "badge.png", x: 80, y: 12, width: 20, layer: "front", rotation: 0, shadow: false }],
    },
    {
      headline: "Two views",
      background: { type: "preset", id: "ocean" },
      devices: [
        { image: "03a.png", x: 32, y: 38, scale: 55, rotation: -8 },
        { id: "iphone-17", x: 68, y: 42, scale: 55, rotation: 8 },
      ],
    },
  ],
};

const withScreen = (screen: Record<string, unknown>) =>
  JSON.stringify({ ...minimal, screens: [screen] });

const errorsOf = (text: string) => {
  const result = parseManifest(text);
  if (result.ok) throw new Error("expected failure");
  return result.errors;
};

describe("parseManifest", () => {
  it("accepts a minimal manifest", () => {
    const result = parseManifest(JSON.stringify(minimal));
    expect(result.ok).toBe(true);
  });

  it("accepts a manifest using every field", () => {
    const result = parseManifest(JSON.stringify(full));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.manifest.screens).toHaveLength(3);
  });

  it("reports invalid JSON", () => {
    expect(errorsOf("{ nope")).toEqual([
      { path: "appshots.json", message: "file is not valid JSON" },
    ]);
  });

  it("rejects the wrong format and version", () => {
    const paths = errorsOf(
      JSON.stringify({ ...minimal, format: "other", version: 2 }),
    ).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["format", "version"]));
  });

  it("rejects an unknown layout with its path", () => {
    const [error] = errorsOf(withScreen({ image: "a.png", headline: "H", layout: "diagonal" }));
    expect(error.path).toBe("screens[0].layout");
  });

  it("rejects a non-hex color", () => {
    const [error] = errorsOf(JSON.stringify({ ...minimal, brand: { primary: "blue" } }));
    expect(error.path).toBe("brand.primary");
    expect(error.message).toMatch(/hex/);
  });

  it("requires exactly one of image or devices", () => {
    const [both] = errorsOf(
      withScreen({ image: "a.png", devices: [{ image: "b.png" }], headline: "H" }),
    );
    expect(both.path).toBe("screens[0].image");
    expect(both.message).toMatch(/either image or devices/);

    const [neither] = errorsOf(withScreen({ headline: "H" }));
    expect(neither.message).toMatch(/needs an image or a devices list/);
  });

  it("rejects unknown keys so typos surface", () => {
    const [error] = errorsOf(withScreen({ image: "a.png", headlines: "H", headline: "H" }));
    expect(error.path).toBe("screens[0]");
    expect(error.message).toContain("headlines");
  });

  it("rejects out-of-range numbers", () => {
    const [error] = errorsOf(
      withScreen({ image: "a.png", headline: "H", device: { scale: 500 } }),
    );
    expect(error.path).toBe("screens[0].device.scale");
  });

  it("requires at least one screen", () => {
    const [error] = errorsOf(JSON.stringify({ ...minimal, screens: [] }));
    expect(error.path).toBe("screens");
  });
});

describe("buildJsonSchema", () => {
  it("produces an object schema that names the live enums", () => {
    const schema = buildJsonSchema();
    expect(schema.type).toBe("object");
    const text = JSON.stringify(schema);
    expect(text).toContain("appshots-import");
    expect(text).toContain("tilt-left");
    expect(text).toContain("editorial");
    expect(text).toContain("ocean");
  });
});

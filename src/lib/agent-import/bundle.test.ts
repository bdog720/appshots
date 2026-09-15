import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { collectBundle, imageMimeType, readFileAsText } from "./bundle";

const MANIFEST = '{"format":"appshots-import"}';
const manifestFile = (name = "appshots.json") =>
  new File([MANIFEST], name, { type: "application/json" });
const png = (name: string) => new File(["png-bytes"], name, { type: "image/png" });

const zipOf = async (entries: Record<string, string>, name = "bundle.zip") => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buffer], name, { type: "application/zip" });
};

describe("imageMimeType", () => {
  it("accepts png, jpeg and webp only", () => {
    expect(imageMimeType("a.PNG")).toBe("image/png");
    expect(imageMimeType("a.jpg")).toBe("image/jpeg");
    expect(imageMimeType("a.jpeg")).toBe("image/jpeg");
    expect(imageMimeType("a.webp")).toBe("image/webp");
    expect(imageMimeType("a.gif")).toBeNull();
    expect(imageMimeType("notes.txt")).toBeNull();
  });
});

describe("collectBundle", () => {
  it("collects a manifest and images from loose files", async () => {
    const bundle = await collectBundle([manifestFile(), png("01.png"), png("02-Stats.PNG")]);
    expect(bundle.manifestText).toBe(MANIFEST);
    expect([...bundle.images.keys()]).toEqual(["01.png", "02-stats.png"]);
  });

  it("ignores junk and non-image files", async () => {
    const bundle = await collectBundle([
      manifestFile(),
      png("01.png"),
      new File(["x"], ".DS_Store"),
      new File(["notes"], "notes.txt"),
    ]);
    expect([...bundle.images.keys()]).toEqual(["01.png"]);
  });

  it("expands zips, including nested folders, skipping __MACOSX", async () => {
    const zip = await zipOf({
      "set/appshots.json": MANIFEST,
      "set/shots/01.png": "a",
      "__MACOSX/set/shots/._01.png": "junk",
    });
    const bundle = await collectBundle([zip]);
    expect(bundle.manifestText).toBe(MANIFEST);
    expect([...bundle.images.keys()]).toEqual(["01.png"]);
    expect(bundle.images.get("01.png")?.type).toBe("image/png");
    expect(await readFileAsText(bundle.images.get("01.png") as File)).toBe("a");
  });

  it("requires exactly one manifest", async () => {
    await expect(collectBundle([png("01.png")])).rejects.toThrow(/no appshots.json/);
    await expect(
      collectBundle([manifestFile(), await zipOf({ "appshots.json": MANIFEST })]),
    ).rejects.toThrow(/found 2 appshots.json/);
  });

  it("rejects duplicate image names", async () => {
    const zip = await zipOf({ "appshots.json": MANIFEST, "a/01.png": "a" });
    await expect(collectBundle([zip, png("01.PNG")])).rejects.toThrow(/more than one image/);
  });

  it("reports a corrupt zip", async () => {
    const broken = new File(["not a zip"], "bundle.zip", { type: "application/zip" });
    await expect(collectBundle([broken])).rejects.toThrow(/bundle.zip: could not open/);
  });
});

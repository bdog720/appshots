import { describe, expect, it, vi } from "vitest";
import { runAgentImport, type ReadImage } from "./pipeline";

const manifest = (screens: unknown[]) =>
  new File(
    [JSON.stringify({ format: "appshots-import", version: 1, screens })],
    "appshots.json",
    { type: "application/json" },
  );
const png = (name: string) => new File(["png"], name, { type: "image/png" });

const stubReadImage = () =>
  vi.fn<ReadImage>(async (file) => ({ dataUrl: `data:${file.name}`, width: 100, height: 200 }));

const options = (readImage = stubReadImage(), existingStorageChars = 0) => {
  let n = 0;
  return { readImage, generateId: () => `id${++n}`, existingStorageChars };
};

describe("runAgentImport", () => {
  it("imports a valid bundle", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      options(),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.project.screenshots).toHaveLength(1);
    expect(result.project.screenshots[0].devices[0].screenshotSrc).toBe("data:01.png");
    expect(result.warnings).toEqual([]);
  });

  it("returns bundle errors instead of throwing", async () => {
    const result = await runAgentImport([png("01.png")], options());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/no appshots.json/);
  });

  it("returns schema errors with paths", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi", layout: "diagonal" }]), png("01.png")],
      options(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].path).toBe("screens[0].layout");
  });

  it("reports missing images before decoding anything", async () => {
    const readImage = stubReadImage();
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }])],
      options(readImage),
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "screens[0].image", message: 'image "01.png" is not in the bundle' }],
    });
    expect(readImage).not.toHaveBeenCalled();
  });

  it("reports an image that fails to decode", async () => {
    const readImage = vi.fn<ReadImage>(async () => {
      throw new Error("decode failed");
    });
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      options(readImage),
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "01.png", message: "this image could not be read" }],
    });
  });

  it("decodes only referenced images and warns about the rest", async () => {
    const readImage = stubReadImage();
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png"), png("extra.png")],
      options(readImage),
    );
    expect(readImage).toHaveBeenCalledTimes(1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings.some((w) => w.message.includes("extra.png"))).toBe(true);
  });

  it("lists the storage warning first", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png"), png("extra.png")],
      options(stubReadImage(), 4_500_000),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings[0].message).toMatch(/stop saving/);
  });
});

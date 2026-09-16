import { describe, expect, it, vi } from "vitest";
import { runAgentImport, type ReadImage } from "./pipeline";
import { checkStorageBudget } from "./issues";

// Spied, not replaced: the budget check still runs, so the tests below can tell
// "skipped" apart from "ran and found nothing".
vi.mock("./issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./issues")>();
  return { ...actual, checkStorageBudget: vi.fn(actual.checkStorageBudget) };
});

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
  it("measures the browser storage budget only when projects live in this browser", async () => {
    const budget = vi.mocked(checkStorageBudget);
    const bundle = () => [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")];

    budget.mockClear();
    await runAgentImport(bundle(), { ...options(stubReadImage()), existingStorageChars: 0 });
    expect(budget).toHaveBeenCalledTimes(1);

    budget.mockClear();
    const result = await runAgentImport(bundle(), {
      ...options(stubReadImage()),
      existingStorageChars: null,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(budget).not.toHaveBeenCalled();
    expect(result.storageWarning).toBeNull();
  });

  it("imports a valid bundle", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      options(),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.project.screenshots).toHaveLength(1);
    expect(result.project.screenshots[0].devices[0].screenshotSrc).toBe("data:01.png");
    expect(result.warnings).toEqual([]);
    expect(result.storageWarning).toBeNull();
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

  it("reports the storage warning separately from the other warnings", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png"), png("extra.png")],
      options(stubReadImage(), 4_500_000),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.storageWarning?.message).toMatch(/stop saving/);
    expect(result.warnings.some((w) => /stop saving/.test(w.message))).toBe(false);
    expect(result.warnings.some((w) => w.message.includes("extra.png"))).toBe(true);
  });
});

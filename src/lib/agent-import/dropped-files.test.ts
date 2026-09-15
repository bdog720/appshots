import { describe, expect, it } from "vitest";
import { filesFromDataTransfer, filesFromEntries, type EntryLike } from "./dropped-files";

const fileEntry = (name: string) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (resolve: (file: File) => void) => resolve(new File(["x"], name)),
});

// Real directory readers return entries in batches and then an empty batch.
const dirEntry = (name: string, batches: EntryLike[][]) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    const queue = [...batches, []];
    return {
      readEntries: (resolve: (entries: EntryLike[]) => void) =>
        resolve(queue.shift() ?? []),
    };
  },
});

describe("filesFromEntries", () => {
  it("walks nested directories across reader batches", async () => {
    const files = await filesFromEntries([
      dirEntry("set", [
        [fileEntry("appshots.json"), dirEntry("shots", [[fileEntry("01.png")], [fileEntry("02.png")]])],
        [fileEntry("badge.png")],
      ]),
    ]);
    expect(files.map((f) => f.name)).toEqual(["appshots.json", "01.png", "02.png", "badge.png"]);
  });
});

describe("filesFromDataTransfer", () => {
  it("falls back to plain files when entries are unavailable", async () => {
    const file = new File(["x"], "appshots.json");
    const dataTransfer = { items: [], files: [file] } as unknown as DataTransfer;
    expect(await filesFromDataTransfer(dataTransfer)).toEqual([file]);
  });

  it("uses webkitGetAsEntry when available", async () => {
    const dataTransfer = {
      items: [{ webkitGetAsEntry: () => fileEntry("appshots.json") }],
      files: [],
    } as unknown as DataTransfer;
    const files = await filesFromDataTransfer(dataTransfer);
    expect(files.map((f) => f.name)).toEqual(["appshots.json"]);
  });
});

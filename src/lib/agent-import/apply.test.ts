import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { replaceProjectContent } from "./apply";

const project = (over: Partial<Project>): Project =>
  ({
    id: "p",
    name: "Name",
    createdAt: 1,
    updatedAt: 1,
    screenshots: [],
    selectedDeviceId: "iphone-17-pro",
    selectedColorId: "silver",
    exportSizeId: "6.9",
    activeScreenshotId: "s",
    textDefaults: {} as Project["textDefaults"],
    backgroundDefaults: undefined,
    savedColors: [],
    ...over,
  }) as Project;

describe("replaceProjectContent", () => {
  it("keeps the current identity and takes the imported content", () => {
    const current = project({ id: "current", name: "My App", createdAt: 5, exportSizeId: "6.9" });
    const imported = project({
      id: "new",
      name: "Imported",
      createdAt: 9,
      exportSizeId: "play-phone-20-9",
      selectedDeviceId: "pixel-10",
      activeScreenshotId: "s2",
      savedColors: ["#123456"],
    });
    expect(replaceProjectContent(current, imported, 42)).toEqual({
      ...imported,
      id: "current",
      name: "My App",
      createdAt: 5,
      updatedAt: 42,
    });
  });
});

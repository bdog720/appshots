import { describe, it, expect } from "vitest";
import {
  serializeProject,
  parseProjectFile,
  suggestProjectFilename,
} from "./project-io";
import type { Project } from "../types";

const makeProject = (): Project =>
  ({
    id: "p1",
    name: "My Project",
    createdAt: 1,
    updatedAt: 2,
    screenshots: [{ id: "s1" }],
    selectedDeviceId: "iphone-16",
    selectedColorId: "black",
    exportSizeId: "6.9",
    activeScreenshotId: "s1",
    textDefaults: {
      headlineFontSize: 72,
      subheadlineFontSize: 42,
      fontFamily: "Inter",
      textColor: "#ffffff",
      headlineWidth: 80,
      subheadlineWidth: 80,
    },
    savedColors: ["#ff0000"],
  }) as unknown as Project;

describe("serializeProject / parseProjectFile", () => {
  it("round-trips a project through serialize and parse", () => {
    const project = makeProject();
    const parsed = parseProjectFile(serializeProject(project));
    expect(parsed).toEqual(project);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseProjectFile("not json{")).toThrow();
  });

  it("throws when the file is not an AppShots project", () => {
    expect(() => parseProjectFile(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("throws when the project has no screenshots array", () => {
    const bad = JSON.stringify({
      type: "appshots-project",
      version: 1,
      project: { id: "x", name: "x" },
    });
    expect(() => parseProjectFile(bad)).toThrow();
  });
});

describe("suggestProjectFilename", () => {
  it("slugifies the project name", () => {
    expect(suggestProjectFilename("My Cool App!")).toBe(
      "my-cool-app.appshots.json",
    );
  });

  it("falls back to 'project' for an empty name", () => {
    expect(suggestProjectFilename("   ")).toBe("project.appshots.json");
  });
});

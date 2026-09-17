import { describe, expect, it } from "vitest";
import { readServerConfig } from "./config";

describe("readServerConfig", () => {
  it("uses defaults when nothing is set", () => {
    expect(readServerConfig({})).toEqual({
      dataDir: "/data",
      distDir: "dist",
      port: 80,
      password: null,
      warnings: [],
    });
  });

  it("reads the BREEZEL_ variables", () => {
    const config = readServerConfig({
      BREEZEL_DATA_DIR: "/srv/data",
      BREEZEL_DIST_DIR: "/srv/dist",
      BREEZEL_PASSWORD: " secret ",
      PORT: "8080",
    });
    expect(config).toEqual({
      dataDir: "/srv/data",
      distDir: "/srv/dist",
      port: 8080,
      password: "secret",
      warnings: [],
    });
  });

  it("still reads the old APPSHOTS_ variables and warns about each", () => {
    const config = readServerConfig({
      APPSHOTS_DATA_DIR: "/old/data",
      APPSHOTS_PASSWORD: "old",
    });
    expect(config.dataDir).toBe("/old/data");
    expect(config.password).toBe("old");
    expect(config.warnings).toEqual([
      "APPSHOTS_DATA_DIR is deprecated; rename it to BREEZEL_DATA_DIR.",
      "APPSHOTS_PASSWORD is deprecated; rename it to BREEZEL_PASSWORD.",
    ]);
  });

  it("prefers the BREEZEL_ variable when both are set", () => {
    const config = readServerConfig({ BREEZEL_PASSWORD: "new", APPSHOTS_PASSWORD: "old" });
    expect(config.password).toBe("new");
    expect(config.warnings).toEqual([]);
  });

  it("treats a blank password as no password", () => {
    expect(readServerConfig({ BREEZEL_PASSWORD: "   " }).password).toBeNull();
  });

  it("falls back to port 80 and warns on an invalid PORT", () => {
    const config = readServerConfig({ PORT: "99999" });
    expect(config.port).toBe(80);
    expect(config.warnings).toEqual(['Ignoring invalid PORT "99999"; using 80.']);
  });
});

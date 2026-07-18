import { describe, it, expect } from "vitest";
import { migratePersistedState, CURRENT_VERSION } from "./useLocalStorage";

describe("migratePersistedState", () => {
  it("keeps projects from an older version instead of wiping them", () => {
    const result = migratePersistedState({
      version: 1,
      projects: [{ id: "p1" }],
      activeProjectId: "p1",
      lastSaved: 123,
    });
    expect(result).not.toBeNull();
    expect(result?.projects).toHaveLength(1);
    expect(result?.version).toBe(CURRENT_VERSION);
  });

  it("returns null when projects is missing or not an array", () => {
    expect(migratePersistedState({ version: 2 })).toBeNull();
    expect(migratePersistedState(null)).toBeNull();
    expect(migratePersistedState({ projects: "nope" })).toBeNull();
  });

  it("defaults activeProjectId to the first project when absent", () => {
    const result = migratePersistedState({ projects: [{ id: "first" }] });
    expect(result?.activeProjectId).toBe("first");
  });
});

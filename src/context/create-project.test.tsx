import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { EditorProvider, useEditor } from "./EditorContext";

const wrapper = ({ children }: { children: ReactNode }) => <EditorProvider>{children}</EditorProvider>;

describe("createProject", () => {
  it("opens the new project", () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const firstId = result.current.activeProjectId;

    act(() => result.current.createProject("Second"));

    const created = result.current.projects.find((project) => project.name === "Second");
    expect(created).toBeDefined();
    expect(created?.id).not.toBe(firstId);
    expect(result.current.activeProjectId).toBe(created?.id);
  });
});

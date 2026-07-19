import { describe, expect, it } from "vitest";
import { isEditableTarget, resolveShortcut } from "./keyboard-shortcuts";

type Key = Parameters<typeof resolveShortcut>[0];

const evt = (over: Partial<Key>): Key => ({
  key: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("resolveShortcut", () => {
  it("maps Ctrl/Cmd+Z to undo", () => {
    expect(resolveShortcut(evt({ key: "z", ctrlKey: true }), { isEditable: false })).toBe("undo");
    expect(resolveShortcut(evt({ key: "z", metaKey: true }), { isEditable: false })).toBe("undo");
  });

  it("maps Ctrl/Cmd+Shift+Z and Ctrl+Y to redo", () => {
    expect(
      resolveShortcut(evt({ key: "z", ctrlKey: true, shiftKey: true }), { isEditable: false }),
    ).toBe("redo");
    expect(resolveShortcut(evt({ key: "y", ctrlKey: true }), { isEditable: false })).toBe("redo");
  });

  it("maps Delete and Backspace to delete", () => {
    expect(resolveShortcut(evt({ key: "Delete" }), { isEditable: false })).toBe("delete");
    expect(resolveShortcut(evt({ key: "Backspace" }), { isEditable: false })).toBe("delete");
  });

  it("maps Ctrl/Cmd+E to export", () => {
    expect(resolveShortcut(evt({ key: "e", metaKey: true }), { isEditable: false })).toBe("export");
  });

  it("maps ? to help", () => {
    expect(resolveShortcut(evt({ key: "?" }), { isEditable: false })).toBe("help");
  });

  it("returns null while an editable field is focused", () => {
    expect(resolveShortcut(evt({ key: "z", ctrlKey: true }), { isEditable: true })).toBeNull();
    expect(resolveShortcut(evt({ key: "Backspace" }), { isEditable: true })).toBeNull();
  });

  it("ignores plain keys and unrelated combos", () => {
    expect(resolveShortcut(evt({ key: "z" }), { isEditable: false })).toBeNull();
    expect(resolveShortcut(evt({ key: "a", ctrlKey: true }), { isEditable: false })).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("treats inputs, textareas, selects, and contenteditable as editable", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isEditableTarget(editable)).toBe(true);
  });

  it("treats plain elements and null as not editable", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

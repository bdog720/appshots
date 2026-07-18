/** Editor keyboard shortcuts: pure resolution, no DOM wiring. */

export type ShortcutAction = "undo" | "redo" | "delete" | "export";

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Map a keydown to an editor action. Returns null while an editable field is
 * focused so typing (including a text editor's own undo) is never hijacked.
 */
export function resolveShortcut(
  event: ShortcutKeyEvent,
  { isEditable }: { isEditable: boolean },
): ShortcutAction | null {
  if (isEditable) return null;

  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && key === "z" && event.shiftKey) return "redo";
  if (mod && key === "z") return "undo";
  if (mod && key === "y") return "redo";
  if (key === "delete" || key === "backspace") return "delete";
  if (mod && key === "e") return "export";

  return null;
}

/** Whether a keydown target is a field that should receive the keystroke itself. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // isContentEditable covers inherited editability in real browsers; the
  // attribute check is a fallback (jsdom does not implement isContentEditable).
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true")
    return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

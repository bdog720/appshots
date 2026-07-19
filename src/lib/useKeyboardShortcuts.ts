import { useEffect, useRef } from "react";
import {
  isEditableTarget,
  resolveShortcut,
  type ShortcutAction,
} from "./keyboard-shortcuts";

type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Bind editor keyboard shortcuts to handlers. Resolution (and the "ignore while
 * typing" rule) lives in the tested `resolveShortcut`; this only wires it to a
 * window listener and dispatches. Handlers are read through a ref so the
 * listener is attached once and never goes stale.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveShortcut(event, {
        isEditable: isEditableTarget(event.target),
      });
      if (!action) return;
      const handler = handlersRef.current[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

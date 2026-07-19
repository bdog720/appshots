import { useEffect, useRef, type RefObject } from "react";

interface UseModalDismissOptions {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Called when the user requests dismissal (Escape). */
  onClose: () => void;
  /**
   * Ref to the modal container. When open, focus moves into it so keyboard
   * users land inside the dialog; on close, focus returns to whatever was
   * focused before it opened. Give the container `tabIndex={-1}`.
   */
  containerRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared modal accessibility behavior: close on Escape, and manage focus so it
 * enters the dialog on open and is restored to the trigger on close.
 *
 * Backdrop-click dismissal and `role="dialog"`/`aria-modal` live on the markup
 * itself; this hook covers the keyboard + focus concerns both modals share.
 */
export function useModalDismiss({
  isOpen,
  onClose,
  containerRef,
}: UseModalDismissOptions) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management: capture the trigger, move focus in, restore on close.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current =
      document.activeElement as HTMLElement | null;
    containerRef?.current?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, containerRef]);

  // Escape to close.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
}

"use client";

import { Icon } from "@/components/icons";
import { useEffect, useId, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { buttonClass } from "./styles";

// Clicking the dark area outside closes, but only when the press and the release are both there: a text selection
// or drag that crosses the panel's edge (either way) keeps it open.
export function useBackdropClose(onClose: () => void) {
  const outside = useRef({ down: false, up: false });
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
      outside.current = { down: event.target === event.currentTarget, up: false };
    },
    onPointerUp: (event: PointerEvent<HTMLDialogElement>) => {
      outside.current.up = event.target === event.currentTarget;
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      const { down, up } = outside.current;
      outside.current = { down: false, up: false };
      if (down && up && event.target === event.currentTarget) onClose();
    },
  };
}

// Native <dialog>: focus trapping, Escape and a top-layer backdrop for free.
// Render it only while open; it opens itself on mount.
export function Dialog({
  title,
  description,
  variant = "panel",
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  variant?: "panel" | "confirm";
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropClose(onClose);

  // No cleanup: unmounting removes the element, which closes it. A native "close"
  // listener would misfire under Strict Mode's double mount, so Escape uses onCancel.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // Start on the first field with a mouse; on touch screens avoid popping up the keyboard.
    const body = dialog.querySelector("[data-dialog-body]");
    const field = window.matchMedia("(pointer: fine)").matches
      ? body?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")
      : null;
    (field ?? body?.querySelector<HTMLElement>("button"))?.focus();
  }, []);

  const shape =
    variant === "panel"
      ? "admin-panel my-0 ml-auto mr-0 h-dvh max-h-dvh w-full max-w-md sm:border-l sm:border-slate-200"
      : "admin-confirm m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      {...backdrop}
      className={`${shape} bg-white p-0 text-left text-ink shadow-xl backdrop:bg-ink/40`}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <div className="mt-0.5 break-words text-sm text-slate-600">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={buttonClass("ghost", "icon")}>
            <Icon name="close" size={20} weight="regular" />
          </button>
        </div>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </dialog>
  );
}

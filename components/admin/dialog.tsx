"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { buttonClass } from "./styles";

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
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
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
            <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </dialog>
  );
}

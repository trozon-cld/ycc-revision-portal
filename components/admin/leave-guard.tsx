"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/admin/dialog";
import { buttonClass } from "@/components/admin/styles";

// Unsaved edits: warns on closing the tab and catches in-app links; `leaveTo` is where a caught link was going.
export function useLeaveGuard(dirty: boolean): [string | null, (to: string | null) => void] {
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(anchor.pathname + anchor.search);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);
  return [leaveTo, setLeaveTo];
}

// The question asked when a caught link would lose unsaved edits.
export function LeaveDialog({ what, onStay, onLeave }: { what: string; onStay: () => void; onLeave: () => void }) {
  return (
    <Dialog title="Leave without saving?" variant="confirm" onClose={onStay}>
      <p className="px-5 py-4 text-sm">Your changes to {what} haven&apos;t been saved yet.</p>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button type="button" onClick={onStay} className={buttonClass("secondary")}>
          Stay
        </button>
        <button type="button" onClick={onLeave} className={buttonClass("danger")}>
          Leave without saving
        </button>
      </div>
    </Dialog>
  );
}

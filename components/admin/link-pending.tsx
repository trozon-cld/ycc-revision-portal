"use client";

import { useLinkStatus } from "next/link";
import { useEffect } from "react";

// Inside a staff Link (tabs, Previous/Next; the Link needs "relative"): a bar while its page loads, and the page marked busy.
export function LinkPending() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    const main = document.getElementById("main-content");
    main?.setAttribute("aria-busy", "true");
    return () => main?.removeAttribute("aria-busy");
  }, [pending]);
  return <span aria-hidden="true" className={`link-pending${pending ? " is-pending" : ""}`} />;
}

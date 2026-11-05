"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

// Inside a staff Link (tabs, Previous/Next; the Link needs "relative"): a bar on the link while its page loads, and
// everything around it faded, keeping the link's own nav and other navs (breadcrumbs, tabs, Previous/Next) clear.
export function LinkPending() {
  const { pending } = useLinkStatus();
  const markerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const main = document.getElementById("main-content");
    const marker = markerRef.current;
    if (!pending || !main || !marker) return;
    const faded: Element[] = [];
    let node: Element | null = marker.closest("nav") ?? marker.parentElement;
    while (node && node !== main && node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.tagName === "NAV") continue;
        sibling.setAttribute("data-busy-fade", "");
        faded.push(sibling);
      }
      node = node.parentElement;
    }
    main.setAttribute("aria-busy", "true");
    return () => {
      main.removeAttribute("aria-busy");
      for (const element of faded) element.removeAttribute("data-busy-fade");
    };
  }, [pending]);
  return <span ref={markerRef} aria-hidden="true" className={`link-pending${pending ? " is-pending" : ""}`} />;
}

"use client";

import { useEffect, useRef } from "react";

// A confirm box that replaces its button: focus goes to the box's heading, and back to the button when it closes.
export function useConfirmFocus(open: boolean) {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    (open ? heading.current : opener.current)?.focus();
  }, [open]);
  return { heading, opener };
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A results page's main heading. It takes focus when the page opens, so screen readers start there.
export function ArrivalHeading({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className} focus:outline-none`}>
      {children}
    </h1>
  );
}

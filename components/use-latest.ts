"use client";

import { useLayoutEffect, useRef } from "react";

// The latest value, for handlers and effects that run later (a picker answering, a key press, a save).
// Updated straight after each render is committed, before any effect or event can read it.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

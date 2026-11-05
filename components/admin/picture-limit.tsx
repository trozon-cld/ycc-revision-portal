"use client";

import { createContext, useContext, type ReactNode } from "react";
import { MAX_UPLOAD_BYTES } from "@/lib/media/limits";

// The largest prepared picture the server accepts on this host; the admin layout passes it in from lib/hosting.ts.
const PictureLimitContext = createContext(MAX_UPLOAD_BYTES);

export function PictureLimitProvider({ bytes, children }: { bytes: number; children: ReactNode }) {
  return <PictureLimitContext.Provider value={bytes}>{children}</PictureLimitContext.Provider>;
}

export function usePictureLimit(): number {
  return useContext(PictureLimitContext);
}

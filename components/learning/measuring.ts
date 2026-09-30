"use client";

import { createContext, useContext } from "react";

// True inside the reader's hidden measuring layers: pictures keep their size (it comes from the stored
// width and height) but get no link, so measuring the whole book downloads no pictures.
export const MeasuringContext = createContext(false);

export function usePictureSrc(src: string | undefined): string | undefined {
  return useContext(MeasuringContext) ? undefined : src;
}

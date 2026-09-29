import { HOTSPOT_LIMITS, roundTenth, type HotspotArea } from "@/lib/questions/types/hotspot";

// Editor maths for drawing, moving and resizing areas. Everything is in % of the picture.

export type Box = Pick<HotspotArea, "x" | "y" | "w" | "h">;
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const MIN = HOTSPOT_LIMITS.minSize;
// A click without a drag draws an area this size around the point.
export const CLICK_SIZE = 12;

const within = (value: number, low: number, high: number) => roundTenth(Math.min(Math.max(value, low), Math.max(low, high)));

// A drawn area is never smaller than the minimum; a click gives a 12% area centred on the point.
export function drawnBox(x0: number, y0: number, x1: number, y1: number): Box {
  const tiny = Math.abs(x1 - x0) < 2 && Math.abs(y1 - y0) < 2;
  const w = tiny ? CLICK_SIZE : Math.max(MIN, roundTenth(Math.abs(x1 - x0)));
  const h = tiny ? CLICK_SIZE : Math.max(MIN, roundTenth(Math.abs(y1 - y0)));
  const cx = tiny ? x0 : (x0 + x1) / 2;
  const cy = tiny ? y0 : (y0 + y1) / 2;
  const width = Math.min(w, 100);
  const height = Math.min(h, 100);
  return { x: within(cx - width / 2, 0, 100 - width), y: within(cy - height / 2, 0, 100 - height), w: width, h: height };
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: within(box.x + dx, 0, 100 - box.w), y: within(box.y + dy, 0, 100 - box.h) };
}

// Drags one edge or corner; the opposite side stays put. Never below the minimum or outside the picture.
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number): Box {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const minW = Math.min(MIN, box.w);
  const minH = Math.min(MIN, box.h);
  let { x, y, w, h } = box;
  if (handle.includes("w")) {
    x = within(box.x + dx, 0, right - minW);
    w = roundTenth(right - x);
  }
  if (handle.includes("e")) w = within(box.w + dx, minW, 100 - box.x);
  if (handle.includes("n")) {
    y = within(box.y + dy, 0, bottom - minH);
    h = roundTenth(bottom - y);
  }
  if (handle.includes("s")) h = within(box.h + dy, minH, 100 - box.y);
  return { x, y, w, h };
}

// Arrow keys: move by 1% (5% with Shift); with Alt they resize from the right and bottom edges.
export function nudgeBox(box: Box, key: string, shift: boolean, alt: boolean): Box | null {
  const step = shift ? 5 : 1;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[key];
  if (!move) return null;
  return alt ? resizeBox(box, key === "ArrowLeft" || key === "ArrowRight" ? "e" : "s", move[0], move[1]) : moveBox(box, move[0], move[1]);
}

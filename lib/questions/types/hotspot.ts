import { defineQuestionType } from "../define";
import { cleanLine, isRecord, isUuid } from "../text";

// Tap the area on a picture: the candidate places one point; it is correct inside any correct area
// (or within a small margin of one). Positions are percentages of the picture, so any screen size works.

export const HOTSPOT_LIMITS = {
  minAreas: 1,
  maxAreas: 5,
  // Smallest area a fingertip can hit on a phone, as a share of the picture's width and height.
  minSize: 8,
  // Taps this close to an area (share of the picture) still count.
  margin: 3,
  labelLength: 80,
} as const;

export const HOTSPOT_SHAPES = ["rect", "ellipse"] as const;
export type HotspotShape = (typeof HOTSPOT_SHAPES)[number];

// x, y = top-left corner; w, h = size. All 0–100, in steps of 0.1.
export type HotspotArea = { id: string; shape: HotspotShape; x: number; y: number; w: number; h: number };
export type HotspotPoint = { x: number; y: number };
export type HotspotContent = { mediaId: string };
// The areas live in the answer, so Practice and Mock never send them to the browser.
export type HotspotAnswer = { areas: HotspotArea[]; label?: string };

export const roundTenth = (value: number) => Math.round(value * 10) / 10;

export function hitsArea(area: HotspotArea, point: HotspotPoint, margin: number = HOTSPOT_LIMITS.margin): boolean {
  if (area.shape === "rect") {
    return point.x >= area.x - margin && point.x <= area.x + area.w + margin && point.y >= area.y - margin && point.y <= area.y + area.h + margin;
  }
  const rx = area.w / 2 + margin;
  const ry = area.h / 2 + margin;
  const dx = (point.x - (area.x + area.w / 2)) / rx;
  const dy = (point.y - (area.y + area.h / 2)) / ry;
  return dx * dx + dy * dy <= 1;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? roundTenth(value) : null;
}

export const hotspotDef = defineQuestionType<HotspotContent, HotspotAnswer, HotspotPoint>({
  parse(content, answer) {
    if (!isRecord(content) || !isUuid(content.mediaId)) return { ok: false, error: "Choose the picture candidates will tap." };
    const raw = isRecord(answer) && Array.isArray(answer.areas) ? answer.areas : [];
    if (raw.length < HOTSPOT_LIMITS.minAreas) return { ok: false, error: "Draw at least one correct area on the picture." };
    if (raw.length > HOTSPOT_LIMITS.maxAreas) {
      return { ok: false, error: `A picture can have up to ${HOTSPOT_LIMITS.maxAreas} correct areas.` };
    }

    const areas: HotspotArea[] = [];
    const ids = new Set<string>();
    for (const [index, item] of raw.entries()) {
      const name = `Area ${index + 1}`;
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: `${name} is not valid. Remove it and draw it again.` };
      const id = item.id.toLowerCase();
      if (ids.has(id)) return { ok: false, error: `${name} is a duplicate. Remove it and draw it again.` };
      if (!HOTSPOT_SHAPES.includes(item.shape as HotspotShape)) return { ok: false, error: `${name} needs a shape: rectangle or oval.` };
      const [x, y, w, h] = [item.x, item.y, item.w, item.h].map(readNumber);
      if (x === null || y === null || w === null || h === null) {
        return { ok: false, error: `${name} has a missing position or size. Enter numbers from 0 to 100.` };
      }
      if (w < HOTSPOT_LIMITS.minSize || h < HOTSPOT_LIMITS.minSize) {
        return {
          ok: false,
          error: `${name} is too small for a finger. Make it at least ${HOTSPOT_LIMITS.minSize}% wide and ${HOTSPOT_LIMITS.minSize}% tall.`,
        };
      }
      if (x < 0 || y < 0 || roundTenth(x + w) > 100 || roundTenth(y + h) > 100) {
        return { ok: false, error: `${name} goes outside the picture. Move it or make it smaller.` };
      }
      ids.add(id);
      areas.push({ id, shape: item.shape as HotspotShape, x, y, w, h });
    }

    const label = isRecord(answer) ? cleanLine(answer.label) : "";
    if (label.length > HOTSPOT_LIMITS.labelLength) {
      return { ok: false, error: `The answer label must be ${HOTSPOT_LIMITS.labelLength} characters or fewer.` };
    }

    return {
      ok: true,
      content: { mediaId: content.mediaId.toLowerCase() },
      answer: label ? { areas, label } : { areas },
    };
  },

  parseResponse(raw) {
    if (!isRecord(raw)) return null;
    const x = readNumber(raw.x);
    const y = readNumber(raw.y);
    if (x === null || y === null || x < 0 || x > 100 || y < 0 || y > 100) return null;
    return { x, y };
  },

  check(_content, answer, response) {
    return answer.areas.some((area) => hitsArea(area, response));
  },

  // A point clear of every area (with its margin), so the book can measure the "wrong answer" look.
  sampleWrongResponse(_content, answer) {
    for (let y = 5; y <= 95; y += 5) {
      for (let x = 5; x <= 95; x += 5) {
        if (!answer.areas.some((area) => hitsArea(area, { x, y }))) return { x, y };
      }
    }
    return null;
  },

  mediaIds(content) {
    return [content.mediaId];
  },
});

// Editor drafts: the picture may not be chosen yet (mediaId "").
export type HotspotDraftAnswer = { areas: HotspotArea[]; label: string };

export function emptyHotspot(): { content: HotspotContent; answer: HotspotDraftAnswer } {
  return { content: { mediaId: "" }, answer: { areas: [], label: "" } };
}

// Keeps whatever usable areas a stored question has, so the editor can still open it.
export function editableHotspot(content: unknown, answer: unknown, makeId: () => string) {
  const mediaId = isRecord(content) && isUuid(content.mediaId) ? content.mediaId.toLowerCase() : "";
  const raw = isRecord(answer) && Array.isArray(answer.areas) ? answer.areas : [];
  const clamp = (value: unknown, fallback: number) => {
    const number = readNumber(value);
    return number === null ? fallback : Math.min(100, Math.max(0, number));
  };
  const areas: HotspotArea[] = raw
    .filter(isRecord)
    .slice(0, HOTSPOT_LIMITS.maxAreas)
    .map((item) => ({
      id: isUuid(item.id) ? item.id.toLowerCase() : makeId(),
      shape: item.shape === "ellipse" ? "ellipse" : "rect",
      x: clamp(item.x, 0),
      y: clamp(item.y, 0),
      w: clamp(item.w, 20),
      h: clamp(item.h, 20),
    }));
  const label = isRecord(answer) && typeof answer.label === "string" ? answer.label : "";
  return { content: { mediaId }, answer: { areas, label } };
}

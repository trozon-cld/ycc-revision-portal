import { cleanLine, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";
import { defineQuestionType } from "../define";
import { HOTSPOT_LIMITS, HOTSPOT_SHAPES, roundTenth, type HotspotArea, type HotspotShape } from "./hotspot";

// Choose the area: 2–6 visible areas on a picture, exactly one right. Unlike "Tap the area", the areas
// are in the content; only which one is correct is in the answer.

export const AREA_CHOICE_LIMITS = {
  minAreas: 2,
  maxAreas: 6,
  minSize: HOTSPOT_LIMITS.minSize,
  nameLength: 40,
  labelLength: HOTSPOT_LIMITS.labelLength,
} as const;

// `name` is read aloud by screen readers only (e.g. "Ladder"); it's never shown.
export type ChoiceArea = HotspotArea & { name?: string };
export type AreaChoiceContent = { mediaId: string; areas: ChoiceArea[] };
export type AreaChoiceAnswer = { correctAreaId: string; label?: string };

// Areas may not overlap, so every tap means exactly one area. Checked on their outer boxes.
export function boxesOverlap(a: HotspotArea, b: HotspotArea): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlappingPairs(areas: HotspotArea[]): [number, number][] {
  const pairs: [number, number][] = [];
  areas.forEach((a, i) => areas.forEach((b, j) => j > i && boxesOverlap(a, b) && pairs.push([i, j])));
  return pairs;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? roundTenth(value) : null;
}

export const areaChoiceDef = defineQuestionType<AreaChoiceContent, AreaChoiceAnswer, string>({
  parse(content, answer) {
    if (!isRecord(content) || !isUuid(content.mediaId)) return { ok: false, error: "Choose the picture candidates will see." };
    const raw = Array.isArray(content.areas) ? content.areas : [];
    if (raw.length < AREA_CHOICE_LIMITS.minAreas) {
      return { ok: false, error: `Draw at least ${AREA_CHOICE_LIMITS.minAreas} areas: one right answer and at least one wrong one.` };
    }
    if (raw.length > AREA_CHOICE_LIMITS.maxAreas) {
      return { ok: false, error: `A picture can have up to ${AREA_CHOICE_LIMITS.maxAreas} areas to choose from.` };
    }

    const areas: ChoiceArea[] = [];
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
      if (w < AREA_CHOICE_LIMITS.minSize || h < AREA_CHOICE_LIMITS.minSize) {
        return {
          ok: false,
          error: `${name} is too small for a finger. Make it at least ${AREA_CHOICE_LIMITS.minSize}% wide and ${AREA_CHOICE_LIMITS.minSize}% tall.`,
        };
      }
      if (x < 0 || y < 0 || roundTenth(x + w) > 100 || roundTenth(y + h) > 100) {
        return { ok: false, error: `${name} goes outside the picture. Move it or make it smaller.` };
      }
      const spoken = cleanLine(item.name);
      if (spoken.length > AREA_CHOICE_LIMITS.nameLength) {
        return { ok: false, error: `${name}'s spoken name must be ${AREA_CHOICE_LIMITS.nameLength} characters or fewer.` };
      }
      ids.add(id);
      areas.push({ id, shape: item.shape as HotspotShape, x, y, w, h, ...(spoken ? { name: spoken } : {}) });
    }
    const overlap = overlappingPairs(areas)[0];
    if (overlap) return { ok: false, error: `Areas ${overlap[0] + 1} and ${overlap[1] + 1} overlap. Move them apart.` };

    const correct = isRecord(answer) && isUuid(answer.correctAreaId) ? answer.correctAreaId.toLowerCase() : null;
    if (!correct || !ids.has(correct)) return { ok: false, error: "Mark which area is the right answer." };
    const label = isRecord(answer) ? cleanLine(answer.label) : "";
    if (label.length > AREA_CHOICE_LIMITS.labelLength) {
      return { ok: false, error: `The answer label must be ${AREA_CHOICE_LIMITS.labelLength} characters or fewer.` };
    }

    return {
      ok: true,
      content: { mediaId: content.mediaId.toLowerCase(), areas },
      answer: label ? { correctAreaId: correct, label } : { correctAreaId: correct },
    };
  },

  parseResponse(raw, content) {
    if (typeof raw !== "string") return null;
    const id = raw.toLowerCase();
    return content.areas.some((area) => area.id === id) ? id : null;
  },

  check(_content, answer, response) {
    return response === answer.correctAreaId;
  },

  sampleWrongResponse(content, answer) {
    return content.areas.find((area) => area.id !== answer.correctAreaId)?.id ?? null;
  },

  mediaIds(content) {
    return [content.mediaId];
  },
});

// Editor drafts: the picture may not be chosen yet; names are kept as typed.
export type AreaChoiceDraft = { content: { mediaId: string; areas: (HotspotArea & { name: string })[] }; answer: { correctAreaId: string; label: string } };

export function emptyAreaChoice(): AreaChoiceDraft {
  return { content: { mediaId: "", areas: [] }, answer: { correctAreaId: "", label: "" } };
}

// Keeps whatever usable areas a stored question has, so the editor can still open it.
export function editableAreaChoice(content: unknown, answer: unknown, makeId: () => string): AreaChoiceDraft {
  const mediaId = isRecord(content) && isUuid(content.mediaId) ? content.mediaId.toLowerCase() : "";
  const raw = isRecord(content) && Array.isArray(content.areas) ? content.areas : [];
  const clamp = (value: unknown, fallback: number) => {
    const number = readNumber(value);
    return number === null ? fallback : Math.min(100, Math.max(0, number));
  };
  const areas = raw
    .filter(isRecord)
    .slice(0, AREA_CHOICE_LIMITS.maxAreas)
    .map((item) => ({
      id: isUuid(item.id) ? item.id.toLowerCase() : makeId(),
      shape: (item.shape === "ellipse" ? "ellipse" : "rect") as HotspotShape,
      x: clamp(item.x, 0),
      y: clamp(item.y, 0),
      w: clamp(item.w, 20),
      h: clamp(item.h, 20),
      name: typeof item.name === "string" ? item.name : "",
    }));
  const correct = isRecord(answer) && typeof answer.correctAreaId === "string" ? answer.correctAreaId.toLowerCase() : "";
  const label = isRecord(answer) && typeof answer.label === "string" ? answer.label : "";
  return { content: { mediaId, areas }, answer: { correctAreaId: areas.some((area) => area.id === correct) ? correct : "", label } };
}

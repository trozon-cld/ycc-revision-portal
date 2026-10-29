import { cleanLine, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";
import { AREA_CHOICE_LIMITS } from "./types/area-choice";
import { HOTSPOT_LIMITS } from "./types/hotspot";

// Tap the area and Choose the area questions can be kept as drafts before their areas are drawn (e.g. from a bulk
// upload): picture, question text and answer label only. They can't be published, or stay published, like that.

export const AREA_TYPES: readonly string[] = ["hotspot", "area_choice"];
export const NEEDS_AREAS_MESSAGE = "Mark the areas on the picture before publishing.";

// Where each type keeps its areas: Tap the area in the answer, Choose the area in the content.
function areasOf(type: string, content: unknown, answer: unknown): unknown {
  return type === "hotspot" ? (isRecord(answer) ? answer.areas : undefined) : isRecord(content) ? content.areas : undefined;
}

// The same rule in SQL, for a questions row aliased q (the Question bank's "Needs areas").
export const NEEDS_AREAS_SQL = `(q.type = 'hotspot' and coalesce(case when jsonb_typeof(q.answer -> 'areas') = 'array' then jsonb_array_length(q.answer -> 'areas') end, 0) = 0
  or q.type = 'area_choice' and coalesce(case when jsonb_typeof(q.content -> 'areas') = 'array' then jsonb_array_length(q.content -> 'areas') end, 0) = 0)`;

export function needsAreas(question: { type: string; content: unknown; answer: unknown }): boolean {
  if (!AREA_TYPES.includes(question.type)) return false;
  const areas = areasOf(question.type, question.content, question.answer);
  return !Array.isArray(areas) || areas.length === 0;
}

// A question of these types with no areas at all, checked for what it does have; null if it isn't one.
export function parseUnmarked(
  type: string,
  content: unknown,
  answer: unknown
): { ok: true; content: unknown; answer: unknown } | { ok: false; error: string } | null {
  if (!needsAreas({ type, content, answer })) return null;
  if (!isRecord(content) || !isUuid(content.mediaId)) return { ok: false, error: "Choose the picture candidates will tap." };
  const label = isRecord(answer) ? cleanLine(answer.label) : "";
  const max = type === "hotspot" ? HOTSPOT_LIMITS.labelLength : AREA_CHOICE_LIMITS.labelLength;
  if (label.length > max) return { ok: false, error: `The answer label must be ${max} characters or fewer.` };
  const mediaId = content.mediaId.toLowerCase();
  const withLabel = label ? { label } : {};
  return type === "hotspot"
    ? { ok: true, content: { mediaId }, answer: { areas: [], ...withLabel } }
    : { ok: true, content: { mediaId, areas: [] }, answer: withLabel };
}

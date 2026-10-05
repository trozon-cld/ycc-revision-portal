import { cleanLine, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";
import { defineQuestionType } from "../define";

// Match pictures: 3–5 pictures and labelled boxes; all must be placed right. The content holds pictures
// (sorted by id, so their order gives nothing away) and boxes; which goes where is only in the answer.

export const MATCH_LIMITS = { minPairs: 3, maxPairs: 5, defaultPairs: 4, labelLength: 60 } as const;

export type MatchItem = { id: string; mediaId: string };
export type MatchTarget = { id: string; label: string };
export type MatchContent = { items: MatchItem[]; targets: MatchTarget[] };
// One entry per box, in box order.
export type MatchAnswer = { matches: { targetId: string; itemId: string }[] };
// Box id → picture id; boxes not filled yet are left out.
export type MatchResponse = Record<string, string>;

export const matchPicturesDef = defineQuestionType<MatchContent, MatchAnswer, MatchResponse>({
  parse(content, answer) {
    const rawItems = isRecord(content) && Array.isArray(content.items) ? content.items : [];
    const rawTargets = isRecord(content) && Array.isArray(content.targets) ? content.targets : [];
    const rawMatches = isRecord(answer) && Array.isArray(answer.matches) ? answer.matches : [];
    if (rawTargets.length < MATCH_LIMITS.minPairs) return { ok: false, error: `Add at least ${MATCH_LIMITS.minPairs} pairs.` };
    if (rawTargets.length > MATCH_LIMITS.maxPairs) return { ok: false, error: `A matching question can have up to ${MATCH_LIMITS.maxPairs} pairs.` };
    if (rawItems.length !== rawTargets.length) return { ok: false, error: "Every box needs exactly one picture." };

    const targets: MatchTarget[] = [];
    const labels = new Map<string, number>();
    for (const [index, item] of rawTargets.entries()) {
      const name = `Pair ${index + 1}`;
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: `${name} is not valid. Remove it and add it again.` };
      const label = cleanLine(item.label);
      if (!label) return { ok: false, error: `${name} needs the text for its box.` };
      if (label.length > MATCH_LIMITS.labelLength) {
        return { ok: false, error: `${name}'s text must be ${MATCH_LIMITS.labelLength} characters or fewer.` };
      }
      const same = labels.get(label.toLowerCase());
      if (same !== undefined) return { ok: false, error: `Pairs ${same + 1} and ${index + 1} have the same text. Each box needs its own.` };
      labels.set(label.toLowerCase(), index);
      targets.push({ id: item.id.toLowerCase(), label });
    }

    const byId = new Map<string, Record<string, unknown>>();
    for (const item of rawItems) {
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: "A picture is not valid. Choose it again." };
      byId.set(item.id.toLowerCase(), item);
    }
    // Checked pair by pair (box order), so messages name the pair to fix.
    const items = new Map<string, MatchItem>();
    const pictures = new Map<string, number>();
    const matches: MatchAnswer["matches"] = [];
    for (const [index, target] of targets.entries()) {
      const match = rawMatches.find((entry) => isRecord(entry) && typeof entry.targetId === "string" && entry.targetId.toLowerCase() === target.id);
      const itemId = isRecord(match) && typeof match.itemId === "string" ? match.itemId.toLowerCase() : "";
      const item = byId.get(itemId);
      if (!item || items.has(itemId) || !isUuid(item.mediaId)) return { ok: false, error: `Pair ${index + 1} needs a picture. Choose one.` };
      const mediaId = item.mediaId.toLowerCase();
      const same = pictures.get(mediaId);
      if (same !== undefined) return { ok: false, error: `Pairs ${same + 1} and ${index + 1} use the same picture. Each pair needs its own.` };
      pictures.set(mediaId, index);
      items.set(itemId, { id: itemId, mediaId });
      matches.push({ targetId: target.id, itemId });
    }

    return {
      ok: true,
      content: { items: [...items.values()].sort((a, b) => a.id.localeCompare(b.id)), targets },
      answer: { matches },
    };
  },

  parseResponse(raw, content) {
    if (!isRecord(raw)) return null;
    const response: MatchResponse = {};
    const placed = new Set<string>();
    for (const [targetId, value] of Object.entries(raw)) {
      const target = content.targets.find((item) => item.id === targetId.toLowerCase());
      const itemId = typeof value === "string" ? value.toLowerCase() : "";
      if (!target || !content.items.some((item) => item.id === itemId) || placed.has(itemId)) return null;
      placed.add(itemId);
      response[target.id] = itemId;
    }
    return Object.keys(response).length ? response : null;
  },

  check(_content, answer, response) {
    return answer.matches.every((match) => response[match.targetId] === match.itemId);
  },

  incomplete(content, raw) {
    const filled = isRecord(raw) ? Object.keys(raw).length : 0;
    return filled < content.targets.length ? `Place all ${content.targets.length} pictures first.` : null;
  },

  // Every picture one box along: all wrong, so the book measures the tallest "checked" look.
  sampleWrongResponse(_content, answer) {
    const { matches } = answer;
    return Object.fromEntries(matches.map((match, index) => [match.targetId, matches[(index + 1) % matches.length].itemId]));
  },

  mediaIds(content) {
    return content.items.map((item) => item.mediaId);
  },
});

// Editor drafts use the stored shape, with pictures listed in box order (row i = picture i, box i,
// match i); a picture may not be chosen yet (mediaId "").
export type MatchDraft = { content: MatchContent; answer: MatchAnswer };

export function draftPair(makeId: () => string) {
  const targetId = makeId();
  const itemId = makeId();
  return { item: { id: itemId, mediaId: "" }, target: { id: targetId, label: "" }, match: { targetId, itemId } };
}

export function emptyMatchPictures(makeId: () => string): MatchDraft {
  const rows = Array.from({ length: MATCH_LIMITS.defaultPairs }, () => draftPair(makeId));
  return {
    content: { items: rows.map((row) => row.item), targets: rows.map((row) => row.target) },
    answer: { matches: rows.map((row) => row.match) },
  };
}

// A stored question back to editor rows, in box order.
export function editableMatchPictures(content: unknown, answer: unknown, makeId: () => string): MatchDraft {
  const items = isRecord(content) && Array.isArray(content.items) ? content.items.filter(isRecord) : [];
  const targets = isRecord(content) && Array.isArray(content.targets) ? content.targets.filter(isRecord) : [];
  const matches = isRecord(answer) && Array.isArray(answer.matches) ? answer.matches.filter(isRecord) : [];
  const rows = targets.slice(0, MATCH_LIMITS.maxPairs).map((target) => {
    const targetId = isUuid(target.id) ? target.id.toLowerCase() : makeId();
    const matched = matches.find((match) => String(match.targetId).toLowerCase() === targetId)?.itemId;
    const item = items.find((entry) => String(entry.id).toLowerCase() === String(matched).toLowerCase());
    const itemId = item && isUuid(item.id) ? item.id.toLowerCase() : makeId();
    return {
      item: { id: itemId, mediaId: item && isUuid(item.mediaId) ? item.mediaId.toLowerCase() : "" },
      target: { id: targetId, label: typeof target.label === "string" ? target.label : "" },
      match: { targetId, itemId },
    };
  });
  while (rows.length < MATCH_LIMITS.minPairs) rows.push(draftPair(makeId));
  return {
    content: { items: rows.map((row) => row.item), targets: rows.map((row) => row.target) },
    answer: { matches: rows.map((row) => row.match) },
  };
}

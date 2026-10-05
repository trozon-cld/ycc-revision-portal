// A content page is an ordered list of typed blocks, stored as JSON. Every block keeps a stable
// id so later features (Listen, translations) can refer to it. New types can be added freely.

import { cleanText, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";

export type HeadingBlock = { id: string; type: "heading"; level: 1 | 2; text: string };
export type ParagraphBlock = { id: string; type: "paragraph"; text: string };
export type ListBlock = { id: string; type: "list"; style: "bullet" | "numbered"; items: string[] };
export type PictureSize = "small" | "medium" | "large" | "full";
export type PictureAlign = "left" | "center" | "right";
// size and align are optional: pages saved before they existed show full width, centred.
export type PictureBlock = {
  id: string;
  type: "picture";
  mediaId: string;
  caption?: string;
  size?: PictureSize;
  align?: PictureAlign;
};

export const PICTURE_SIZES: PictureSize[] = ["small", "medium", "large", "full"];
export const PICTURE_ALIGNS: PictureAlign[] = ["left", "center", "right"];
export type CalloutBlock = { id: string; type: "callout"; tone: "key-point" | "remember"; text: string };

export type Block = HeadingBlock | ParagraphBlock | ListBlock | PictureBlock | CalloutBlock;
export type BlockType = Block["type"];

export const BLOCK_LIMITS = {
  blocksPerPage: 60,
  headingLength: 200,
  textLength: 4000,
  listItems: 30,
  listItemLength: 500,
  captionLength: 300,
} as const;

export type ParseResult = { ok: true; blocks: Block[] } | { ok: false; error: string };

// Checks untrusted JSON (from the editor or the database) and returns clean, typed blocks.
export function parseBlocks(value: unknown): ParseResult {
  if (!Array.isArray(value)) return { ok: false, error: "Page content must be a list of blocks." };
  if (value.length > BLOCK_LIMITS.blocksPerPage) {
    return { ok: false, error: `A page can have up to ${BLOCK_LIMITS.blocksPerPage} blocks.` };
  }

  const blocks: Block[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of value.entries()) {
    const where = `Block ${index + 1}`;
    const result = parseBlock(raw);
    if (typeof result === "string") return { ok: false, error: `${where}: ${result}` };
    if (ids.has(result.id)) return { ok: false, error: `${where}: duplicate block id.` };
    ids.add(result.id);
    blocks.push(result);
  }
  return { ok: true, blocks };
}

function parseBlock(raw: unknown): Block | string {
  if (!isRecord(raw)) return "not a block.";
  const id = raw.id;
  if (!isUuid(id)) return "missing or invalid id.";

  switch (raw.type) {
    case "heading": {
      const text = cleanBlockText(raw.text, BLOCK_LIMITS.headingLength, "heading");
      if (typeof text !== "string" || !text) return typeof text === "string" ? "heading is empty." : text.error;
      if (raw.level !== 1 && raw.level !== 2) return "heading level must be 1 or 2.";
      return { id, type: "heading", level: raw.level, text };
    }
    case "paragraph": {
      const text = cleanBlockText(raw.text, BLOCK_LIMITS.textLength, "paragraph");
      if (typeof text !== "string" || !text) return typeof text === "string" ? "paragraph is empty." : text.error;
      return { id, type: "paragraph", text };
    }
    case "list": {
      if (raw.style !== "bullet" && raw.style !== "numbered") return "list style must be bullet or numbered.";
      if (!Array.isArray(raw.items) || raw.items.length === 0) return "list needs at least one item.";
      if (raw.items.length > BLOCK_LIMITS.listItems) return `a list can have up to ${BLOCK_LIMITS.listItems} items.`;
      const items: string[] = [];
      for (const item of raw.items) {
        const text = cleanBlockText(item, BLOCK_LIMITS.listItemLength, "list item");
        if (typeof text !== "string" || !text) return typeof text === "string" ? "list item is empty." : text.error;
        items.push(text);
      }
      return { id, type: "list", style: raw.style, items };
    }
    case "picture": {
      if (!isUuid(raw.mediaId)) return "choose a picture.";
      const picture: PictureBlock = { id, type: "picture", mediaId: raw.mediaId };
      if (raw.caption !== undefined && raw.caption !== "") {
        const caption = cleanBlockText(raw.caption, BLOCK_LIMITS.captionLength, "caption");
        if (typeof caption !== "string") return caption.error;
        if (caption) picture.caption = caption;
      }
      if (raw.size !== undefined) {
        if (!PICTURE_SIZES.includes(raw.size as PictureSize)) return "picture size must be small, medium, large or full.";
        if (raw.size !== "full") picture.size = raw.size as PictureSize;
      }
      if (raw.align !== undefined) {
        if (!PICTURE_ALIGNS.includes(raw.align as PictureAlign)) return "picture position must be left, center or right.";
        // Position only matters when the picture is narrower than the page.
        if (raw.align !== "center" && picture.size) picture.align = raw.align as PictureAlign;
      }
      return picture;
    }
    case "callout": {
      if (raw.tone !== "key-point" && raw.tone !== "remember") return "box style must be key point or remember.";
      const text = cleanBlockText(raw.text, BLOCK_LIMITS.textLength, "box");
      if (typeof text !== "string" || !text) return typeof text === "string" ? "box is empty." : text.error;
      return { id, type: "callout", tone: raw.tone, text };
    }
    default:
      return "unknown block type.";
  }
}

// Trims ends and each line; keeps single line breaks inside text (shown as new lines).
function cleanBlockText(value: unknown, max: number, label: string): string | { error: string } {
  if (typeof value !== "string") return { error: `${label} text is missing.` };
  const text = cleanText(value);
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  return text;
}

export function collectMediaIds(blocks: Block[]): string[] {
  return [...new Set(blocks.flatMap((block) => (block.type === "picture" ? [block.mediaId] : [])))];
}

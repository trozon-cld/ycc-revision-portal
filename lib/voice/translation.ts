import { parseBlocks, type Block } from "@/lib/content/blocks";
import { isRecord } from "@/lib/text";

// What a translator sees of a page: each block's id and its texts (one for headings, paragraphs and boxes,
// one per item for lists, the caption for pictures). Everything else is copied from the English page.
export type TranslatableBlock = { id: string; texts: string[] };

export function toTranslatable(blocks: Block[]): TranslatableBlock[] {
  const out: TranslatableBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "callout":
        out.push({ id: block.id, texts: [block.text] });
        break;
      case "list":
        out.push({ id: block.id, texts: [...block.items] });
        break;
      case "picture":
        if (block.caption) out.push({ id: block.id, texts: [block.caption] });
        break;
    }
  }
  return out;
}

export type TranslationResult = { ok: true; blocks: Block[] } | { ok: false; error: string };

// Puts translated texts back into the English page's blocks. Refused unless every block comes back once,
// with the same number of texts, and the result passes the page's own checks (lengths, empty text).
export function applyTranslation(source: Block[], translated: unknown): TranslationResult {
  if (!Array.isArray(translated)) return { ok: false, error: "The translation came back in the wrong shape." };
  const expected = toTranslatable(source);
  const byId = new Map<string, string[]>();
  for (const item of translated) {
    if (!isRecord(item) || typeof item.id !== "string" || !Array.isArray(item.texts) || !item.texts.every((t) => typeof t === "string")) {
      return { ok: false, error: "The translation came back in the wrong shape." };
    }
    if (byId.has(item.id)) return { ok: false, error: "The translation repeated a block." };
    byId.set(item.id, item.texts as string[]);
  }
  if (byId.size !== expected.length) return { ok: false, error: "The translation missed or added blocks." };
  for (const block of expected) {
    const texts = byId.get(block.id);
    if (!texts) return { ok: false, error: "The translation missed or added blocks." };
    if (texts.length !== block.texts.length) return { ok: false, error: "The translation changed the number of list items." };
  }

  const merged = source.map((block): Block => {
    const texts = byId.get(block.id);
    if (!texts) return block;
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "callout":
        return { ...block, text: texts[0] };
      case "list":
        return { ...block, items: texts };
      case "picture":
        return { ...block, caption: texts[0] };
    }
  });
  const parsed = parseBlocks(merged);
  if (!parsed.ok) return { ok: false, error: `The translation doesn't fit the page: ${parsed.error}` };
  // parseBlocks keeps every block, so the order and ids match the English page.
  return { ok: true, blocks: parsed.blocks };
}

// A staff edit to a translation: the same rules, starting from blocks typed in the editor.
export function checkEditedTranslation(source: Block[], edited: unknown): TranslationResult {
  const parsed = parseBlocks(edited);
  if (!parsed.ok) return parsed;
  const shape = (blocks: Block[]) => blocks.map((block) => `${block.id}:${block.type}`).join();
  if (shape(parsed.blocks) !== shape(source)) return { ok: false, error: "The translation must keep the English page's blocks in the same order." };
  return applyTranslation(source, toTranslatable(parsed.blocks));
}

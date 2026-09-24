import { parseBlocks, type Block, type BlockType } from "./blocks";

// Editor drafts share the saved block shape, but may be half-filled while typing
// (empty text, list lines still blank, no picture chosen yet).

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  picture: "Picture",
  callout: "Key point box",
};

export function newBlock(type: BlockType, id: string = crypto.randomUUID()): Block {
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "" };
    case "paragraph":
      return { id, type, text: "" };
    case "list":
      return { id, type, style: "bullet", items: [""] };
    case "picture":
      return { id, type, mediaId: "", caption: "" };
    case "callout":
      return { id, type, tone: "key-point", text: "" };
  }
}

export function duplicateBlock(block: Block, id: string = crypto.randomUUID()): Block {
  return { ...structuredClone(block), id };
}

// What gets sent to the server: blank list lines dropped, everything else as typed.
export function toSavable(blocks: Block[]): Block[] {
  return blocks.map((block) =>
    block.type === "list" ? { ...block, items: block.items.filter((item) => item.trim() !== "") } : block
  );
}

// Blocks that are complete enough to show in the live preview; half-finished ones are skipped.
export function previewableBlocks(blocks: Block[]): Block[] {
  return toSavable(blocks).flatMap((block) => {
    const parsed = parseBlocks([block]);
    return parsed.ok ? parsed.blocks : [];
  });
}

// Wraps the selected text in ** markers; with nothing selected, inserts a placeholder to type over.
export function applyBold(text: string, start: number, end: number): { text: string; start: number; end: number } {
  const selected = text.slice(start, end);
  const trimmedStart = start + (selected.length - selected.trimStart().length);
  const trimmedEnd = end - (selected.length - selected.trimEnd().length);
  if (trimmedEnd > trimmedStart) {
    const inner = text.slice(trimmedStart, trimmedEnd);
    const next = `${text.slice(0, trimmedStart)}**${inner}**${text.slice(trimmedEnd)}`;
    return { text: next, start: trimmedStart + 2, end: trimmedEnd + 2 };
  }
  const placeholder = "bold text";
  const next = `${text.slice(0, start)}**${placeholder}**${text.slice(end)}`;
  return { text: next, start: start + 2, end: start + 2 + placeholder.length };
}

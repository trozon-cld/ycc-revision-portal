import type { Block } from "@/lib/content/blocks";
import { plainText } from "@/lib/content/inline";
import { SPEECH_PART_CHARS } from "./limits";
import type { VoiceLanguage } from "./languages";

// What is read aloud for each block, in page order: headings and paragraphs, list items one by one,
// boxes with their label, pictures by their caption (a picture without one is skipped).
export function readingParts(blocks: Block[], language: VoiceLanguage): string[] {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        parts.push(sentence(plainText(block.text)));
        break;
      case "list":
        parts.push(block.items.map((item, index) => sentence(block.style === "numbered" ? `${index + 1}. ${plainText(item)}` : plainText(item))).join("\n"));
        break;
      case "callout":
        parts.push(`${sentence(language.boxLabels[block.tone])}\n${sentence(plainText(block.text))}`);
        break;
      case "picture":
        if (block.caption) parts.push(sentence(plainText(block.caption)));
        break;
    }
  }
  return parts.filter(Boolean);
}

// A full stop where a line ends without one, so the voice pauses (headings and list items often have none).
function sentence(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?।:;…"'”’)]$/.test(line) ? line : `${line}.`))
    .join("\n");
}

// The text sent to the voice service, in parts of about SPEECH_PART_CHARS, split only between blocks
// (a single longer block becomes its own part).
export function speechChunks(parts: string[], maxChars = SPEECH_PART_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current && current.length + 2 + part.length > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${part}` : part;
  }
  if (current) chunks.push(current);
  return chunks;
}

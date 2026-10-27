import type { Block } from "@/lib/content/blocks";
import { plainText } from "@/lib/content/inline";
import { characterCount } from "@/lib/text";
import { SPEECH_PART_CHARS } from "./limits";
import type { SpeechPartLimit } from "./services";
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

// `say`: the instruction sentence with its number, already in the language; `tap`: Tap the area; `boxes`: Match
// pictures (the options are then its box labels, read as a list).
export type QuestionInstruction = { say?: string; tap?: boolean; boxes?: boolean };

// A question page: the question, its instruction, then each option with its letter ("Option A. …"); never the
// explanation (shown only after checking) or the picture.
export function questionReadingParts(
  stem: string,
  options: string[],
  language: VoiceLanguage,
  letter: (index: number) => string,
  instruction: QuestionInstruction = {}
): string[] {
  const { question, option } = language.questionLabels;
  return [
    `${sentence(question)}\n${sentence(plainText(stem))}`,
    ...(instruction.say ? [sentence(instruction.say)] : []),
    ...(instruction.tap ? [sentence(language.questionLabels.tapArea)] : []),
    ...(instruction.boxes
      ? [sentence(language.questionLabels.matchBoxes), [sentence(language.questionLabels.boxesAre), ...options.map((text) => sentence(plainText(text)))].join("\n")]
      : options.map((text, index) => `${sentence(`${option} ${letter(index)}`)}\n${sentence(plainText(text))}`)),
  ];
}

// The English instruction with its number: "Choose 2 answers" (Multiple answers) or "Choose one of the 5 outlined
// areas on the picture" (Choose the area); undefined for other types. Other languages translate this sentence.
export function englishInstruction(english: VoiceLanguage, question: { pick?: number; areas?: number }): string | undefined {
  const wording = question.pick ? english.questionLabels.choose : question.areas ? english.questionLabels.chooseArea : undefined;
  const count = question.pick ?? question.areas;
  if (!wording || !count) return undefined;
  return wording.replace("{n}", String(count));
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

// The text sent to the voice service, in parts within its limit (characters, or UTF-8 bytes for Google), split
// between blocks; a block over the limit is split at sentence ends, then between words, then (rarely) anywhere.
export function speechChunks(parts: string[], limit: SpeechPartLimit = { chars: SPEECH_PART_CHARS }): string[] {
  const size = "bytes" in limit ? (text: string) => utf8.encode(text).length : characterCount;
  const max = "bytes" in limit ? limit.bytes : limit.chars;
  const chunks: string[] = [];
  let current = "";
  for (const piece of parts.flatMap((part) => (size(part) > max ? splitLong(part, max, size) : [part]))) {
    const joined = current ? `${current}\n\n${piece}` : piece;
    if (current && size(joined) > max) {
      chunks.push(current);
      current = piece;
    } else current = joined;
  }
  if (current) chunks.push(current);
  return chunks;
}

const utf8 = new TextEncoder();

// One block too long for a request: whole sentences where they fit, then words, then characters.
function splitLong(text: string, max: number, size: (text: string) => number): string[] {
  const pieces: string[] = [];
  let current = "";
  const add = (unit: string, glue: string) => {
    const joined = current ? `${current}${glue}${unit}` : unit;
    if (size(joined) <= max) current = joined;
    else {
      if (current) pieces.push(current);
      current = unit;
    }
  };
  for (const sentence of text.split(/(?<=[.!?।…])\s+|\n+/).filter(Boolean)) {
    if (size(sentence) <= max) add(sentence, " ");
    else
      for (const word of sentence.split(/\s+/).filter(Boolean)) {
        if (size(word) <= max) add(word, " ");
        else for (const char of word) add(char, "");
      }
  }
  if (current) pieces.push(current);
  return pieces;
}

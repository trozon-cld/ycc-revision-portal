import type { ClientQuestion } from "@/lib/questions/public";
import type { Block } from "./blocks";

// One page as authored in the page builder, or one question page. On screen it may take one or
// more book sheets. A question page shows `question` instead of blocks.
export type BookPageData = {
  id: string;
  chapterId: string;
  sectionLabel: string;
  chapterLabel: string;
  blocks: Block[];
  question?: { data: ClientQuestion; label: string };
  // Admin previews only, e.g. "Draft": a small marker in the page corner that doesn't affect layout.
  badge?: string;
};

// Pictures resolved on the server: a short-lived link plus the size stored in Media.
// `thumb` (the small copy) only where asked for, e.g. covers, to show while the full picture loads.
export type ResolvedMedia = Record<string, { src: string; width: number; height: number; alt: string; thumb?: string }>;

export const TEXT_SIZES = [14, 16, 18, 20, 22, 24] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = 16;

// A sheet is one book page on screen: part k of an authored page, a blank filler, a cover, or (spreads
// only) the empty space beside a closed book's cover. Page numbers belong to page sheets, so they change
// with screen and text size (e-reader style).
export type Sheet =
  | { kind: "page"; pageIndex: number; part: number; parts: number; number: number }
  | { kind: "blank" }
  | { kind: "cover"; side: "front" | "back" }
  | { kind: "none" };

// Pure layout rule, kept separate so it can be tested without a browser. With covers, a spread shows the
// front cover alone on the right and the back cover alone on the left, like a closed book.
export function buildSheets(
  pages: Pick<BookPageData, "chapterId">[],
  partCounts: number[],
  spread: boolean,
  covers = false
): Sheet[] {
  const sheets: Sheet[] = [];
  if (covers) {
    if (spread) sheets.push({ kind: "none" });
    sheets.push({ kind: "cover", side: "front" });
  }
  let number = 0; // blank fillers and covers are left unnumbered, as in a printed book
  pages.forEach((page, pageIndex) => {
    const startsChapter = pageIndex === 0 || pages[pageIndex - 1].chapterId !== page.chapterId;
    const parts = Math.max(1, partCounts[pageIndex] ?? 1);
    // In a spread, a chapter always opens on a left-hand sheet.
    if (spread && startsChapter && sheets.length % 2 === 1) sheets.push({ kind: "blank" });
    for (let part = 0; part < parts; part++) sheets.push({ kind: "page", pageIndex, part, parts, number: ++number });
  });
  if (covers) {
    if (spread && sheets.length % 2 === 1) sheets.push({ kind: "blank" });
    sheets.push({ kind: "cover", side: "back" });
    if (spread) sheets.push({ kind: "none" });
  }
  return sheets;
}

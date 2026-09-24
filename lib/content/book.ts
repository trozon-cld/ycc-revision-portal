import type { Block } from "./blocks";

// One page as authored in the page builder. On screen it may take one or more book sheets.
export type BookPageData = {
  id: string;
  chapterId: string;
  sectionLabel: string;
  chapterLabel: string;
  blocks: Block[];
};

// Pictures resolved on the server: a short-lived link plus the size stored in Media.
export type ResolvedMedia = Record<string, { src: string; width: number; height: number; alt: string }>;

export const TEXT_SIZES = [14, 16, 18, 20, 22, 24] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = 16;

// A sheet is one book page on screen: part k of an authored page, or a blank filler.
// Page numbers belong to sheets, so they change with screen and text size (e-reader style).
export type Sheet =
  | { kind: "page"; pageIndex: number; part: number; parts: number; number: number }
  | { kind: "blank" };

// Pure layout rule, kept separate so it can be tested without a browser.
export function buildSheets(pages: Pick<BookPageData, "chapterId">[], partCounts: number[], spread: boolean): Sheet[] {
  const sheets: Sheet[] = [];
  let number = 0; // blank fillers are left unnumbered, as in a printed book
  pages.forEach((page, pageIndex) => {
    const startsChapter = pageIndex === 0 || pages[pageIndex - 1].chapterId !== page.chapterId;
    // In a spread, a chapter always opens on a left-hand sheet.
    if (spread && startsChapter && sheets.length % 2 === 1) sheets.push({ kind: "blank" });
    const parts = Math.max(1, partCounts[pageIndex] ?? 1);
    for (let part = 0; part < parts; part++) sheets.push({ kind: "page", pageIndex, part, parts, number: ++number });
  });
  return sheets;
}

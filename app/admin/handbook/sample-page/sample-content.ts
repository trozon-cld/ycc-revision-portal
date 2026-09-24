import type { BookPageData } from "@/lib/content/book";
import { parseBlocks } from "@/lib/content/blocks";

// Layout-testing text only. It deliberately says nothing about site safety; real content comes from admins.
const FILLER = [
  "This is **placeholder text** used to check how a Handbook page looks. It has no real meaning and will be replaced by content written by an admin.",
  "Paragraphs like this one show the size of the text, the space between lines and how a long passage flows from one page onto the next.",
  "When a page has more content than fits, the rest continues on the next sheet. Pictures and boxes are never cut in half.",
  "Changing the text size with A− and A+ makes every page re-flow, and the page numbers update to match. The reader stays at the same place in the text.",
];

const id = (n: number) => `5a3e0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const SAMPLE_PICTURE_WIDE = "5a3e0000-0000-4000-9000-000000000001";
export const SAMPLE_PICTURE_TALL = "5a3e0000-0000-4000-9000-000000000002";

const raw = [
  {
    chapter: "c1",
    blocks: [
      { type: "heading", level: 1, text: "Sample chapter heading" },
      { type: "paragraph", text: FILLER[0] },
      { type: "heading", level: 2, text: "A smaller subheading" },
      { type: "list", style: "bullet", items: ["First placeholder point", "Second point, with a **bold** word", "Third point"] },
      { type: "callout", tone: "key-point", text: "A **Key point** box highlights one important idea on the page." },
      { type: "paragraph", text: FILLER[1] },
    ],
  },
  {
    chapter: "c1",
    blocks: [
      { type: "heading", level: 2, text: "A long page that continues" },
      ...FILLER.map((text) => ({ type: "paragraph", text })),
      { type: "picture", mediaId: SAMPLE_PICTURE_WIDE, caption: "A caption sits under its picture." },
      ...FILLER.slice(1).map((text) => ({ type: "paragraph", text })),
      { type: "list", style: "numbered", items: ["Numbered step one", "Numbered step two", "Numbered step three"] },
      { type: "callout", tone: "remember", text: "A **Remember** box is for something worth keeping in mind." },
      ...FILLER.map((text) => ({ type: "paragraph", text })),
    ],
  },
  {
    chapter: "c1",
    blocks: [
      { type: "heading", level: 2, text: "A short page" },
      { type: "paragraph", text: FILLER[2] },
    ],
  },
  {
    chapter: "c2",
    blocks: [
      { type: "heading", level: 1, text: "The next chapter starts on a fresh spread" },
      { type: "paragraph", text: FILLER[3] },
      { type: "picture", mediaId: SAMPLE_PICTURE_TALL, caption: "Pictures take at most about 60% of a page, so text fits on the same page." },
      { type: "paragraph", text: FILLER[0] },
    ],
  },
];

const CHAPTERS: Record<string, { section: string; chapter: string }> = {
  c1: { section: "A · Sample section", chapter: "01 Sample chapter" },
  c2: { section: "A · Sample section", chapter: "02 Another sample chapter" },
};

let blockCounter = 0;
export const SAMPLE_PAGES: BookPageData[] = raw.map((page, index) => {
  const parsed = parseBlocks(page.blocks.map((block) => ({ ...block, id: id(++blockCounter) })));
  if (!parsed.ok) throw new Error(`Sample page ${index + 1} is invalid: ${parsed.error}`);
  return {
    id: `sample-page-${index + 1}`,
    chapterId: page.chapter,
    sectionLabel: CHAPTERS[page.chapter].section,
    chapterLabel: CHAPTERS[page.chapter].chapter,
    blocks: parsed.blocks,
  };
});

// Stand-in pictures (inline SVG) for when the Media library is empty or storage isn't set up.
export function placeholderPicture(width: number, height: number, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e6f0f7"/><rect x="4%" y="4%" width="92%" height="92%" fill="none" stroke="#005da1" stroke-width="${Math.round(width / 120)}" stroke-dasharray="${Math.round(width / 40)} ${Math.round(width / 60)}"/><text x="50%" y="50%" font-family="sans-serif" font-size="${Math.round(width / 14)}" fill="#005da1" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

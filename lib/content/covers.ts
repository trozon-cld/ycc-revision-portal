import type { ResolvedMedia } from "./book";

// A category's Handbook covers as the reader draws them. With no picture, a standard brand cover shows.
export type BookCovers = {
  categoryName: string;
  front: ResolvedMedia[string] | null;
  back: ResolvedMedia[string] | null;
  // Candidates only: the back cover's "Back to home" link.
  homeHref?: string;
};

// Book-shaped (3:4 portrait) pictures fill the page best; others still show whole, with blurred edges.
export const COVER_MIN_WIDTH = 1200;
export const COVER_MIN_HEIGHT = 1600;
const COVER_MAX_RATIO = 0.8;

export function coverAdvice(width: number, height: number): string[] {
  const advice: string[] = [];
  if (width / height > COVER_MAX_RATIO) {
    advice.push(
      width > height
        ? "This picture is wide, not portrait. It will show smaller, with blurred edges above and below it."
        : "This picture is wider than a book page. It will show with blurred edges above and below it."
    );
  }
  if (width < COVER_MIN_WIDTH || height < COVER_MIN_HEIGHT) {
    advice.push(`This picture is smaller than ${COVER_MIN_WIDTH} × ${COVER_MIN_HEIGHT} pixels, so it may look soft on large screens.`);
  }
  return advice;
}

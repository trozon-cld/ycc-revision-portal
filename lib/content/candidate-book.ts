import { pool } from "@/lib/db/pool";
import { toTextSize, type BookPageData, type ResolvedMedia, type TextSize } from "./book";
import type { BookCovers } from "./covers";
import { loadPreviewBook } from "./preview";

export type CandidateBook = {
  categoryName: string;
  pages: BookPageData[];
  media: ResolvedMedia;
  startPageId: string | null;
  textSize: TextSize;
  covers: BookCovers;
};

// The candidate's current category as they see it (published items in published chapters): one query for
// the candidate, their place and the covers, then all pictures signed together.
export async function loadCandidateBook(userId: string): Promise<CandidateBook | null> {
  const { rows } = await pool.query<{
    category_id: string;
    category_name: string;
    front_id: string | null;
    back_id: string | null;
    reader_text_size: number | null;
    item_id: string | null;
  }>(
    `select c.id as category_id, c.name as category_name, c.front_cover_media_id as front_id,
            c.back_cover_media_id as back_id, u.reader_text_size, hp.item_id
     from users u
     join categories c on c.id = u.current_category_id
     left join handbook_progress hp on hp.user_id = u.id and hp.category_id = u.current_category_id
     where u.id = $1 and u.role = 'candidate'`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  const coverIds = [row.front_id, row.back_id].filter((id): id is string => Boolean(id));
  const book = await loadPreviewBook(
    { chapterId: null, categoryId: row.category_id, includeDrafts: false },
    { ids: coverIds, thumbIds: coverIds }
  );
  return {
    categoryName: row.category_name,
    pages: book.pages,
    media: book.media,
    startPageId: row.item_id && book.pages.some((page) => page.id === row.item_id) ? row.item_id : null,
    textSize: toTextSize(row.reader_text_size),
    covers: {
      categoryName: row.category_name,
      front: row.front_id ? (book.media[row.front_id] ?? null) : null,
      back: row.back_id ? (book.media[row.back_id] ?? null) : null,
      homeHref: "/dashboard",
    },
  };
}

// The front cover, fetched early only when the book opens on it (returning candidates open at their page):
// the small copy first, the full one at low priority so it doesn't hold up the reader.
export function coverPreloads(book: CandidateBook): { href: string; priority: "high" | "low" }[] {
  const front = book.covers.front;
  if (book.startPageId || !front) return [];
  return front.thumb
    ? [
        { href: front.thumb, priority: "high" },
        { href: front.src, priority: "low" },
      ]
    : [{ href: front.src, priority: "high" }];
}

// The candidate's A−/A+ choice, shared by the Handbook and Practice.
export async function loadReaderTextSize(userId: string): Promise<TextSize> {
  const { rows } = await pool.query<{ reader_text_size: number | null }>(`select reader_text_size from users where id = $1`, [userId]);
  return toTextSize(rows[0]?.reader_text_size);
}

import { pool } from "@/lib/db/pool";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES, type BookPageData, type ResolvedMedia, type TextSize } from "./book";
import { loadPreviewBook } from "./preview";

export type CandidateBook = {
  categoryName: string;
  pages: BookPageData[];
  media: ResolvedMedia;
  startPageId: string | null;
  textSize: TextSize;
};

// The candidate's current category, as candidates see it: published items in published chapters only.
export async function loadCandidateBook(userId: string): Promise<CandidateBook | null> {
  const { rows } = await pool.query<{
    category_id: string;
    category_name: string;
    reader_text_size: number | null;
    item_id: string | null;
  }>(
    `select c.id as category_id, c.name as category_name, u.reader_text_size, hp.item_id
     from users u
     join categories c on c.id = u.current_category_id
     left join handbook_progress hp on hp.user_id = u.id and hp.category_id = u.current_category_id
     where u.id = $1 and u.role = 'candidate'`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  const book = await loadPreviewBook({ chapterId: null, categoryId: row.category_id, includeDrafts: false });
  const size = TEXT_SIZES.find((value) => value === row.reader_text_size) ?? DEFAULT_TEXT_SIZE;
  return {
    categoryName: row.category_name,
    pages: book.pages,
    media: book.media,
    startPageId: row.item_id && book.pages.some((page) => page.id === row.item_id) ? row.item_id : null,
    textSize: size,
  };
}

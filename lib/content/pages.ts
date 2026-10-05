import { pool } from "@/lib/db/pool";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import { isUuid } from "@/lib/ids";
import type { ResolvedMedia } from "./book";

// Server-only reads for Handbook pages and their pictures (admin and candidate pages).

export const PREVIEW_LINK_SECONDS = 2 * 60 * 60;

export type ChapterContext = {
  id: string;
  title: string;
  number: string;
  sectionLabel: string;
  chapterLabel: string;
};

export async function getChapterContext(chapterId: string): Promise<ChapterContext | null> {
  if (!isUuid(chapterId)) return null;
  const { rows } = await pool.query<{ id: string; title: string; number: number; section_position: number; section_title: string }>(
    `select * from (
       select c.id, c.title, s.position as section_position, s.title as section_title,
              (row_number() over (order by s.position, c.position))::int as number
       from chapters c join sections s on s.id = c.section_id
     ) ranked
     where id = $1`,
    [chapterId]
  );
  const row = rows[0];
  if (!row) return null;
  const number = chapterNumber(row.number);
  return {
    id: row.id,
    title: row.title,
    number,
    sectionLabel: `${sectionLetter(row.section_position)} · ${row.section_title}`,
    chapterLabel: `${number} ${row.title}`,
  };
}

// Full-size pictures for the reader, keyed by media id; `thumbIds` also get their small copy.
// Everything is signed in one storage request.
export async function resolveMedia(mediaIds: string[], thumbIds: string[] = []): Promise<ResolvedMedia> {
  const ids = [...new Set([...mediaIds, ...thumbIds])].filter(isUuid);
  if (ids.length === 0) return {};
  const { rows } = await pool.query<{ id: string; storage_path: string; thumb_path: string; width: number; height: number; alt_text: string }>(
    `select id, storage_path, thumb_path, width, height, alt_text from media where id = any($1::uuid[])`,
    [ids]
  );
  if (!isStorageConfigured() || rows.length === 0) return {};
  const withThumb = new Set(thumbIds);
  const urls = await getSignedUrls(
    [...rows.map((row) => row.storage_path), ...rows.filter((row) => withThumb.has(row.id)).map((row) => row.thumb_path)],
    PREVIEW_LINK_SECONDS
  );
  const media: ResolvedMedia = {};
  for (const row of rows) {
    const src = urls.get(row.storage_path);
    const thumb = withThumb.has(row.id) ? urls.get(row.thumb_path) : undefined;
    if (src) media[row.id] = { src, width: row.width, height: row.height, alt: row.alt_text, ...(thumb ? { thumb } : {}) };
  }
  return media;
}

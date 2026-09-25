import { pool } from "@/lib/db/pool";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import type { ResolvedMedia } from "./book";

// Server-only reads for the Handbook admin pages.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PREVIEW_LINK_SECONDS = 2 * 60 * 60;

export function isUuid(value: string) {
  return UUID.test(value);
}

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

// Full-size pictures for the reader preview, keyed by media id.
export async function resolveMedia(mediaIds: string[]): Promise<ResolvedMedia> {
  const ids = mediaIds.filter(isUuid);
  if (ids.length === 0) return {};
  const { rows } = await pool.query<{ id: string; storage_path: string; width: number; height: number; alt_text: string }>(
    `select id, storage_path, width, height, alt_text from media where id = any($1::uuid[])`,
    [ids]
  );
  if (!isStorageConfigured() || rows.length === 0) return {};
  const urls = await getSignedUrls(
    rows.map((row) => row.storage_path),
    PREVIEW_LINK_SECONDS
  );
  const media: ResolvedMedia = {};
  for (const row of rows) {
    const src = urls.get(row.storage_path);
    if (src) media[row.id] = { src, width: row.width, height: row.height, alt: row.alt_text };
  }
  return media;
}

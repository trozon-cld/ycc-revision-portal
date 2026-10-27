import { pool } from "@/lib/db/pool";
import { chapterLabel, numberedChapters, sectionLetter } from "@/lib/handbook/structure";
import { questionRef } from "@/lib/questions/labels";
import { toClientQuestion } from "@/lib/questions/public";
import { parseQuestion } from "@/lib/questions/validate";
import type { QuestionType, StemPictureAlign, StemPictureSize } from "@/lib/questions/types";
import { isUuid } from "@/lib/ids";
import { collectMediaIds, parseBlocks } from "./blocks";
import type { BookPageData, ResolvedMedia } from "./book";
import type { BookCovers } from "./covers";
import { resolveMedia } from "./pages";

// The book as the reader shows it, for the admin preview: every chapter or one, in Handbook order;
// optionally only a test type's chapters (numbered in that book, as candidates see it), and only what candidates see.

export type PreviewScope = { chapterId: string | null; testTypeId: string | null; includeDrafts: boolean };
export type PreviewBook = {
  pages: BookPageData[];
  media: ResolvedMedia;
  chapterCount: number;
  drafts: number;
  // Items left out because they don't pass today's checks (e.g. a half-written draft question).
  leftOut: string[];
};

type Row = {
  chapter_id: string;
  chapter_title: string;
  chapter_number: number | null;
  section_position: number;
  section_title: string;
  item_id: string;
  page_title: string | null;
  page_status: "draft" | "published" | null;
  blocks: unknown;
  question_id: string | null;
  ref_no: number | null;
  question_status: "draft" | "published" | null;
  type: QuestionType | null;
  stem_text: string | null;
  stem_media_id: string | null;
  stem_media_size: StemPictureSize | null;
  stem_media_align: StemPictureAlign | null;
  content: unknown;
  answer: unknown;
  explanation: string | null;
};

// `extraMedia`: more pictures (e.g. covers, with their small copies) signed in the same request.
export async function loadPreviewBook(
  scope: PreviewScope,
  extraMedia: { ids: string[]; thumbIds: string[] } = { ids: [], thumbIds: [] }
): Promise<PreviewBook> {
  const chapterId = scope.chapterId && isUuid(scope.chapterId) ? scope.chapterId : null;
  const testTypeId = scope.testTypeId && isUuid(scope.testTypeId) ? scope.testTypeId : null;
  const { rows } = await pool.query<Row>(
    `with ${numberedChapters(testTypeId ? "$2" : undefined)}
     select n.id as chapter_id, n.title as chapter_title, n.number as chapter_number,
            n.section_position, n.section_title,
            i.id as item_id,
            p.title as page_title, p.status as page_status, p.blocks,
            q.id as question_id, q.ref_no, q.status as question_status, q.type, q.stem_text,
            q.stem_media_id, q.stem_media_size, q.stem_media_align, q.content, q.answer, q.explanation
     from numbered n
     join handbook_items i on i.chapter_id = n.id
     left join content_pages p on p.id = i.content_page_id
     left join questions q on q.id = i.question_id
     where ($1::uuid is null or n.id = $1)
       and ($2::uuid is null or exists (select 1 from test_type_chapters cc where cc.test_type_id = $2 and cc.chapter_id = n.id))
       and ($3 or (n.status = 'published' and coalesce(p.status, q.status) = 'published'))
     order by n.place, i.position`,
    [chapterId, testTypeId, scope.includeDrafts]
  );

  const pages: BookPageData[] = [];
  const mediaIds = new Set<string>();
  const leftOut: string[] = [];
  let drafts = 0;
  for (const row of rows) {
    const base = {
      id: row.item_id,
      chapterId: row.chapter_id,
      sectionLabel: `${sectionLetter(row.section_position)} · ${row.section_title}`,
      chapterLabel: chapterLabel({ number: row.chapter_number, title: row.chapter_title }),
    };
    const status = row.page_status ?? row.question_status;
    const badge = status === "draft" ? { badge: "Draft" } : {};

    if (row.question_id) {
      const parsed = parseQuestion({
        type: row.type,
        stemText: row.stem_text,
        stemMediaId: row.stem_media_id,
        stemMediaSize: row.stem_media_size,
        stemMediaAlign: row.stem_media_align,
        content: row.content,
        answer: row.answer,
        explanation: row.explanation,
      });
      if (!parsed.ok) {
        leftOut.push(`${questionRef(row.ref_no ?? 0)} (${parsed.error})`);
        continue;
      }
      parsed.question.mediaIds.forEach((id) => mediaIds.add(id));
      pages.push({ ...base, blocks: [], question: { data: toClientQuestion({ ...parsed.question, id: row.question_id }, "learn"), label: "Question" }, ...badge });
    } else {
      const parsed = parseBlocks(row.blocks);
      if (!parsed.ok) {
        leftOut.push(`"${row.page_title}" (${parsed.error})`);
        continue;
      }
      collectMediaIds(parsed.blocks).forEach((id) => mediaIds.add(id));
      pages.push({ ...base, blocks: parsed.blocks, ...badge });
    }
    if (status === "draft") drafts += 1;
  }

  return {
    pages,
    media: await resolveMedia([...mediaIds, ...extraMedia.ids], extraMedia.thumbIds),
    chapterCount: new Set(pages.map((page) => page.chapterId)).size,
    drafts,
    leftOut,
  };
}

// A test type's covers with their pictures resolved; null when the test type doesn't exist.
export async function loadBookCovers(testTypeId: string): Promise<BookCovers | null> {
  if (!isUuid(testTypeId)) return null;
  const { rows } = await pool.query<{ name: string; front_id: string | null; back_id: string | null }>(
    `select name, front_cover_media_id as front_id, back_cover_media_id as back_id from test_types where id = $1`,
    [testTypeId]
  );
  const row = rows[0];
  if (!row) return null;
  const ids = [row.front_id, row.back_id].filter((id): id is string => Boolean(id));
  const media = ids.length > 0 ? await resolveMedia(ids, ids) : {};
  return {
    testTypeName: row.name,
    front: row.front_id ? (media[row.front_id] ?? null) : null,
    back: row.back_id ? (media[row.back_id] ?? null) : null,
  };
}

export type PreviewOptions = {
  chapters: { id: string; label: string; sectionLabel: string }[];
  testTypes: { id: string; label: string }[];
};

export async function loadPreviewOptions(): Promise<PreviewOptions> {
  const [{ rows: chapters }, { rows: testTypes }] = await Promise.all([
    pool.query<{ id: string; title: string; number: number; section_position: number; section_title: string }>(
      `with ${numberedChapters()} select id, title, number, section_position, section_title from numbered order by place`
    ),
    pool.query<{ id: string; name: string; test_area_name: string }>(
      `select c.id, c.name, g.name as test_area_name
       from test_types c join test_areas g on g.id = c.test_area_id
       order by g.position, c.name`
    ),
  ]);
  return {
    chapters: chapters.map((row) => ({
      id: row.id,
      label: chapterLabel(row),
      sectionLabel: `${sectionLetter(row.section_position)} · ${row.section_title}`,
    })),
    testTypes: testTypes.map((row) => ({ id: row.id, label: `${row.name} (${row.test_area_name})` })),
  };
}

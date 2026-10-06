import { pool } from "@/lib/db/pool";
import { loadMockHistory } from "@/lib/mock/attempts";
import { isWeakArea } from "@/lib/practice/pick";
import { STRONG_FROM, WEAK_BELOW, WEAK_MIN_ANSWERED } from "@/lib/practice/types";
import { NUMBERED, chapterLabel, currentCategory, loadPool } from "@/lib/questions/pool";
import type { MockHistory } from "@/lib/mock/types";

// My progress: the candidate's current category across the Handbook, Practice and mock tests. Read only.

export type HandbookChapter = { id: string; label: string; done: number; total: number };
export type PracticeChapter = { id: string; label: string; answered: number; tries: number; right: number; pool: number; area: "weak" | "strong" | null };

export type ProgressOverview = {
  categoryName: string;
  handbook: { done: number; total: number; chapters: HandbookChapter[] };
  practice: { pool: number; practised: number; tries: number; right: number; flagged: number; chapters: PracticeChapter[] };
  mock: MockHistory;
};

const RECENT_MOCKS = 5;

export async function loadProgress(userId: string): Promise<ProgressOverview | null> {
  const category = await currentCategory(pool, userId);
  if (!category) return null;

  // Handbook: the items of this category's published book, and which of them are done.
  const handbook = pool.query<{ chapter_id: string; total: number; done: number }>(
    `with items as (
       select i.id, i.chapter_id from handbook_items i
       join chapters ch on ch.id = i.chapter_id and ch.status = 'published'
       join category_chapters cc on cc.chapter_id = ch.id and cc.category_id = $2
       left join content_pages p on p.id = i.content_page_id
       left join questions q on q.id = i.question_id
       where coalesce(p.status, q.status) = 'published'
     )
     select it.chapter_id, count(*)::int as total, count(*) filter (where it.id = any(hp.done_items))::int as done
     from items it
     left join handbook_chapter_progress hp on hp.user_id = $1 and hp.category_id = $2 and hp.chapter_id = it.chapter_id
     group by it.chapter_id`,
    [userId, category.id]
  );
  const questions = await loadPool(pool, "practice", category.id);
  const ids = questions.map((question) => question.id);
  const [book, practised, flagged, mock] = await Promise.all([
    handbook,
    pool.query<{ chapter_id: string; answered: number; tries: number; right: number }>(
      `select q.chapter_id, count(*)::int as answered, sum(r.practice_tries)::int as tries, sum(r.practice_right)::int as right
       from question_results r join questions q on q.id = r.question_id
       where r.user_id = $1 and r.category_id = $2 and r.practice_tries > 0 and r.question_id = any($3::uuid[])
       group by q.chapter_id`,
      [userId, category.id, ids]
    ),
    pool.query<{ count: number }>(
      `select count(*)::int as count from question_flags where user_id = $1 and category_id = $2 and question_id = any($3::uuid[])`,
      [userId, category.id, ids]
    ),
    loadMockHistory(userId, RECENT_MOCKS),
  ]);

  const chapterIds = [...new Set([...book.rows.map((row) => row.chapter_id), ...questions.map((question) => question.chapterId)])];
  const { rows: chapters } = await pool.query<{ id: string; title: string; number: number }>(
    `with ${NUMBERED} select id, title, number from numbered where id = any($1::uuid[]) order by number`,
    [chapterIds]
  );
  const bookBy = new Map(book.rows.map((row) => [row.chapter_id, row]));
  const practiceBy = new Map(practised.rows.map((row) => [row.chapter_id, row]));
  const poolBy = new Map<string, number>();
  questions.forEach((question) => poolBy.set(question.chapterId, (poolBy.get(question.chapterId) ?? 0) + 1));

  const handbookChapters: HandbookChapter[] = chapters
    .filter((chapter) => bookBy.has(chapter.id))
    .map((chapter) => ({ id: chapter.id, label: chapterLabel(chapter), done: bookBy.get(chapter.id)!.done, total: bookBy.get(chapter.id)!.total }));
  const practiceChapters: PracticeChapter[] = chapters
    .filter((chapter) => poolBy.has(chapter.id))
    .map((chapter) => {
      const totals = practiceBy.get(chapter.id) ?? { answered: 0, tries: 0, right: 0 };
      const enough = totals.answered >= WEAK_MIN_ANSWERED;
      const area = isWeakArea(totals, WEAK_MIN_ANSWERED, WEAK_BELOW) ? "weak" : enough && totals.right / totals.tries >= STRONG_FROM ? "strong" : null;
      return { id: chapter.id, label: chapterLabel(chapter), answered: totals.answered, tries: totals.tries, right: totals.right, pool: poolBy.get(chapter.id)!, area };
    });

  const sum = <T,>(list: T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);
  return {
    categoryName: category.name,
    handbook: { done: sum(handbookChapters, (c) => c.done), total: sum(handbookChapters, (c) => c.total), chapters: handbookChapters },
    practice: {
      pool: questions.length,
      practised: sum(practiceChapters, (c) => c.answered),
      tries: sum(practiceChapters, (c) => c.tries),
      right: sum(practiceChapters, (c) => c.right),
      flagged: flagged.rows[0].count,
      chapters: practiceChapters,
    },
    mock,
  };
}

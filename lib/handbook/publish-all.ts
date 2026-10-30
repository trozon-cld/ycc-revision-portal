import type { Pool, PoolClient } from "pg";
import { parseBlocks } from "@/lib/content/blocks";
import { needsAreas } from "@/lib/questions/areas";
import { questionRef } from "@/lib/questions/labels";
import { readChapterDraftQuestions } from "@/lib/questions/queries";
import { parseQuestion } from "@/lib/questions/validate";

// "Publish all" on a chapter: every draft page and question that passes the single Publish checks.
// The chapter's questions outside its page order count too, since Practice and the Mock test use them.

export type HeldBack = { label: string; reason: string };
export type ChapterPublishPlan = {
  pageIds: string[];
  questionIds: string[];
  questionRefNos: number[];
  heldBack: HeldBack[];
};

export async function planChapterPublish(db: Pool | PoolClient, chapterId: string, lock: boolean): Promise<ChapterPublishPlan> {
  const { rows: pages } = await db.query<{ id: string; title: string; blocks: unknown }>(
    `select p.id, p.title, p.blocks
     from handbook_items i join content_pages p on p.id = i.content_page_id
     where i.chapter_id = $1 and p.status = 'draft'
     order by i.position${lock ? " for update of p" : ""}`,
    [chapterId]
  );
  const questions = await readChapterDraftQuestions(db, chapterId, lock);

  const plan: ChapterPublishPlan = { pageIds: [], questionIds: [], questionRefNos: [], heldBack: [] };
  for (const page of pages) {
    const parsed = parseBlocks(page.blocks);
    const reason = !parsed.ok ? parsed.error : parsed.blocks.length === 0 ? "it's empty" : null;
    if (reason) plan.heldBack.push({ label: `"${page.title}"`, reason });
    else plan.pageIds.push(page.id);
  }
  for (const question of questions) {
    const ref = questionRef(question.refNo);
    if (needsAreas(question)) {
      plan.heldBack.push({ label: ref, reason: "mark the areas" });
      continue;
    }
    const parsed = parseQuestion(question);
    if (!parsed.ok) plan.heldBack.push({ label: ref, reason: parsed.error });
    else {
      plan.questionIds.push(question.id);
      plan.questionRefNos.push(question.refNo);
    }
  }
  return plan;
}

// "Q0093 (mark the areas), Q0098 (mark the areas) and 3 more": a short list for messages.
export function describeHeldBack(heldBack: HeldBack[], shown = 5): string {
  const names = heldBack.slice(0, shown).map((item) => `${item.label} (${item.reason.replace(/\.$/, "")})`);
  return names.join(", ") + (heldBack.length > shown ? ` and ${heldBack.length - shown} more` : "");
}

// Q numbers as runs for the activity log: [29, 30, 31, 35] → "Q0029–Q0031, Q0035".
export function refRuns(refNos: number[]): string {
  const sorted = [...refNos].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j > i ? `${questionRef(sorted[i])}–${questionRef(sorted[j])}` : questionRef(sorted[i]));
    i = j;
  }
  return runs.join(", ");
}

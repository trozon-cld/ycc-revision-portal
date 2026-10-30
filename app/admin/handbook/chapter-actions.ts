"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { listNames } from "@/lib/handbook/test-types";
import { questionRef } from "@/lib/questions/labels";
import { isUuid } from "@/lib/ids";
import { describeHeldBack, planChapterPublish, refRuns } from "@/lib/handbook/publish-all";
import { structureLockedError } from "@/lib/handbook/structure-lock";
import { EVERY_TEST_TYPE, everyTestTypeOnly, linkToEveryTestType, oneTestTypeOnly, sectionLinking } from "@/lib/handbook/sharing";
import {
  lockHandbookStructure,
  normaliseTitle,
  validateTitle,
  type StructureActionState,
} from "@/lib/handbook/structure";

const DUPLICATE_TITLE = "A chapter with this title already exists.";
const NOT_FOUND = "This chapter no longer exists.";
const SECTION_NOT_FOUND = "The chosen section no longer exists.";
const PAGE_PATH = "/admin/handbook";
const TEST_TYPES_CHANGED = "The list of test types has changed. Close this panel and open it again.";
const MAX_TEST_TYPES = 500;

export async function createChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const sectionId = String(formData.get("sectionId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const testTypeIds = testTypeIdsFrom(formData);
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };
  if (!sectionId) return { error: "Choose a section." };
  if (testTypeIds.length > MAX_TEST_TYPES) return { error: "Too many test types selected." };

  let result: StructureActionState;
  let chapterId = "";
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      await lockHandbookStructure(client);
      const section = isUuid(sectionId) ? await sectionLinking(client, sectionId) : null;
      if (!section) return { error: SECTION_NOT_FOUND };
      if (await titleTaken(client, title, null)) return { error: DUPLICATE_TITLE };
      // A section linked to every test type ignores the choice; any other takes one test type at most.
      const chosen = section.linkedToAll ? [] : testTypeIds;
      if (chosen.length > 1) return { error: oneTestTypeOnly(section.label) };
      const testTypes = await lockTestTypes(client, chosen);
      if (!testTypes) return { error: TEST_TYPES_CHANGED };

      const { rows: created } = await client.query<{ id: string }>(
        `insert into chapters (section_id, position, title)
         select $1, coalesce(max(position), 0) + 1, $2 from chapters where section_id = $1
         returning id`,
        [sectionId, title]
      );
      if (section.linkedToAll) await linkToEveryTestType(client, created[0].id);
      else {
        await client.query(
          `insert into test_type_chapters (test_type_id, chapter_id) select unnest($1::uuid[]), $2::uuid`,
          [chosen, created[0].id]
        );
      }
      await logActivity(
        client,
        session,
        "chapter.created",
        { type: "chapter", id: created[0].id, label: title },
        {
          section: section.title,
          ...(section.linkedToAll
            ? { testTypes: EVERY_TEST_TYPE }
            : chosen.length > 0
              ? { testTypes: listNames(chosen.map((id) => testTypes.get(id) ?? "")) }
              : {}),
        }
      );
      chapterId = created[0].id;
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: SECTION_NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/admin/test-types");
  // The next step is adding pages, so open the new chapter.
  if (result.success) redirect(`/admin/handbook/chapters/${chapterId}`);
  return result;
}

// Replaces the whole list of test types that include this chapter (the Test types page edits the same links).
export async function saveChapterTestTypes(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const chapterId = String(formData.get("chapterId") ?? "");
  const testTypeIds = testTypeIdsFrom(formData);
  if (testTypeIds.length > MAX_TEST_TYPES) return { error: "Too many test types selected." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      // Structure, test types, then the chapter: the same order as a save from the Test types page.
      await lockHandbookStructure(client);
      const testTypes = await lockTestTypes(client, testTypeIds);
      if (!testTypes) return { error: TEST_TYPES_CHANGED };
      if (!isUuid(chapterId)) return { error: NOT_FOUND };
      const { rows } = await client.query<{ title: string; section_id: string }>(
        `select title, section_id from chapters where id = $1 for update`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      const section = await sectionLinking(client, rows[0].section_id);
      if (section?.linkedToAll) return { error: everyTestTypeOnly(section.label) };
      if (section && testTypeIds.length > 1) return { error: oneTestTypeOnly(section.label) };

      const { rows: removed } = await client.query<{ test_type_id: string; name: string }>(
        `delete from test_type_chapters cc using test_types c
         where cc.chapter_id = $1 and c.id = cc.test_type_id
         returning cc.test_type_id, c.name`,
        [chapterId]
      );
      await client.query(
        `insert into test_type_chapters (test_type_id, chapter_id) select unnest($1::uuid[]), $2::uuid`,
        [testTypeIds, chapterId]
      );

      const before = new Set(removed.map((row) => row.test_type_id));
      const added = testTypeIds.filter((id) => !before.has(id)).map((id) => testTypes.get(id) ?? "");
      const dropped = removed.filter((row) => !testTypeIds.includes(row.test_type_id)).map((row) => row.name);
      if (added.length > 0 || dropped.length > 0) {
        await logActivity(
          client,
          session,
          "chapter.test_types_changed",
          { type: "chapter", id: chapterId, label: rows[0].title },
          {
            ...(added.length > 0 ? { addedTestTypes: listNames(added.sort()) } : {}),
            ...(dropped.length > 0 ? { removedTestTypes: listNames(dropped.sort()) } : {}),
            testTypeTotal: String(testTypeIds.length),
          }
        );
      }
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") return { error: TEST_TYPES_CHANGED };
    throw error;
  }

  revalidatePath(PAGE_PATH, "layout");
  revalidatePath("/admin/test-types");
  return result;
}

export async function renameChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const chapterId = String(formData.get("chapterId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      const { rows } = await client.query<{ title: string }>(
        `select title from chapters where id = $1 for update`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].title === title) return { success: true };
      if (await titleTaken(client, title, chapterId)) return { error: DUPLICATE_TITLE };

      await client.query(`update chapters set title = $2, updated_at = now() where id = $1`, [chapterId, title]);
      await logActivity(
        client,
        session,
        "chapter.renamed",
        { type: "chapter", id: chapterId, label: title },
        { from: rows[0].title, to: title }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

// Moves within the chapter's own section; "Move to section" crosses sections.
export async function moveChapter(id: string, direction: "up" | "down"): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const chapterId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const { section_id: sectionId, position: from } = rows[0];
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from chapters where section_id = $1 and position = $2`,
        [sectionId, to]
      );
      if (!neighbours[0]) {
        return {
          error:
            direction === "up"
              ? "This chapter is already first in its section."
              : "This chapter is already last in its section.",
        };
      }

      await client.query(
        `update chapters
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [chapterId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "chapter.reordered",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { from: `Position ${from}`, to: `Position ${to}` }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function moveChapterToSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const chapterId = String(formData.get("chapterId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!sectionId) return { error: "Choose a section." };
  if (!isUuid(sectionId)) return { error: SECTION_NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].section_id === sectionId) return { success: true };
      const newSection = await sectionLinking(client, sectionId);
      if (!newSection) return { error: SECTION_NOT_FOUND };
      const oldSection = await sectionLinking(client, rows[0].section_id);

      await client.query(
        `update chapters
         set section_id = $2,
             position = (select coalesce(max(position), 0) + 1 from chapters where section_id = $2),
             updated_at = now()
         where id = $1`,
        [chapterId, sectionId]
      );
      await closeGap(client, rows[0].section_id, rows[0].position);
      // Into a section linked to every test type: in every book. Out of one into another kind: in none.
      let testTypes: string | null = null;
      if (newSection.linkedToAll) {
        await linkToEveryTestType(client, chapterId);
        testTypes = EVERY_TEST_TYPE;
      } else if (oldSection?.linkedToAll) {
        await client.query(`delete from test_type_chapters where chapter_id = $1`, [chapterId]);
        testTypes = "None (choose one with Test types)";
      }
      await logActivity(
        client,
        session,
        "chapter.section_changed",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { from: oldSection?.title ?? "", to: newSection.title, ...(testTypes ? { testTypes } : {}) }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function deleteChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const chapterId = String(formData.get("chapterId") ?? "");
  if (!chapterId) return { error: NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `delete from chapters where id = $1 returning section_id, position, title`,
        [chapterId]
      );
      if (!rows[0]) return { error: "This chapter has already been deleted." };

      await closeGap(client, rows[0].section_id, rows[0].position);
      await logActivity(
        client,
        session,
        "chapter.deleted",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { section: (await sectionTitleOf(client, rows[0].section_id)) ?? "" }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") {
      return { error: "This chapter still has pages or questions. Remove them before deleting it." };
    }
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

// Publish: the chapter needs at least one item, and every item must be published. Unpublish: unless the structure is locked.
// Later edits don't unpublish it; candidates only ever see published items in published chapters.
export async function setChapterStatus(id: string, status: "draft" | "published"): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const chapterId = String(id ?? "");
  if (!isUuid(chapterId) || (status !== "draft" && status !== "published")) return { error: NOT_FOUND };

  const result = await withTransaction<StructureActionState>(async (client) => {
    // Unpublishing takes a chapter out of candidates' books, so it waits for an unlock; publishing doesn't.
    if (status === "draft") {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
    }
    const { rows } = await client.query<{ title: string; status: string }>(
      `select title, status from chapters where id = $1 for update`,
      [chapterId]
    );
    const chapter = rows[0];
    if (!chapter) return { error: NOT_FOUND };
    if (chapter.status === status) return { success: true };

    let itemCount = 0;
    if (status === "published") {
      // Holds the page order still while the items are checked.
      await client.query(`lock table handbook_items in share mode`);
      const { rows: items } = await client.query<{ status: string; title: string | null; ref_no: number | null }>(
        `select coalesce(p.status, q.status)::text as status, p.title, q.ref_no
         from handbook_items i
         left join content_pages p on p.id = i.content_page_id
         left join questions q on q.id = i.question_id
         where i.chapter_id = $1
         order by i.position`,
        [chapterId]
      );
      if (items.length === 0) return { error: "This chapter can't be published yet. Add at least one page or question first." };
      const drafts = items.filter((item) => item.status !== "published");
      if (drafts.length > 0) {
        const names = drafts.map((item) => (item.ref_no !== null ? questionRef(item.ref_no) : `"${item.title}"`));
        const shown = names.slice(0, 5).join(", ") + (names.length > 5 ? ` and ${names.length - 5} more` : "");
        return {
          error: `This chapter can't be published yet. ${drafts.length === 1 ? "1 item is" : `${drafts.length} items are`} still ${drafts.length === 1 ? "a draft" : "drafts"}: ${shown}.`,
        };
      }
      itemCount = items.length;
    }

    await client.query(`update chapters set status = $2, updated_at = now() where id = $1`, [chapterId, status]);
    await logActivity(
      client,
      session,
      status === "published" ? "chapter.published" : "chapter.unpublished",
      { type: "chapter", id: chapterId, label: chapter.title },
      status === "published" ? { items: `${itemCount} ${itemCount === 1 ? "item" : "items"}` } : {}
    );
    return { success: true };
  });

  revalidatePath(PAGE_PATH, "layout");
  return result;
}

export async function publishChapterForm(_prev: StructureActionState, formData: FormData): Promise<StructureActionState> {
  return setChapterStatus(String(formData.get("chapterId") ?? ""), "published");
}

export async function unpublishChapterForm(_prev: StructureActionState, formData: FormData): Promise<StructureActionState> {
  return setChapterStatus(String(formData.get("chapterId") ?? ""), "draft");
}

// Publish all: every draft page and question in the chapter that passes the single Publish checks, then the
// chapter itself if nothing in its page order is left a draft. One log entry for the content, plus "Published chapter".
export async function publishChapterContent(_prev: StructureActionState, formData: FormData): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const chapterId = String(formData.get("chapterId") ?? "");
  if (!isUuid(chapterId)) return { error: NOT_FOUND };

  const result = await withTransaction<StructureActionState>(async (client) => {
    const { rows } = await client.query<{ title: string; status: string }>(`select title, status from chapters where id = $1 for update`, [chapterId]);
    const chapter = rows[0];
    if (!chapter) return { error: NOT_FOUND };
    // Holds the page order still while the items are checked and published.
    await client.query(`lock table handbook_items in share mode`);

    const plan = await planChapterPublish(client, chapterId, true);
    const pages = plan.pageIds.length;
    const questions = plan.questionIds.length;
    if (pages + questions === 0) {
      return {
        error: plan.heldBack.length > 0
          ? `Nothing could be published. Still drafts: ${describeHeldBack(plan.heldBack)}.`
          : "Everything in this chapter is already published.",
      };
    }
    if (pages > 0) await client.query(`update content_pages set status = 'published', updated_at = now() where id = any($1::uuid[])`, [plan.pageIds]);
    if (questions > 0) await client.query(`update questions set status = 'published', updated_at = now() where id = any($1::uuid[])`, [plan.questionIds]);

    const details: Record<string, string> = {
      pages: String(pages),
      questions: String(questions),
      ...(questions > 0 ? { "question numbers": refRuns(plan.questionRefNos) } : {}),
      ...(plan.heldBack.length > 0 ? { "still drafts": String(plan.heldBack.length) } : {}),
    };
    const target = { type: "chapter" as const, id: chapterId, label: chapter.title };
    await logActivity(client, session, "chapter.content_published", target, details);

    if (chapter.status === "draft") {
      const { rows: counts } = await client.query<{ total: number; drafts: number }>(
        `select count(*)::int as total, count(*) filter (where coalesce(p.status, q.status) <> 'published')::int as drafts
         from handbook_items i
         left join content_pages p on p.id = i.content_page_id
         left join questions q on q.id = i.question_id
         where i.chapter_id = $1`,
        [chapterId]
      );
      const { total, drafts } = counts[0];
      if (total > 0 && drafts === 0) {
        await client.query(`update chapters set status = 'published', updated_at = now() where id = $1`, [chapterId]);
        await logActivity(client, session, "chapter.published", target, { items: `${total} ${total === 1 ? "item" : "items"}` });
      }
    }
    return { success: true };
  });

  revalidatePath(PAGE_PATH, "layout");
  revalidatePath("/admin/questions", "layout");
  return result;
}

function testTypeIdsFrom(formData: FormData): string[] {
  return [...new Set(formData.getAll("testTypeId").map(String).filter(Boolean))];
}

// Keeps the chosen test types from being deleted until the save commits; null if any is gone.
async function lockTestTypes(client: PoolClient, ids: string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  if (!ids.every(isUuid)) return null;
  const { rows } = await client.query<{ id: string; name: string }>(
    `select id, name from test_types where id = any($1::uuid[]) order by id for share`,
    [ids]
  );
  return rows.length === ids.length ? new Map(rows.map((row) => [row.id, row.name])) : null;
}

async function closeGap(client: PoolClient, sectionId: string, removedPosition: number) {
  await client.query(
    `update chapters set position = position - 1, updated_at = now() where section_id = $1 and position > $2`,
    [sectionId, removedPosition]
  );
}

async function sectionTitleOf(client: PoolClient, sectionId: string): Promise<string | undefined> {
  const { rows } = await client.query<{ title: string }>(`select title from sections where id = $1`, [sectionId]);
  return rows[0]?.title;
}

async function titleTaken(client: PoolClient, title: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from chapters where lower(title) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [title, exceptId]
  );
  return rows.length > 0;
}

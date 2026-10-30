"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { isUuid } from "@/lib/ids";
import { TEST_TYPE_NAME_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";
import type { ListenMode } from "@/lib/voice/language-store";
import { lockHandbookStructure } from "@/lib/handbook/structure";
import { structureLockedError } from "@/lib/handbook/structure-lock";
import { claimedElsewhere, linkSharedChapters, sharedChapterIds } from "@/lib/handbook/sharing";

export type TestTypeActionState = FormState;

const DUPLICATE_NAME = "A test type with this name already exists.";
const MAX_LINKED_CHAPTERS = 1000;
// More than any real list of languages; stops a crafted request sending thousands.
const MAX_LISTEN_LANGUAGES = 100;
const TEST_AREA_GONE = "That test area no longer exists. Close this panel and open it again.";
const COVER_PICTURE_GONE = "That picture is no longer in the Media library. Choose another one.";
const CHAPTERS_CHANGED = "The chapter list has changed. Close this panel and open it again.";

export async function createTestType(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const name = cleanLine(formData.get("name"));
  const testAreaId = String(formData.get("testAreaId") ?? "");
  const invalid = validateName(name);
  if (invalid) return { error: invalid };
  if (!testAreaId) return { error: "Choose a test area." };

  try {
    const result = await withTransaction<TestTypeActionState>(async (client) => {
      await lockTestTypeOrder(client);
      if (await nameTaken(client, name, null)) return { error: DUPLICATE_NAME };

      const { rows: testAreas } = await client.query<{ name: string }>(
        `select name from test_areas where id = $1 for key share`,
        [testAreaId]
      );
      if (!testAreas[0]) return { error: TEST_AREA_GONE };

      const { rows } = await client.query<{ id: string }>(
        `insert into test_types (name, test_area_id, position)
         select $1, $2, coalesce(max(position), 0) + 1 from test_types where test_area_id = $2
         returning id`,
        [name, testAreaId]
      );
      const shared = await linkSharedChapters(client, rows[0].id);
      await logActivity(
        client,
        session,
        "test_type.created",
        { type: "test_type", id: rows[0].id, label: name },
        { testArea: testAreas[0].name, ...(shared > 0 ? { chapters: `${shared} linked to every test type` } : {}) }
      );
      return { success: true };
    });
    if (result.error) return result;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_NAME };
    if (code === "22P02" || code === "23503") return { error: TEST_AREA_GONE };
    throw error;
  }

  revalidatePath("/admin/test-types");
  return { success: true };
}

export async function renameTestType(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  const name = cleanLine(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: TestTypeActionState;
  try {
    result = await withTransaction<TestTypeActionState>(async (client) => {
      const testType = await lockTestType(client, testTypeId);
      if (!testType) return { error: "This test type no longer exists." };
      if (testType.name === name) return { success: true };
      if (await nameTaken(client, name, testTypeId)) return { error: DUPLICATE_NAME };

      await client.query(`update test_types set name = $2 where id = $1`, [testTypeId, name]);
      await logActivity(
        client,
        session,
        "test_type.renamed",
        { type: "test_type", id: testTypeId, label: name },
        { from: testType.name, to: name }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_NAME };
    if (code === "22P02") return { error: "Test type not found." };
    throw error;
  }

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/candidates");
  return result;
}

export async function deleteTestType(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  if (!testTypeId) {
    return { error: "Test type not found." };
  }

  let result: TestTypeActionState;
  try {
    // The row lock makes the candidate count final: new candidates in this test type must wait.
    result = await withTransaction<TestTypeActionState>(async (client) => {
      await lockTestTypeOrder(client);
      const testType = await lockTestType(client, testTypeId);
      if (!testType) return { error: "This test type has already been deleted." };

      const { rows } = await client.query<{ count: number }>(
        `select count(*)::int as count from users where test_type_id = $1 or current_test_type_id = $1`,
        [testTypeId]
      );
      if (rows[0].count > 0) return { error: blockedMessage(rows[0].count) };

      await client.query(`delete from test_types where id = $1`, [testTypeId]);
      await closeGap(client, testType.test_area_id, testType.position);
      await logActivity(client, session, "test_type.deleted", {
        type: "test_type",
        id: testTypeId,
        label: testType.name,
      });
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23503") return { error: blockedMessage(1) };
    if (code === "22P02") return { error: "Test type not found." };
    throw error;
  }

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/candidates");
  return result;
}

// Swaps with the neighbour in the same test area.
export async function moveTestType(id: string, direction: "up" | "down"): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };
  if (!isUuid(testTypeId)) return { error: "This test type no longer exists." };

  const result = await withTransaction<TestTypeActionState>(async (client) => {
    await lockTestTypeOrder(client);
    const testType = await lockTestType(client, testTypeId);
    if (!testType) return { error: "This test type no longer exists." };

    const from = testType.position;
    const to = direction === "up" ? from - 1 : from + 1;
    const { rows: neighbours } = await client.query<{ id: string }>(
      `select id from test_types where test_area_id = $1 and position = $2`,
      [testType.test_area_id, to]
    );
    if (!neighbours[0]) {
      return { error: direction === "up" ? "This test type is already first." : "This test type is already last." };
    }

    await client.query(
      `update test_types set position = case when id = $1 then $3::int else $4::int end where id in ($1, $2)`,
      [testTypeId, neighbours[0].id, to, from]
    );
    await logActivity(
      client,
      session,
      "test_type.reordered",
      { type: "test_type", id: testTypeId, label: testType.name },
      { from: `Position ${from}`, to: `Position ${to}` }
    );
    return { success: true };
  });

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/candidates");
  return result;
}

// Blocked while any candidate has the test type, because candidates only switch within their test area.
export async function moveTestTypeToTestArea(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  const testAreaId = String(formData.get("testAreaId") ?? "");
  if (!testTypeId) return { error: "Test type not found." };
  if (!testAreaId) return { error: "Choose a test area." };

  let result: TestTypeActionState;
  try {
    result = await withTransaction<TestTypeActionState>(async (client) => {
      await lockTestTypeOrder(client);
      const testType = await lockTestType(client, testTypeId);
      if (!testType) return { error: "This test type no longer exists." };
      if (testType.test_area_id === testAreaId) return { success: true };

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from users where test_type_id = $1 or current_test_type_id = $1`,
        [testTypeId]
      );
      if (counts[0].count > 0) return { error: moveBlockedMessage(counts[0].count) };

      const { rows: testAreas } = await client.query<{ id: string; name: string }>(
        `select id, name from test_areas where id in ($1, $2) for key share`,
        [testType.test_area_id, testAreaId]
      );
      const from = testAreas.find((testArea) => testArea.id === testType.test_area_id);
      const to = testAreas.find((testArea) => testArea.id === testAreaId);
      if (!to) return { error: TEST_AREA_GONE };

      await client.query(
        `update test_types
         set test_area_id = $2, position = (select coalesce(max(position), 0) + 1 from test_types where test_area_id = $2)
         where id = $1`,
        [testTypeId, testAreaId]
      );
      await closeGap(client, testType.test_area_id, testType.position);
      await logActivity(
        client,
        session,
        "test_type.area_changed",
        { type: "test_type", id: testTypeId, label: testType.name },
        { from: from?.name ?? "", to: to.name }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23514") return { error: moveBlockedMessage(1) };
    if (code === "22P02" || code === "23503") return { error: TEST_AREA_GONE };
    throw error;
  }

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/candidates");
  return result;
}

// Replaces the whole chapter list.
export async function saveTestTypeChapters(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  const chosen = [...new Set(formData.getAll("chapterId").map(String))];
  if (!testTypeId) return { error: "Test type not found." };
  if (chosen.length > MAX_LINKED_CHAPTERS) return { error: "Too many chapters selected." };
  if (!chosen.every(isUuid)) return { error: CHAPTERS_CHANGED };

  let result: TestTypeActionState;
  try {
    result = await withTransaction<TestTypeActionState>(async (client) => {
      const locked = await structureLockedError(client);
      if (locked) return { error: locked };
      await lockHandbookStructure(client);
      const testType = await lockTestType(client, testTypeId);
      if (!testType) return { error: "This test type no longer exists." };
      // Chapters linked to every test type are always in; any other chapter belongs to one test type.
      const shared = await sharedChapterIds(client);
      const claimed = await claimedElsewhere(client, testTypeId, chosen.filter((id) => !shared.includes(id)));
      if (claimed) return { error: claimed };
      const chapterIds = [...new Set([...chosen, ...shared])];

      // FOR SHARE keeps these chapters from being deleted until this save commits.
      const { rows } = await client.query(`select id from chapters where id = any($1::uuid[]) for share`, [
        chapterIds,
      ]);
      if (rows.length !== chapterIds.length) return { error: CHAPTERS_CHANGED };

      const { rows: removed } = await client.query<{ chapter_id: string }>(
        `delete from test_type_chapters where test_type_id = $1 returning chapter_id`,
        [testTypeId]
      );
      await client.query(
        `insert into test_type_chapters (test_type_id, chapter_id) select $1::uuid, unnest($2::uuid[])`,
        [testTypeId, chapterIds]
      );

      const before = new Set(removed.map((row) => row.chapter_id));
      const added = chapterIds.filter((id) => !before.has(id)).length;
      const dropped = [...before].filter((id) => !chapterIds.includes(id)).length;
      if (added > 0 || dropped > 0) {
        await logActivity(
          client,
          session,
          "test_type.chapters_changed",
          { type: "test_type", id: testTypeId, label: testType.name },
          { added: String(added), removed: String(dropped), total: String(chapterIds.length) }
        );
      }
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02" || code === "23503") return { error: CHAPTERS_CHANGED };
    throw error;
  }

  revalidatePath("/admin/test-types");
  return result;
}

// Both covers are saved together; an empty value means the standard brand cover.
export async function saveTestTypeCovers(
  _prevState: TestTypeActionState,
  formData: FormData
): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  const frontId = String(formData.get("frontMediaId") ?? "") || null;
  const backId = String(formData.get("backMediaId") ?? "") || null;
  if (!isUuid(testTypeId)) return { error: "Test type not found." };
  if ((frontId && !isUuid(frontId)) || (backId && !isUuid(backId))) return { error: COVER_PICTURE_GONE };

  let result: TestTypeActionState;
  try {
    result = await withTransaction<TestTypeActionState>(async (client) => {
      const { rows } = await client.query<{
        name: string;
        front_id: string | null;
        back_id: string | null;
        front_name: string | null;
        back_name: string | null;
      }>(
        `select c.name, c.front_cover_media_id as front_id, c.back_cover_media_id as back_id,
                fm.original_name as front_name, bm.original_name as back_name
         from test_types c
         left join media fm on fm.id = c.front_cover_media_id
         left join media bm on bm.id = c.back_cover_media_id
         where c.id = $1
         for update of c`,
        [testTypeId]
      );
      const testType = rows[0];
      if (!testType) return { error: "This test type no longer exists." };
      if (testType.front_id === frontId && testType.back_id === backId) return { success: true };

      // FOR KEY SHARE keeps the chosen pictures from being deleted until this save commits.
      const wanted = [frontId, backId].filter((id): id is string => Boolean(id));
      const { rows: pictures } = await client.query<{ id: string; original_name: string }>(
        `select id, original_name from media where id = any($1::uuid[]) for key share`,
        [wanted]
      );
      const nameOf = new Map(pictures.map((picture) => [picture.id, picture.original_name]));
      if (wanted.some((id) => !nameOf.has(id))) return { error: COVER_PICTURE_GONE };

      await client.query(
        `update test_types set front_cover_media_id = $2, back_cover_media_id = $3 where id = $1`,
        [testTypeId, frontId, backId]
      );
      const details: Record<string, string> = {};
      if (testType.front_id !== frontId) {
        details.frontCover = describeCoverChange(testType.front_name, frontId ? nameOf.get(frontId)! : null);
      }
      if (testType.back_id !== backId) {
        details.backCover = describeCoverChange(testType.back_name, backId ? nameOf.get(backId)! : null);
      }
      await logActivity(
        client,
        session,
        "test_type.covers_changed",
        { type: "test_type", id: testTypeId, label: testType.name },
        details
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02" || code === "23503") return { error: COVER_PICTURE_GONE };
    throw error;
  }

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/media");
  return result;
}

function describeCoverChange(before: string | null, after: string | null): string {
  if (!after) return `Standard cover (was “${before ?? "a picture"}”)`;
  return before ? `“${after}” (was “${before}”)` : `“${after}”`;
}

// Serialises changes to test type order, taken before any row lock; renames and other edits are not blocked.
async function lockTestTypeOrder(client: PoolClient) {
  await client.query(`select pg_advisory_xact_lock(hashtext('test_types:order'))`);
}

// After a test type leaves a test area, the ones after it move up one place.
async function closeGap(client: PoolClient, testAreaId: string, position: number) {
  await client.query(`update test_types set position = position - 1 where test_area_id = $1 and position > $2`, [testAreaId, position]);
}

async function lockTestType(client: PoolClient, testTypeId: string) {
  const { rows } = await client.query<{ name: string; test_area_id: string; position: number }>(
    `select name, test_area_id, position from test_types where id = $1 for update`,
    [testTypeId]
  );
  return rows[0];
}

async function nameTaken(client: PoolClient, name: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from test_types where lower(name) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [name, exceptId]
  );
  return rows.length > 0;
}

function validateName(name: string): string | null {
  if (!name) return "Test type name is required.";
  if (name.length > TEST_TYPE_NAME_MAX_LENGTH) {
    return `Test type name must be ${TEST_TYPE_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

function moveBlockedMessage(candidateCount: number) {
  return `This test type has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Candidates can only switch within their test area, so it can't move while they use it.`;
}

function blockedMessage(candidateCount: number) {
  return `This test type still has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Their Admins need to move them to another test type before it can be deleted.`;
}

// Listen for one test type's candidates (0035): off, all languages, or English plus chosen ones. Translations, audio
// and candidates' language choices are kept. One log entry per change: on/off, or which languages.
export async function setTestTypeListen(_prevState: TestTypeActionState | undefined, formData: FormData): Promise<TestTypeActionState> {
  const session = await requireRole(["superadmin"]);

  const testTypeId = String(formData.get("testTypeId") ?? "");
  const mode = formData.get("mode");
  if (!isUuid(testTypeId)) return { error: "Test type not found." };
  if (mode !== "off" && mode !== "all" && mode !== "chosen") return { error: "Choose how Listen works for this test type." };
  const asked = [...new Set(formData.getAll("languages").map(String))].slice(0, MAX_LISTEN_LANGUAGES);

  const result = await withTransaction<TestTypeActionState>(async (client) => {
    const { rows } = await client.query<{ name: string; listen_mode: ListenMode; chosen: string[] }>(
      `select name, listen_mode, array(select language from test_type_languages where test_type_id = $1) as chosen
       from test_types where id = $1 for update`,
      [testTypeId]
    );
    const testType = rows[0];
    if (!testType) return { error: "This test type no longer exists." };
    // Only languages that exist and aren't hidden can be ticked (drafts can, so a test type is ready when they go live).
    const { rows: known } = await client.query<{ code: string; name: string; status: string }>(
      `select code, name, status from voice_languages where code <> 'en'`
    );
    const chosen = mode === "chosen" ? asked : testType.chosen;
    if (mode === "chosen" && chosen.some((code) => !known.some((language) => language.code === code && language.status !== "hidden"))) {
      return { error: "The language list has changed. Close this panel and open it again." };
    }
    const before = listenOffer(testType.listen_mode, testType.chosen, known);
    const after = listenOffer(mode, chosen, known);
    if (mode === "chosen") {
      await client.query(`delete from test_type_languages where test_type_id = $1 and not (language = any($2::text[]))`, [testTypeId, chosen]);
      await client.query(
        `insert into test_type_languages (test_type_id, language) select $1, unnest($2::text[]) on conflict do nothing`,
        [testTypeId, chosen]
      );
    }
    if (testType.listen_mode !== mode) await client.query(`update test_types set listen_mode = $2 where id = $1`, [testTypeId, mode]);
    if (before === after) return { success: true };
    const target = { type: "test_type" as const, id: testTypeId, label: testType.name };
    if (testType.listen_mode === "off" || mode === "off") {
      await logActivity(client, session, "test_type.listen_changed", target, { from: before, to: after });
    } else {
      await logActivity(client, session, "test_type.listen_languages_changed", target, { from: before, to: after });
    }
    return { success: true };
  });

  revalidatePath("/admin/test-types");
  return result;
}

// How a test type's Listen reads in the log: "Off", "All languages", or "English, Polish, Welsh".
function listenOffer(mode: ListenMode, chosen: string[], known: { code: string; name: string }[]): string {
  if (mode === "off") return "Off";
  if (mode === "all") return "All languages";
  const names = chosen.map((code) => known.find((language) => language.code === code)?.name ?? code).sort((a, b) => a.localeCompare(b, "en"));
  return ["English", ...names].join(", ");
}

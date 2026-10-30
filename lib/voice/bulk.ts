import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { parseBlocks } from "@/lib/content/blocks";
import { pool } from "@/lib/db/pool";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { chapterNumber } from "@/lib/handbook/structure";
import { isUuid } from "@/lib/ids";
import { questionLogLabel } from "@/lib/questions/labels";
import { characterCount } from "@/lib/text";
import { audioService } from "./language-catalogue";
import { findVoiceLanguage } from "./language-store";
import { SOURCE_LANGUAGE } from "./languages";
import { BULK_ABANDONED_AFTER_MINUTES, MP3_KBPS, SPEECH_PART_CHARS } from "./limits";
import { STATES } from "./overview";
import { generateAudio } from "./page-audio";
import { generateTranslation } from "./page-translations";
import { QUESTION_CURRENT_VERSION, VOICE_QUESTION_TYPES, type QuestionText } from "./question-listen";
import { QUESTION_SOURCE_SQL, TRANSLATION_SOURCE_SQL, generateQuestionAudio, generateQuestionTranslation } from "./question-voice";
import type { VoiceFailure } from "./services";
import { audioState, translationState, type TranslationRow } from "./status";
import { toTranslatable } from "./translation";

// Server-only: bulk Listen. One chapter in one language at a time, driven by the browser one step at a time
// (translate an item, then make its audio), so a closed page loses nothing that's done. A bulk run's translations are
// checked automatically (labelled so) and nothing is logged item by item: each run writes one entry when it ends.

export type BulkItemKind = "page" | "question";
export type BulkStep = "translate" | "audio";
export type BulkItem = { kind: BulkItemKind; id: string; label: string; translate: boolean; audio: boolean };
export type BulkOutcome = "finished" | "stopped" | "limit";

export type BulkPlan = {
  chapter: { id: string; label: string };
  language: { code: string; name: string; gemini: boolean };
  // Items that can have Listen, and how many are already done.
  total: number;
  done: number;
  // Up-to-date drafts waiting for a person to check them (a bulk run leaves those alone).
  waiting: string[];
  todo: BulkItem[];
  // Out-of-date translations that will be translated again, replacing the earlier ones.
  replaces: number;
  // Rough figures: the characters sent, the storage the audio takes, and Gemini calls (one per part read aloud).
  estimate: { translate: number; speech: number; storageBytes: number; geminiCalls: number };
};

export type BulkCounts = { translated: number; audio: number; characters: { translate: number; speech: number } };
export type BulkStart = { ok: true; runId: string; plan: BulkPlan } | { ok: false; error: string };
export type BulkStepResult =
  | { ok: true; skipped: boolean; counts: BulkCounts }
  | { ok: false; error: string; failure?: VoiceFailure; waitMs?: number; limit?: boolean };

const RUN_ENDED = "This run has ended. Start it again to carry on.";
// Speech: about 14 characters a second; a translation reads about 15% longer than the English.
const CHARACTERS_PER_SECOND = 14;
const TRANSLATED_LENGTH = 1.15;
const OUTCOME_LABELS: Record<BulkOutcome | "abandoned", string> = {
  finished: "Finished",
  stopped: "Stopped",
  limit: "Stopped at a limit",
  abandoned: "Stopped (page closed)",
};

// ---- What a run would do ----

type PlanRow = {
  kind: BulkItemKind;
  id: string;
  title: string;
  ref_no: number | null;
  t: string | null;
  a: string;
  can_make: boolean;
  blocks: unknown;
  source: QuestionText | null;
};

// The chapter's label as staff lists show it ("05 Environmental awareness and waste control").
async function chapterLabel(db: PoolClient | typeof pool, chapterId: string): Promise<string | null> {
  const { rows } = await db.query<{ title: string; number: number }>(
    `select title, number from (
       select c.id, c.title, row_number() over (order by s.position, c.position)::int as number
       from chapters c join sections s on s.id = c.section_id) n
     where n.id = $1`,
    [chapterId]
  );
  return rows[0] ? `${chapterNumber(rows[0].number)} ${rows[0].title}` : null;
}

// The English text an item sends: a page's translatable texts, or a question and its options.
function englishLength(row: PlanRow): number {
  if (row.kind === "page") {
    const parsed = parseBlocks(row.blocks);
    return parsed.ok ? characterCount(toTranslatable(parsed.blocks).flatMap((block) => block.texts)) : 0;
  }
  return row.source ? characterCount([row.source.stem, ...row.source.options.map((option) => option.text)]) : 0;
}

export async function planBulkRun(chapterId: string, code: string): Promise<BulkPlan | null> {
  if (!isUuid(chapterId)) return null;
  const language = await findVoiceLanguage(code);
  const label = await chapterLabel(pool, chapterId);
  if (!language || !label) return null;
  const { rows } = await pool.query<PlanRow>(
    `${STATES}
     select x.kind, x.id, x.title, x.ref_no, s.t, s.a, s.can_make,
            case when x.kind = 'page' then (select p.blocks from content_pages p where p.id = x.id) end as blocks,
            case when x.kind = 'question' then (select ${QUESTION_SOURCE_SQL} from questions q where q.id = x.id) end as source
     from items x join states s on s.item_id = x.id
     where x.supported and x.chapter_id = $3
     order by x.position nulls last, x.title, x.id`,
    [[language.code], [...VOICE_QUESTION_TYPES], chapterId]
  );
  const isSource = language.code === SOURCE_LANGUAGE;
  const plan: BulkPlan = {
    chapter: { id: chapterId, label },
    language: { code: language.code, name: language.name, gemini: audioService(language.code) === "gemini" },
    total: rows.length,
    done: 0,
    waiting: [],
    todo: [],
    replaces: 0,
    estimate: { translate: 0, speech: 0, storageBytes: 0, geminiCalls: 0 },
  };
  for (const row of rows) {
    const itemLabel = row.kind === "page" ? `"${row.title}"` : questionLogLabel(row.ref_no ?? 0, row.title, 60);
    const translate = !isSource && (row.t === "missing" || row.t === "outdated");
    const audio = translate || ((row.a === "missing" || row.a === "outdated") && row.can_make);
    if (row.t === "draft") plan.waiting.push(itemLabel);
    else if (translate || audio) {
      plan.todo.push({ kind: row.kind, id: row.id, label: itemLabel, translate, audio });
      if (row.t === "outdated") plan.replaces++;
      const length = englishLength(row);
      if (translate) plan.estimate.translate += length;
      const spoken = Math.round(length * (isSource ? 1 : TRANSLATED_LENGTH));
      plan.estimate.speech += spoken;
      plan.estimate.geminiCalls += Math.max(1, Math.ceil(spoken / SPEECH_PART_CHARS));
    } else if (row.a === "ready") plan.done++;
  }
  plan.estimate.storageBytes = Math.round((plan.estimate.speech / CHARACTERS_PER_SECOND) * ((MP3_KBPS * 1000) / 8));
  if (!plan.language.gemini) plan.estimate.geminiCalls = 0;
  return plan;
}

// ---- Runs ----

type RunRow = {
  id: string;
  chapter_id: string;
  language: string;
  started_by: string | null;
  started_at: Date;
  items: number;
  translated: number;
  audio: number;
  failed: number;
};

const RUN_COLUMNS = `id, chapter_id, language, started_by, started_at, items, translated, audio, failed`;

// The run's one log entry: what it did and how it ended.
async function logRun(client: PoolClient, session: SessionPayload, run: RunRow, outcome: BulkOutcome | "abandoned") {
  const label = (await chapterLabel(client, run.chapter_id)) ?? "Deleted chapter";
  const { rows } = await client.query<{ name: string }>(`select name from voice_languages where code = $1`, [run.language]);
  const parts = [
    `${run.items} to do`,
    run.translated > 0 ? `${run.translated} translated and checked automatically` : "",
    `${run.audio} given audio`,
    run.failed > 0 ? `${run.failed} failed` : "",
  ].filter(Boolean);
  await logActivity(client, session, "listen.bulk_run", { type: "chapter", id: run.chapter_id, label }, {
    language: rows[0]?.name ?? run.language,
    items: parts.join(" · "),
    result: OUTCOME_LABELS[outcome],
  });
}

// Runs whose page was closed: open with no step for a while, or this person's own earlier run of the same chapter
// and language. Each is closed and logged now, by whoever finds it.
async function closeAbandoned(client: PoolClient, session: SessionPayload, chapterId: string, code: string) {
  const { rows } = await client.query<RunRow>(
    `update voice_bulk_runs set finished_at = now(), outcome = 'abandoned'
     where finished_at is null
       and (last_step_at < now() - make_interval(mins => $4) or (chapter_id = $1 and language = $2 and started_by = $3))
     returning ${RUN_COLUMNS}`,
    [chapterId, code, session.sub, BULK_ABANDONED_AFTER_MINUTES]
  );
  for (const run of rows) await logRun(client, session, run, "abandoned");
}

export async function startBulkRun(session: SessionPayload, chapterId: string, code: string): Promise<BulkStart> {
  const plan = await planBulkRun(chapterId, code);
  if (!plan) return { ok: false, error: "Choose a chapter and a language." };
  if (plan.todo.length === 0) return { ok: false, error: `Nothing to do: everything in ${plan.chapter.label} that a run can do in ${plan.language.name} is done.` };
  try {
    return await withTransaction<BulkStart>(async (client) => {
      await closeAbandoned(client, session, chapterId, plan.language.code);
      const { rows: open } = await client.query<{ email: string | null }>(
        `select u.email from voice_bulk_runs r left join users u on u.id = r.started_by
         where r.chapter_id = $1 and r.language = $2 and r.finished_at is null`,
        [chapterId, plan.language.code]
      );
      if (open[0]) {
        return { ok: false, error: `${open[0].email ?? "Someone"} is already running ${plan.chapter.label} in ${plan.language.name}. Try again when it has finished.` };
      }
      // Finished runs are only kept a while (their log entries stay).
      await client.query(`delete from voice_bulk_runs where finished_at < now() - interval '180 days'`);
      const { rows } = await client.query<{ id: string }>(
        `insert into voice_bulk_runs (chapter_id, language, started_by, items) values ($1, $2, $3, $4) returning id`,
        [chapterId, plan.language.code, session.sub, plan.todo.length]
      );
      return { ok: true, runId: rows[0].id, plan };
    });
  } catch (error) {
    // Two starts at the same moment: the second finds the first's open run.
    if (getErrorCode(error) === "23505") return { ok: false, error: `${plan.chapter.label} is already being run in ${plan.language.name}.` };
    throw error;
  }
}

// This person's open run (only they can step or finish it), or null.
async function openRun(db: PoolClient | typeof pool, session: SessionPayload, runId: string, lock = ""): Promise<RunRow | null> {
  if (!isUuid(runId)) return null;
  const { rows } = await db.query<RunRow>(
    `select ${RUN_COLUMNS} from voice_bulk_runs where id = $1 and started_by = $2 and finished_at is null ${lock}`,
    [runId, session.sub]
  );
  return rows[0] ?? null;
}

// The item's translation and audio state now (another person may have done it meanwhile).
async function itemNow(kind: BulkItemKind, id: string, code: string) {
  const isSource = code === SOURCE_LANGUAGE;
  if (kind === "page") {
    const { rows } = await pool.query<{ content_version: number; source_version: number | null; revision: number | null; status: TranslationRow["status"] | null; audio_version: number | null }>(
      `select p.content_version, t.source_version, t.revision, t.status, a.source_version as audio_version
       from content_pages p
       left join page_translations t on t.content_page_id = p.id and t.language = $2
       left join page_audio a on a.content_page_id = p.id and a.language = $2
       where p.id = $1`,
      [id, code]
    );
    const row = rows[0];
    const translation = row?.status ? { sourceVersion: row.source_version!, revision: row.revision!, status: row.status } : null;
    return {
      translation: isSource ? null : translationState(row?.content_version ?? 0, translation),
      audio: audioState(isSource, row?.content_version ?? 0, translation, row?.audio_version != null ? { sourceVersion: row.audio_version } : null),
    };
  }
  const { rows } = await pool.query<{ current: boolean | null; revision: number | null; status: TranslationRow["status"] | null; audio_version: number | null }>(
    `select (t.source = ${TRANSLATION_SOURCE_SQL}) as current, t.revision, t.status,
            case when a.question_id is null then null when a.source <> ${QUESTION_SOURCE_SQL} then 0
                 when a.language = '${SOURCE_LANGUAGE}' then ${QUESTION_CURRENT_VERSION} else a.source_revision end as audio_version
     from questions q
     left join question_translations t on t.question_id = q.id and t.language = $2
     left join question_audio a on a.question_id = q.id and a.language = $2
     where q.id = $1`,
    [id, code]
  );
  const row = rows[0];
  const translation = row?.status ? { sourceVersion: row.current ? QUESTION_CURRENT_VERSION : 0, revision: row.revision!, status: row.status } : null;
  return {
    translation: isSource ? null : translationState(QUESTION_CURRENT_VERSION, translation),
    audio: audioState(isSource, QUESTION_CURRENT_VERSION, translation, row?.audio_version != null ? { sourceVersion: row.audio_version } : null),
  };
}

async function inChapter(kind: BulkItemKind, id: string, chapterId: string): Promise<boolean> {
  const { rows } = await pool.query(
    kind === "page"
      ? `select 1 from content_pages where id = $1 and chapter_id = $2`
      : `select 1 from handbook_items where question_id = $1 and chapter_id = $2`,
    [id, chapterId]
  );
  return rows.length > 0;
}

// Characters this person has sent since the run started (shown beside the hourly limit).
async function counts(run: RunRow): Promise<BulkCounts> {
  const { rows } = await pool.query<{ translated: number; audio: number; translate: number; speech: number }>(
    `select r.translated, r.audio,
            (select coalesce(sum(characters), 0) from voice_usage u where u.user_id = r.started_by and u.kind = 'translate' and u.created_at >= r.started_at)::int as translate,
            (select coalesce(sum(characters), 0) from voice_usage u where u.user_id = r.started_by and u.kind = 'speech' and u.created_at >= r.started_at)::int as speech
     from voice_bulk_runs r where r.id = $1`,
    [run.id]
  );
  const row = rows[0];
  return { translated: row?.translated ?? 0, audio: row?.audio ?? 0, characters: { translate: row?.translate ?? 0, speech: row?.speech ?? 0 } };
}

// One step for one item: translate it (checked automatically), or make its audio. Already done: skipped.
export async function runBulkStep(
  session: SessionPayload,
  input: { runId: string; kind: BulkItemKind; id: string; step: BulkStep }
): Promise<BulkStepResult> {
  if ((input.kind !== "page" && input.kind !== "question") || (input.step !== "translate" && input.step !== "audio") || !isUuid(input.id)) {
    return { ok: false, error: "Unknown step." };
  }
  const run = await openRun(pool, session, input.runId);
  if (!run) return { ok: false, error: RUN_ENDED, failure: "stop" };
  await pool.query(`update voice_bulk_runs set last_step_at = now() where id = $1`, [run.id]);
  if (!(await inChapter(input.kind, input.id, run.chapter_id))) return { ok: false, error: "It's no longer in this chapter." };

  const now = await itemNow(input.kind, input.id, run.language);
  if (input.step === "translate") {
    if (run.language === SOURCE_LANGUAGE) return { ok: false, error: "English isn't translated." };
    if (now.translation !== "missing" && now.translation !== "outdated") return { ok: true, skipped: true, counts: await counts(run) };
    const result =
      input.kind === "page"
        ? await generateTranslation(session, input.id, run.language, { bulk: true })
        : await generateQuestionTranslation(session, input.id, run.language, { bulk: true });
    if (!result.ok) return { ok: false, error: result.error, failure: result.failure, waitMs: result.waitMs, limit: result.limit };
    await pool.query(`update voice_bulk_runs set translated = translated + 1 where id = $1`, [run.id]);
    return { ok: true, skipped: false, counts: await counts(run) };
  }
  if (now.audio === "ready") return { ok: true, skipped: true, counts: await counts(run) };
  if (now.audio === "waiting") return { ok: false, error: "Its translation isn't checked, so audio can't be made." };
  const result =
    input.kind === "page"
      ? await generateAudio(session, input.id, run.language, { bulk: true })
      : await generateQuestionAudio(session, input.id, run.language, { bulk: true });
  if (!result.ok) return { ok: false, error: result.error, failure: result.failure, waitMs: result.waitMs, limit: result.limit };
  await pool.query(`update voice_bulk_runs set audio = audio + 1 where id = $1`, [run.id]);
  return { ok: true, skipped: false, counts: await counts(run) };
}

// Ends the run and writes its one log entry. `failed`: the items the browser gave up on.
export async function finishBulkRun(session: SessionPayload, runId: string, outcome: BulkOutcome, failed: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (outcome !== "finished" && outcome !== "stopped" && outcome !== "limit") return { ok: false, error: "Unknown outcome." };
  return withTransaction(async (client) => {
    const run = await openRun(client, session, runId, "for update");
    if (!run) return { ok: false as const, error: RUN_ENDED };
    const failedCount = Number.isInteger(failed) ? Math.min(Math.max(0, failed), run.items) : 0;
    const { rows } = await client.query<RunRow>(
      `update voice_bulk_runs set finished_at = now(), outcome = $2, failed = $3 where id = $1 returning ${RUN_COLUMNS}`,
      [run.id, outcome, failedCount]
    );
    await logRun(client, session, rows[0], outcome);
    return { ok: true as const };
  });
}

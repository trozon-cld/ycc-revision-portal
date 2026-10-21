import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { formatDuration } from "@/lib/format";
import { questionLogLabel } from "@/lib/questions/labels";
import { optionLetter } from "@/lib/questions/types/single-text";
import { SOURCE_LANGUAGE, isTranslatedLanguage, voiceLanguage } from "./languages";
import { speakParts, translateItems, voiceFailure, type PageSpeech } from "./make";
import {
  audioCanStart,
  audioFileLink,
  deleteAudioFilesQuietly,
  storeAudioFile,
  type AudioDeleteResult,
  type AudioLinkResult,
  type AudioResult,
  type AudioSummary,
} from "./page-audio";
import type { TranslationResult, TranslationSummary } from "./page-translations";
import { questionReadingParts } from "./reading";
import { VoiceError } from "./services";
import type { TranslationRow } from "./status";
import {
  QUESTION_CURRENT_VERSION,
  checkQuestionTexts,
  questionTypeHasListen,
  readTexts,
  sameOptions,
  type QuestionText,
  type QuestionVoice,
} from "./question-listen";

// Server-only: Listen for Handbook question pages (V6a). Only what the page shows before the answer is checked
// is translated and read: the question and its options. A translation or audio is up to date while the English
// question and options are the same as when it was made (`source`), so answer or explanation edits don't matter.

// The English question and options of question `q`, built in SQL so stored copies compare exactly.
// What is said for option `o`: its text, or for a picture option its label, else the picture's description in Media.
const OPTION_LABEL_SQL = `nullif(btrim(o->>'label'), '')`;
const OPTION_SPOKEN_SQL = `coalesce(o->>'text', ${OPTION_LABEL_SQL}, (select m.alt_text from media m where m.id = nullif(o->>'mediaId', '')::uuid))`;
// Picture options also say where their words come from (shown in the Translations page); text options add nothing.
const OPTION_FROM_SQL = `case when o ? 'mediaId' then jsonb_build_object('from', case when ${OPTION_LABEL_SQL} is null then 'description' else 'label' end) else '{}'::jsonb end`;

// Multiple answers adds how many to choose ("pick"), Choose the area how many areas ("areas"), Tap the area "tap";
// other types have none of these keys, so their copies are unchanged.
export const QUESTION_SOURCE_SQL = `(jsonb_build_object(
    'stem', q.stem_text,
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o->>'id', 'text', ${OPTION_SPOKEN_SQL}) || ${OPTION_FROM_SQL} order by n)
                         from jsonb_array_elements(q.content->'options') with ordinality as x(o, n)), '[]'::jsonb))
  || case when q.content ? 'pick' then jsonb_build_object('pick', q.content->'pick') else '{}'::jsonb end
  || case when q.content ? 'areas' then jsonb_build_object('areas', jsonb_array_length(q.content->'areas')) else '{}'::jsonb end
  || case when q.type = 'hotspot' then jsonb_build_object('tap', true) else '{}'::jsonb end)`;

const NOT_FOUND = "This question no longer exists.";
const NOT_IN_HANDBOOK = "Listen is only for questions placed in the Handbook. Add this question to a chapter's page order first.";
const NOT_YET = "Listen isn't available for this question type yet.";

type QuestionRow = { ref_no: number; type: string; stem_text: string; in_handbook: boolean; source: QuestionText };

async function readQuestion(client: PoolClient | typeof pool, questionId: string, lock = ""): Promise<QuestionRow | null> {
  const { rows } = await client.query<QuestionRow>(
    `select q.ref_no, q.type, q.stem_text, exists (select 1 from handbook_items i where i.question_id = q.id) as in_handbook,
            ${QUESTION_SOURCE_SQL} as source
     from questions q where q.id = $1 ${lock}`,
    [questionId]
  );
  return rows[0] ?? null;
}

// Why Listen can't be used for this question, or null when it can.
function unavailable(question: QuestionRow | null): string | null {
  if (!question) return NOT_FOUND;
  if (!questionTypeHasListen(question.type)) return NOT_YET;
  return question.in_handbook ? null : NOT_IN_HANDBOOK;
}

function target(questionId: string, question: QuestionRow) {
  return { type: "question" as const, id: questionId, label: questionLogLabel(question.ref_no, question.stem_text) };
}

// ---- What the editor shows ----

const TRANSLATION_COLUMNS = `t.language, t.revision, t.status, t.updated_at, t.checked_at, (t.source = ${QUESTION_SOURCE_SQL}) as current`;
// Dates arrive as Date from plain columns and as text from JSON (the one-query loader below).
type TranslationSummaryRow = { language: string; revision: number; status: TranslationRow["status"]; updated_at: Date | string; checked_at: Date | string | null; current: boolean };

function toTranslationSummary(row: TranslationSummaryRow): TranslationSummary {
  return {
    language: row.language,
    sourceVersion: row.current ? QUESTION_CURRENT_VERSION : 0,
    revision: row.revision,
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString(),
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
  };
}

const AUDIO_COLUMNS = `a.language, a.source_revision, a.duration_ms, a.byte_size, a.created_at, (a.source = ${QUESTION_SOURCE_SQL}) as current`;
type AudioSummaryRow = { language: string; source_revision: number | null; duration_ms: number; byte_size: number; created_at: Date | string; current: boolean };

// English audio counts as version 1 when made from the current English; translated audio by the revision it was made from.
function toAudioSummary(row: AudioSummaryRow): AudioSummary {
  return {
    language: row.language,
    sourceVersion: !row.current ? 0 : row.language === SOURCE_LANGUAGE ? QUESTION_CURRENT_VERSION : (row.source_revision ?? 0),
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type VoiceRow = QuestionRow & { translations: (TranslationSummaryRow & { texts: unknown })[]; audio: AudioSummaryRow[] };

// The question, its translations (with their texts) and audio in one query, so a page needs one connection.
async function readVoice(questionId: string): Promise<VoiceRow | null> {
  const { rows } = await pool.query<VoiceRow>(
    `select q.ref_no, q.type, q.stem_text, exists (select 1 from handbook_items i where i.question_id = q.id) as in_handbook,
            ${QUESTION_SOURCE_SQL} as source,
            coalesce((select json_agg(json_build_object('language', t.language, 'revision', t.revision, 'status', t.status,
                                                        'updated_at', t.updated_at, 'checked_at', t.checked_at,
                                                        'current', t.source = ${QUESTION_SOURCE_SQL}, 'texts', t.texts))
                      from question_translations t where t.question_id = q.id), '[]') as translations,
            coalesce((select json_agg(json_build_object('language', a.language, 'source_revision', a.source_revision,
                                                        'duration_ms', a.duration_ms, 'byte_size', a.byte_size, 'created_at', a.created_at,
                                                        'current', a.source = ${QUESTION_SOURCE_SQL}))
                      from question_audio a where a.question_id = q.id), '[]') as audio
     from questions q where q.id = $1`,
    [questionId]
  );
  return rows[0] ?? null;
}

function toVoice(row: VoiceRow | null): QuestionVoice {
  return {
    unavailable: unavailable(row),
    translations: (row?.translations ?? []).map(toTranslationSummary),
    audio: (row?.audio ?? []).map(toAudioSummary),
  };
}

export async function loadQuestionVoice(questionId: string): Promise<QuestionVoice> {
  return toVoice(await readVoice(questionId));
}

export type QuestionTranslationsView = {
  refNo: number;
  english: QuestionText;
  voice: QuestionVoice;
  // The chosen language's translation; `optionsChanged`: the English options were added, removed or moved since,
  // so it can't be edited (translate again).
  current: { summary: TranslationSummary; texts: QuestionText; optionsChanged: boolean } | null;
};

// Everything the question's Translations page shows for one language, or null when the question doesn't exist.
export async function loadQuestionTranslations(questionId: string, language: string): Promise<QuestionTranslationsView | null> {
  const row = await readVoice(questionId);
  if (!row) return null;
  const voice = toVoice(row);
  const summary = voice.translations.find((item) => item.language === language);
  const raw = row.translations.find((item) => item.language === language);
  const texts = raw ? (readTexts(raw.texts) ?? { stem: "", options: [] }) : null;
  return {
    refNo: row.ref_no,
    english: row.source,
    voice,
    current: summary && texts ? { summary, texts, optionsChanged: !sameOptions(row.source, texts) } : null,
  };
}

// ---- Translations ----

export async function generateQuestionTranslation(session: SessionPayload, questionId: string, language: string): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  const question = await readQuestion(pool, questionId);
  const blocked = unavailable(question);
  if (blocked || !question) return { ok: false, error: blocked ?? NOT_FOUND };
  const english = question.source;

  let texts: QuestionText;
  try {
    const sent = [{ id: "stem", texts: [english.stem] }, ...english.options.map((option) => ({ id: option.id, texts: [option.text] }))];
    const { items } = await translateItems(session.sub, sent, language, "question");
    const byId = new Map(items.map((item) => [item.id, item.texts[0]]));
    const checked = checkQuestionTexts(english, { stem: byId.get("stem"), options: english.options.map((option) => ({ id: option.id, text: byId.get(option.id) })) });
    if (!checked.ok) throw new VoiceError("bad_reply", checked.error);
    texts = checked.texts;
  } catch (error) {
    return voiceFailure(error);
  }

  return withTransaction<TranslationResult>(async (client) => {
    const current = await readQuestion(client, questionId, "for share");
    if (!current) return { ok: false, error: NOT_FOUND };
    if (JSON.stringify(current.source) !== JSON.stringify(english)) {
      return { ok: false, error: "The question changed while this was being translated. Please try again." };
    }
    const { rows } = await client.query<TranslationSummaryRow>(
      `with saved as (
         insert into question_translations (question_id, language, texts, source)
         select q.id, $2, $3, ${QUESTION_SOURCE_SQL} from questions q where q.id = $1
         on conflict (question_id, language) do update
           set texts = excluded.texts, source = excluded.source, revision = question_translations.revision + 1,
               status = 'draft', checked_by = null, checked_at = null, updated_at = now()
         returning *)
       select ${TRANSLATION_COLUMNS} from saved t join questions q on q.id = t.question_id`,
      [questionId, language, JSON.stringify(texts)]
    );
    await logActivity(client, session, "question_translation.generated", target(questionId, current), { language: voiceLanguage(language)!.name });
    return { ok: true, translation: toTranslationSummary(rows[0]) };
  });
}

// Staff edits: brings the translation up to date with the English question (if the options are the same) and
// puts it back to draft. Refused if someone else changed it since it was opened.
export async function saveQuestionTranslationEdit(
  session: SessionPayload,
  questionId: string,
  language: string,
  expectedRevision: number,
  edited: unknown
): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  return withTransaction<TranslationResult>(async (client) => {
    const question = await readQuestion(client, questionId, "for share");
    if (!question) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<TranslationSummaryRow & { texts: unknown }>(
      `select ${TRANSLATION_COLUMNS}, t.texts from question_translations t join questions q on q.id = t.question_id
       where t.question_id = $1 and t.language = $2 for update of t`,
      [questionId, language]
    );
    const existing = rows[0];
    if (!existing) return { ok: false, error: "This translation no longer exists. Translate the question first." };
    if (existing.revision !== expectedRevision) {
      return { ok: false, conflict: true, error: "Someone else changed this translation while you were editing. Copy anything you need, then reload the page." };
    }
    const checked = checkQuestionTexts(question.source, edited);
    if (!checked.ok) return { ok: false, error: checked.error };
    if (existing.current && JSON.stringify(readTexts(existing.texts)) === JSON.stringify(checked.texts)) {
      return { ok: true, translation: toTranslationSummary(existing) };
    }
    const { rows: saved } = await client.query<TranslationSummaryRow>(
      `with saved as (
         update question_translations t
         set texts = $3, source = ${QUESTION_SOURCE_SQL}, revision = t.revision + 1, status = 'draft', checked_by = null, checked_at = null, updated_at = now()
         from questions q where q.id = t.question_id and t.question_id = $1 and t.language = $2
         returning t.*)
       select ${TRANSLATION_COLUMNS} from saved t join questions q on q.id = t.question_id`,
      [questionId, language, JSON.stringify(checked.texts)]
    );
    await logActivity(client, session, "question_translation.edited", target(questionId, question), { language: voiceLanguage(language)!.name });
    return { ok: true, translation: toTranslationSummary(saved[0]) };
  });
}

// A reader of the language has checked it: only an up-to-date draft, as it was when they read it.
export async function markQuestionTranslationChecked(session: SessionPayload, questionId: string, language: string, expectedRevision: number): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  return withTransaction<TranslationResult>(async (client) => {
    const question = await readQuestion(client, questionId, "for share");
    if (!question) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<TranslationSummaryRow>(
      `select ${TRANSLATION_COLUMNS} from question_translations t join questions q on q.id = t.question_id
       where t.question_id = $1 and t.language = $2 for update of t`,
      [questionId, language]
    );
    const existing = rows[0];
    if (!existing) return { ok: false, error: "This translation no longer exists. Translate the question first." };
    if (existing.revision !== expectedRevision) {
      return { ok: false, conflict: true, error: "Someone else changed this translation while you were reading it. Reload the page and check it again." };
    }
    if (!existing.current) {
      return { ok: false, error: "The English question changed since this was translated. Translate it again, or edit and save it first." };
    }
    if (existing.status === "checked") return { ok: true, translation: toTranslationSummary(existing) };
    const { rows: saved } = await client.query<TranslationSummaryRow>(
      `with saved as (
         update question_translations set status = 'checked', checked_by = $3, checked_at = now(), updated_at = now()
         where question_id = $1 and language = $2 returning *)
       select ${TRANSLATION_COLUMNS} from saved t join questions q on q.id = t.question_id`,
      [questionId, language, session.sub]
    );
    await logActivity(client, session, "question_translation.checked", target(questionId, question), { language: voiceLanguage(language)!.name });
    return { ok: true, translation: toTranslationSummary(saved[0]) };
  });
}

// ---- Audio ----

type AudioSource = { question: QuestionRow; texts: QuestionText; revision: number | null } | { error: string };

// What the audio is read from: the English question, or a checked translation of the current English.
async function readAudioSource(client: PoolClient | typeof pool, questionId: string, language: string, lock = ""): Promise<AudioSource> {
  const question = await readQuestion(client, questionId, lock);
  const blocked = unavailable(question);
  if (blocked || !question) return { error: blocked ?? NOT_FOUND };
  if (language === SOURCE_LANGUAGE) return { question, texts: question.source, revision: null };
  const { rows } = await client.query<{ texts: unknown; revision: number; status: TranslationRow["status"]; current: boolean }>(
    `select t.texts, t.revision, t.status, (t.source = ${QUESTION_SOURCE_SQL}) as current
     from question_translations t join questions q on q.id = t.question_id
     where t.question_id = $1 and t.language = $2 ${lock ? `${lock} of t` : ""}`,
    [questionId, language]
  );
  const translation = rows[0];
  const texts = translation ? readTexts(translation.texts) : null;
  if (!translation || !texts || !translation.current || translation.status !== "checked") {
    return { error: "Audio can only be made from a checked, up-to-date translation. Check the translation first." };
  }
  return { question, texts, revision: translation.revision };
}

export async function generateQuestionAudio(session: SessionPayload, questionId: string, language: string): Promise<AudioResult> {
  const lang = voiceLanguage(language);
  if (!lang) return { ok: false, error: "Choose a language." };
  const source = await readAudioSource(pool, questionId, lang.code);
  if ("error" in source) return { ok: false, error: source.error };
  const blocked = await audioCanStart();
  if (blocked) return { ok: false, error: blocked };

  let speech: PageSpeech;
  try {
    const parts = questionReadingParts(source.texts.stem, source.texts.options.map((option) => option.text), lang, optionLetter, {
      pick: source.question.source.pick,
      areas: source.question.source.areas,
      tap: source.question.source.tap,
    });
    speech = await speakParts(session.sub, parts, lang.code);
  } catch (error) {
    return voiceFailure(error);
  }

  const path = `questions/${questionId}/${lang.code}-${crypto.randomUUID()}.mp3`;
  const storeError = await storeAudioFile(path, speech.mp3);
  if (storeError) return { ok: false, error: storeError };

  let outcome: { result: AudioResult; oldPath: string | null };
  try {
    outcome = await withTransaction(async (client) => {
      const current = await readAudioSource(client, questionId, lang.code, "for share");
      if ("error" in current) return { result: { ok: false, error: current.error } as AudioResult, oldPath: null };
      if (JSON.stringify(current.texts) !== JSON.stringify(source.texts) || current.revision !== source.revision) {
        const what = lang.code === SOURCE_LANGUAGE ? "question" : "translation";
        return { result: { ok: false, error: `The ${what} changed while the audio was being made. Please try again.` } as AudioResult, oldPath: null };
      }
      const { rows: old } = await client.query<{ storage_path: string }>(
        `select storage_path from question_audio where question_id = $1 and language = $2 for update`,
        [questionId, lang.code]
      );
      const { rows } = await client.query<AudioSummaryRow>(
        `with saved as (
           insert into question_audio (question_id, language, source, source_revision, storage_path, byte_size, duration_ms, provider, voice, created_by)
           select q.id, $2, ${QUESTION_SOURCE_SQL}, $3, $4, $5, $6, $7, $8, $9 from questions q where q.id = $1
           on conflict (question_id, language) do update
             set source = excluded.source, source_revision = excluded.source_revision, storage_path = excluded.storage_path,
                 byte_size = excluded.byte_size, duration_ms = excluded.duration_ms, mime_type = excluded.mime_type,
                 provider = excluded.provider, voice = excluded.voice, created_by = excluded.created_by, created_at = now()
           returning *)
         select ${AUDIO_COLUMNS} from saved a join questions q on q.id = a.question_id`,
        [questionId, lang.code, source.revision, path, speech.mp3.byteLength, Math.max(1, speech.durationMs), speech.provider, speech.voice, session.sub]
      );
      await logActivity(client, session, "question_audio.generated", target(questionId, current.question), {
        language: lang.name,
        length: formatDuration(Math.max(1, Math.round(speech.durationMs / 1000))),
      });
      return { result: { ok: true, audio: toAudioSummary(rows[0]) } as AudioResult, oldPath: old[0]?.storage_path ?? null };
    });
  } catch (error) {
    await deleteAudioFilesQuietly([path]);
    throw error;
  }

  if (!outcome.result.ok) await deleteAudioFilesQuietly([path]);
  else if (outcome.oldPath) await deleteAudioFilesQuietly([outcome.oldPath]);
  return outcome.result;
}

// Works for any question that has audio (even one since removed from the Handbook).
export async function deleteQuestionAudio(session: SessionPayload, questionId: string, language: string): Promise<AudioDeleteResult> {
  const lang = voiceLanguage(language);
  if (!lang) return { ok: false, error: "Choose a language." };
  const result = await withTransaction<{ ok: false; error: string } | { ok: true; path: string }>(async (client) => {
    const question = await readQuestion(client, questionId, "for share");
    if (!question) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<{ storage_path: string }>(
      `delete from question_audio where question_id = $1 and language = $2 returning storage_path`,
      [questionId, lang.code]
    );
    if (!rows[0]) return { ok: false, error: "This audio has already been deleted." };
    await logActivity(client, session, "question_audio.deleted", target(questionId, question), { language: lang.name });
    return { ok: true, path: rows[0].storage_path };
  });
  if (!result.ok) return result;
  await deleteAudioFilesQuietly([result.path]);
  return { ok: true };
}

export async function questionAudioPreviewLink(questionId: string, language: string): Promise<AudioLinkResult> {
  if (!voiceLanguage(language)) return audioFileLink(undefined);
  const { rows } = await pool.query<{ storage_path: string }>(`select storage_path from question_audio where question_id = $1 and language = $2`, [
    questionId,
    language,
  ]);
  return audioFileLink(rows[0]?.storage_path);
}

// The storage paths of a question's audio, read before the question is deleted (its rows go with it).
export async function questionAudioPaths(client: PoolClient, questionId: string): Promise<string[]> {
  const { rows } = await client.query<{ storage_path: string }>(`select storage_path from question_audio where question_id = $1`, [questionId]);
  return rows.map((row) => row.storage_path);
}

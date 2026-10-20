import { pool } from "@/lib/db/pool";
import { escapeLike } from "@/lib/db/like";
import { chapterNumber } from "@/lib/handbook/structure";
import { parseQuestionRef, questionLogLabel } from "@/lib/questions/labels";
import { SOURCE_LANGUAGE, VOICE_LANGUAGES, voiceLanguage } from "./languages";
import { QUESTION_CURRENT_VERSION, VOICE_QUESTION_TYPES } from "./question-listen";
import { QUESTION_SOURCE_SQL } from "./question-voice";
import { audioState, translationState, type AudioState, type TranslationState } from "./status";

// Server-only: the Handbook-wide list of text pages and question pages with each language's translation and
// audio state (V4, questions from V6a). Filtering happens in SQL so the list can be paged; the states shown come
// from status.ts. The two must agree (checked by the tests). Question types without Listen yet show "Comes later".

export const LANGUAGE_LIST_PAGE_SIZE = 50;

export const LANGUAGE_NEEDS = ["translate", "check", "audio", "done"] as const;
export type LanguageNeed = (typeof LANGUAGE_NEEDS)[number];
export const LANGUAGE_NEED_LABELS: Record<LanguageNeed, string> = {
  translate: "Needs translating",
  check: "Needs checking",
  audio: "Needs audio",
  done: "All done",
};

export const LANGUAGE_KINDS = ["page", "question"] as const;
export type LanguageKind = (typeof LANGUAGE_KINDS)[number];
export const LANGUAGE_KIND_LABELS: Record<LanguageKind, string> = { page: "Text pages", question: "Question pages" };

export type LanguageFilters = {
  search: string;
  chapterId: string | null;
  language: string | null;
  need: LanguageNeed | null;
  kind: LanguageKind | null;
};
export type PageLanguageState = { translation: TranslationState | null; audio: AudioState; durationMs: number | null };
export type LanguageListRow = {
  kind: LanguageKind;
  id: string;
  title: string;
  status: "draft" | "published";
  chapterLabel: string;
  // null: a question type without Listen yet.
  states: Record<string, PageLanguageState> | null;
};
export type LanguageTotals = { language: string; checked: number; audioReady: number };
export type LanguageCounts = { pages: number; questions: number; listenable: number };

export function isLanguageNeed(value: unknown): value is LanguageNeed {
  return LANGUAGE_NEEDS.includes(value as LanguageNeed);
}

export function isLanguageKind(value: unknown): value is LanguageKind {
  return LANGUAGE_KINDS.includes(value as LanguageKind);
}

// One row per item and language with its translation state (t) and audio state (a), mirroring status.ts.
// $1: language codes; $2: question types with Listen.
const STATES = `
  with langs(code) as (select unnest($1::text[])),
  page_base as (
    select p.id as item_id, l.code,
           case when l.code = '${SOURCE_LANGUAGE}' then null
                when t.content_page_id is null then 'missing'
                when t.source_version <> p.content_version then 'outdated'
                else t.status::text end as t,
           case when l.code = '${SOURCE_LANGUAGE}' then p.content_version
                when t.content_page_id is not null and t.source_version = p.content_version and t.status = 'checked' then t.revision
                end as source,
           a.source_version as audio_version, a.content_page_id is not null as has_audio
    from content_pages p
    cross join langs l
    left join page_translations t on t.content_page_id = p.id and t.language = l.code
    left join page_audio a on a.content_page_id = p.id and a.language = l.code
  ),
  question_base as (
    select q.id as item_id, l.code,
           case when l.code = '${SOURCE_LANGUAGE}' then null
                when t.question_id is null then 'missing'
                when t.source <> ${QUESTION_SOURCE_SQL} then 'outdated'
                else t.status::text end as t,
           case when l.code = '${SOURCE_LANGUAGE}' then ${QUESTION_CURRENT_VERSION}
                when t.question_id is not null and t.source = ${QUESTION_SOURCE_SQL} and t.status = 'checked' then t.revision
                end as source,
           case when a.source <> ${QUESTION_SOURCE_SQL} then 0
                when l.code = '${SOURCE_LANGUAGE}' then ${QUESTION_CURRENT_VERSION}
                else a.source_revision end as audio_version,
           a.question_id is not null as has_audio
    from handbook_items i
    join questions q on q.id = i.question_id and q.type = any($2::text[])
    cross join langs l
    left join question_translations t on t.question_id = q.id and t.language = l.code
    left join question_audio a on a.question_id = q.id and a.language = l.code
  ),
  states as (
    select item_id, code, t, source is not null as can_make,
           case when not has_audio then case when source is null then 'waiting' else 'missing' end
                when source is not null and audio_version = source then 'ready'
                else 'outdated' end as a
    from (select * from page_base union all select * from question_base) base
  ),
  items as (
    select 'page'::text as kind, p.id, p.title, null::integer as ref_no, null::text as type, p.status::text as status,
           p.chapter_id, i.position, true as supported, p.content_version
    from content_pages p left join handbook_items i on i.content_page_id = p.id
    union all
    select 'question', q.id, q.stem_text, q.ref_no, q.type, q.status::text, i.chapter_id, i.position, q.type = any($2::text[]), q.content_version
    from handbook_items i join questions q on q.id = i.question_id
  )`;

// Which language rows an item needs to match, for the chosen need (any chosen language, or every one for "All done").
function needCondition(need: LanguageNeed | null): string {
  switch (need) {
    case "translate":
      return `exists (select 1 from states s where s.item_id = x.id and s.t in ('missing', 'outdated'))`;
    case "check":
      return `exists (select 1 from states s where s.item_id = x.id and s.t = 'draft')`;
    case "audio":
      return `exists (select 1 from states s where s.item_id = x.id and s.a in ('missing', 'outdated') and s.can_make)`;
    case "done":
      return `x.supported and not exists (select 1 from states s where s.item_id = x.id and (s.a <> 'ready' or coalesce(s.t, 'checked') <> 'checked'))`;
    default:
      return "true";
  }
}

function where(filters: LanguageFilters, params: unknown[]): string {
  const parts = [needCondition(filters.need)];
  if (filters.search) {
    params.push(`%${escapeLike(filters.search)}%`);
    const text = `x.title ilike $${params.length}`;
    const ref = parseQuestionRef(filters.search);
    if (ref === null) parts.push(text);
    else {
      params.push(ref);
      parts.push(`(${text} or x.ref_no = $${params.length})`);
    }
  }
  if (filters.chapterId) {
    params.push(filters.chapterId);
    parts.push(`x.chapter_id = $${params.length}`);
  }
  if (filters.kind) {
    params.push(filters.kind);
    parts.push(`x.kind = $${params.length}`);
  }
  return parts.join(" and ");
}

function baseParams(filters: LanguageFilters | null): unknown[] {
  const chosen = filters?.language ? voiceLanguage(filters.language) : null;
  return [chosen ? [chosen.code] : VOICE_LANGUAGES.map((language) => language.code), [...VOICE_QUESTION_TYPES]];
}

export async function countLanguageItems(filters: LanguageFilters): Promise<number> {
  const params = baseParams(filters);
  const condition = where(filters, params);
  const { rows } = await pool.query<{ total: number }>(`${STATES} select count(*)::int as total from items x where ${condition}`, params);
  return rows[0].total;
}

// Text pages, question pages in the Handbook, and how many of them can have Listen today.
export async function countAllLanguageItems(): Promise<LanguageCounts> {
  const { rows } = await pool.query<{ pages: number; questions: number; listenable: number }>(
    `select (select count(*) from content_pages)::int as pages,
            (select count(*) from handbook_items where question_id is not null)::int as questions,
            ((select count(*) from content_pages)
             + (select count(*) from handbook_items i join questions q on q.id = i.question_id where q.type = any($1::text[])))::int as listenable`,
    [[...VOICE_QUESTION_TYPES]]
  );
  return rows[0];
}

// How many items have a checked, up-to-date translation and ready audio, per language (whole Handbook).
export async function languageTotals(): Promise<LanguageTotals[]> {
  const { rows } = await pool.query<{ code: string; checked: number; ready: number }>(
    `${STATES}
     select code, count(*) filter (where t = 'checked')::int as checked, count(*) filter (where a = 'ready')::int as ready
     from states group by code`,
    baseParams(null)
  );
  return VOICE_LANGUAGES.map((language) => {
    const row = rows.find((found) => found.code === language.code);
    return { language: language.code, checked: row?.checked ?? 0, audioReady: row?.ready ?? 0 };
  });
}

type RawRow = {
  kind: LanguageKind;
  id: string;
  title: string;
  ref_no: number | null;
  status: "draft" | "published";
  supported: boolean;
  content_version: number;
  number: number | null;
  chapter_title: string;
  // Questions: source_version is 1 when made from the current English, 0 otherwise (as the editor shows it).
  translations: { language: string; source_version: number; revision: number; status: "draft" | "checked" }[];
  audio: { language: string; source_version: number; duration_ms: number }[];
};

const EXCERPT_LENGTH = 90;

// Pages and question pages in book order (section, chapter, place in the chapter).
export async function listLanguageItems(filters: LanguageFilters, page: number): Promise<LanguageListRow[]> {
  const params = baseParams(filters);
  const condition = where(filters, params);
  params.push(LANGUAGE_LIST_PAGE_SIZE, (page - 1) * LANGUAGE_LIST_PAGE_SIZE);
  const { rows } = await pool.query<RawRow>(
    `${STATES},
     numbered as (
       select c.id, c.title, s.position as section_position, c.position,
              row_number() over (order by s.position, c.position)::int as number
       from chapters c join sections s on s.id = c.section_id
     )
     select x.kind, x.id, x.title, x.ref_no, x.status, x.supported, x.content_version, n.number, n.title as chapter_title,
            case when x.kind = 'page' then
              coalesce((select json_agg(json_build_object('language', t.language, 'source_version', t.source_version,
                                                          'revision', t.revision, 'status', t.status))
                        from page_translations t where t.content_page_id = x.id), '[]')
            else
              coalesce((select json_agg(json_build_object('language', t.language,
                                                          'source_version', case when t.source = ${QUESTION_SOURCE_SQL} then ${QUESTION_CURRENT_VERSION} else 0 end,
                                                          'revision', t.revision, 'status', t.status))
                        from question_translations t join questions q on q.id = t.question_id where t.question_id = x.id), '[]')
            end as translations,
            case when x.kind = 'page' then
              coalesce((select json_agg(json_build_object('language', a.language, 'source_version', a.source_version,
                                                          'duration_ms', a.duration_ms))
                        from page_audio a where a.content_page_id = x.id), '[]')
            else
              coalesce((select json_agg(json_build_object('language', a.language,
                                                          'source_version', case when a.source <> ${QUESTION_SOURCE_SQL} then 0
                                                                                 when a.language = '${SOURCE_LANGUAGE}' then ${QUESTION_CURRENT_VERSION}
                                                                                 else a.source_revision end,
                                                          'duration_ms', a.duration_ms))
                        from question_audio a join questions q on q.id = a.question_id where a.question_id = x.id), '[]')
            end as audio
     from items x
     join numbered n on n.id = x.chapter_id
     where ${condition}
     order by n.section_position, n.position, x.position nulls last, x.title, x.id
     limit $${params.length - 1} offset $${params.length}`,
    params
  );
  return rows.map((row) => {
    const version = row.kind === "page" ? row.content_version : QUESTION_CURRENT_VERSION;
    let states: Record<string, PageLanguageState> | null = null;
    if (row.supported) {
      states = {};
      for (const language of VOICE_LANGUAGES) {
        const isSource = language.code === SOURCE_LANGUAGE;
        const found = row.translations.find((t) => t.language === language.code);
        const translation = found ? { sourceVersion: found.source_version, revision: found.revision, status: found.status } : null;
        const audio = row.audio.find((a) => a.language === language.code);
        states[language.code] = {
          translation: isSource ? null : translationState(version, translation),
          audio: audioState(isSource, version, translation, audio ? { sourceVersion: audio.source_version } : null),
          durationMs: audio?.duration_ms ?? null,
        };
      }
    }
    return {
      kind: row.kind,
      id: row.id,
      title: row.kind === "page" ? row.title : questionLogLabel(row.ref_no ?? 0, row.title, EXCERPT_LENGTH),
      status: row.status,
      chapterLabel: `${row.number === null ? "" : `${chapterNumber(row.number)} `}${row.chapter_title}`,
      states,
    };
  });
}

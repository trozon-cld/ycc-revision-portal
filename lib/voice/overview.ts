import { pool } from "@/lib/db/pool";
import { escapeLike } from "@/lib/db/like";
import { chapterNumber } from "@/lib/handbook/structure";
import { SOURCE_LANGUAGE, VOICE_LANGUAGES, voiceLanguage } from "./languages";
import { audioState, translationState, type AudioState, type TranslationState } from "./status";

// Server-only: the Handbook-wide list of text pages with each language's translation and audio state (V4).
// Filtering happens in SQL so the list can be paged; the states shown come from status.ts. The two must agree
// (checked by the V4 tests).

export const LANGUAGE_LIST_PAGE_SIZE = 50;

export const LANGUAGE_NEEDS = ["translate", "check", "audio", "done"] as const;
export type LanguageNeed = (typeof LANGUAGE_NEEDS)[number];
export const LANGUAGE_NEED_LABELS: Record<LanguageNeed, string> = {
  translate: "Needs translating",
  check: "Needs checking",
  audio: "Needs audio",
  done: "All done",
};

export type LanguageFilters = { search: string; chapterId: string | null; language: string | null; need: LanguageNeed | null };
export type PageLanguageState = { translation: TranslationState | null; audio: AudioState; durationMs: number | null };
export type LanguageListRow = {
  id: string;
  title: string;
  status: "draft" | "published";
  chapterLabel: string;
  states: Record<string, PageLanguageState>;
};
export type LanguageTotals = { language: string; checked: number; audioReady: number };

export function isLanguageNeed(value: unknown): value is LanguageNeed {
  return LANGUAGE_NEEDS.includes(value as LanguageNeed);
}

// One row per page and language with its translation state (t) and audio state (a), mirroring status.ts.
const STATES = `
  with langs(code) as (select unnest($1::text[])),
  base as (
    select p.id as page_id, l.code,
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
  states as (
    select page_id, code, t, source is not null as can_make,
           case when not has_audio then case when source is null then 'waiting' else 'missing' end
                when source is not null and audio_version = source then 'ready'
                else 'outdated' end as a
    from base
  )`;

// Which language rows a page needs to match, for the chosen need (any chosen language, or every one for "All done").
function needCondition(need: LanguageNeed | null): string {
  switch (need) {
    case "translate":
      return `exists (select 1 from states s where s.page_id = p.id and s.t in ('missing', 'outdated'))`;
    case "check":
      return `exists (select 1 from states s where s.page_id = p.id and s.t = 'draft')`;
    case "audio":
      return `exists (select 1 from states s where s.page_id = p.id and s.a in ('missing', 'outdated') and s.can_make)`;
    case "done":
      return `not exists (select 1 from states s where s.page_id = p.id and (s.a <> 'ready' or coalesce(s.t, 'checked') <> 'checked'))`;
    default:
      return "true";
  }
}

function where(filters: LanguageFilters, params: unknown[]): string {
  const parts = [needCondition(filters.need)];
  if (filters.search) {
    params.push(`%${escapeLike(filters.search)}%`);
    parts.push(`p.title ilike $${params.length}`);
  }
  if (filters.chapterId) {
    params.push(filters.chapterId);
    parts.push(`p.chapter_id = $${params.length}`);
  }
  return parts.join(" and ");
}

function languagesFor(filters: LanguageFilters): string[] {
  const chosen = filters.language ? voiceLanguage(filters.language) : null;
  return chosen ? [chosen.code] : VOICE_LANGUAGES.map((language) => language.code);
}

export async function countLanguagePages(filters: LanguageFilters): Promise<number> {
  const params: unknown[] = [languagesFor(filters)];
  const condition = where(filters, params);
  const { rows } = await pool.query<{ total: number }>(`${STATES} select count(*)::int as total from content_pages p where ${condition}`, params);
  return rows[0].total;
}

export async function countAllTextPages(): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(`select count(*)::int as total from content_pages`);
  return rows[0].total;
}

// How many pages have a checked, up-to-date translation and ready audio, per language (whole Handbook).
export async function languageTotals(): Promise<LanguageTotals[]> {
  const { rows } = await pool.query<{ code: string; checked: number; ready: number }>(
    `${STATES}
     select code, count(*) filter (where t = 'checked')::int as checked, count(*) filter (where a = 'ready')::int as ready
     from states group by code`,
    [VOICE_LANGUAGES.map((language) => language.code)]
  );
  return VOICE_LANGUAGES.map((language) => {
    const row = rows.find((found) => found.code === language.code);
    return { language: language.code, checked: row?.checked ?? 0, audioReady: row?.ready ?? 0 };
  });
}

type RawRow = {
  id: string;
  title: string;
  status: "draft" | "published";
  content_version: number;
  number: number | null;
  chapter_title: string;
  translations: { language: string; source_version: number; revision: number; status: "draft" | "checked" }[];
  audio: { language: string; source_version: number; duration_ms: number }[];
};

// Pages in book order (section, chapter, place in the chapter).
export async function listLanguagePages(filters: LanguageFilters, page: number): Promise<LanguageListRow[]> {
  const params: unknown[] = [languagesFor(filters)];
  const condition = where(filters, params);
  params.push(LANGUAGE_LIST_PAGE_SIZE, (page - 1) * LANGUAGE_LIST_PAGE_SIZE);
  const { rows } = await pool.query<RawRow>(
    `${STATES},
     numbered as (
       select c.id, c.title, s.position as section_position, c.position,
              row_number() over (order by s.position, c.position)::int as number
       from chapters c join sections s on s.id = c.section_id
     )
     select p.id, p.title, p.status, p.content_version, n.number, n.title as chapter_title,
            coalesce((select json_agg(json_build_object('language', t.language, 'source_version', t.source_version,
                                                        'revision', t.revision, 'status', t.status))
                      from page_translations t where t.content_page_id = p.id), '[]') as translations,
            coalesce((select json_agg(json_build_object('language', a.language, 'source_version', a.source_version,
                                                        'duration_ms', a.duration_ms))
                      from page_audio a where a.content_page_id = p.id), '[]') as audio
     from content_pages p
     join numbered n on n.id = p.chapter_id
     left join handbook_items i on i.content_page_id = p.id
     where ${condition}
     order by n.section_position, n.position, i.position nulls last, p.title, p.id
     limit $${params.length - 1} offset $${params.length}`,
    params
  );
  return rows.map((row) => {
    const states: Record<string, PageLanguageState> = {};
    for (const language of VOICE_LANGUAGES) {
      const isSource = language.code === SOURCE_LANGUAGE;
      const found = row.translations.find((t) => t.language === language.code);
      const translation = found ? { sourceVersion: found.source_version, revision: found.revision, status: found.status } : null;
      const audio = row.audio.find((a) => a.language === language.code);
      states[language.code] = {
        translation: isSource ? null : translationState(row.content_version, translation),
        audio: audioState(isSource, row.content_version, translation, audio ? { sourceVersion: audio.source_version } : null),
        durationMs: audio?.duration_ms ?? null,
      };
    }
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      chapterLabel: `${row.number === null ? "" : `${chapterNumber(row.number)} `}${row.chapter_title}`,
      states,
    };
  });
}

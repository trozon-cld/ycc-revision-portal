import { cache } from "react";
import { pool } from "@/lib/db/pool";
import { SOURCE_LANGUAGE, toVoiceLanguage, type LanguageStatus, type VoiceLanguage } from "./languages";

// Server-only. Which languages a part of the app works with:
// candidate = live (what candidates can choose and hear); staff = draft and live (translations and audio can be
// prepared before a language goes live); any = every language, hidden too (names in logs and details, deleting audio).
export type LanguageScope = "candidate" | "staff" | "any";

const STATUSES: Record<LanguageScope, LanguageStatus[]> = {
  candidate: ["live"],
  staff: ["draft", "live"],
  any: ["draft", "live", "hidden"],
};

type LanguageRow = { code: string; name: string; native_name: string; status: LanguageStatus; phrases: Record<string, string> };

// English first, then A–Z by name. A language missing any phrase is left out (it can't be read aloud).
const readLanguages = cache(async (scope: LanguageScope): Promise<VoiceLanguage[]> => {
  const { rows } = await pool.query<LanguageRow>(
    `select l.code, l.name, l.native_name, l.status,
            coalesce(json_object_agg(p.phrase, p.text) filter (where p.phrase is not null), '{}') as phrases
     from voice_languages l
     left join voice_phrases p on p.language = l.code
     where l.status = any($1::text[])
     group by l.code`,
    [STATUSES[scope]]
  );
  const languages: VoiceLanguage[] = [];
  for (const row of rows) {
    const language = toVoiceLanguage(row, row.phrases);
    if (language) languages.push(language);
    else if (row.status === "live") console.warn(`Voice language ${row.code} is missing a spoken phrase and is left out`);
  }
  return languages.sort((a, b) => Number(b.code === SOURCE_LANGUAGE) - Number(a.code === SOURCE_LANGUAGE) || a.name.localeCompare(b.name, "en"));
});

export async function loadVoiceLanguages(scope: LanguageScope = "staff"): Promise<VoiceLanguage[]> {
  return readLanguages(scope);
}

export async function findVoiceLanguage(code: unknown, scope: LanguageScope = "staff"): Promise<VoiceLanguage | null> {
  if (typeof code !== "string") return null;
  return (await readLanguages(scope)).find((language) => language.code === code) ?? null;
}

export async function isTranslatedLanguage(code: unknown, scope: LanguageScope = "staff"): Promise<boolean> {
  return code !== SOURCE_LANGUAGE && (await findVoiceLanguage(code, scope)) !== null;
}

// English, which always exists and is always live (the database insists).
export async function sourceLanguage(): Promise<VoiceLanguage> {
  const found = await findVoiceLanguage(SOURCE_LANGUAGE);
  if (!found) throw new Error("The English voice language is missing a spoken phrase");
  return found;
}

// A language's English name for logs and details (hidden ones too); the code if it is unknown.
export async function languageName(code: string): Promise<string> {
  return (await findVoiceLanguage(code, "any"))?.name ?? code;
}

// ---- What a category offers (0035) ----

export type ListenMode = "off" | "all" | "chosen";
export type CategoryListen = { mode: ListenMode; chosen: string[] };

const readCategoryListen = cache(async (categoryId: string): Promise<CategoryListen | null> => {
  const { rows } = await pool.query<{ listen_mode: ListenMode; chosen: string[] }>(
    `select c.listen_mode, array(select cl.language from category_languages cl where cl.category_id = c.id order by cl.language) as chosen
     from categories c where c.id = $1`,
    [categoryId]
  );
  return rows[0] ? { mode: rows[0].listen_mode, chosen: rows[0].chosen } : null;
});

export async function categoryListen(categoryId: string): Promise<CategoryListen | null> {
  return readCategoryListen(categoryId);
}

// Whether a category offers this language: never while Listen is off; English always; otherwise all, or its chosen ones.
export function categoryOffers(listen: CategoryListen | null, code: string): boolean {
  if (!listen || listen.mode === "off") return false;
  return code === SOURCE_LANGUAGE || listen.mode === "all" || listen.chosen.includes(code);
}

// The live languages candidates in this category can choose (none while Listen is off).
export async function offeredLanguages(categoryId: string): Promise<VoiceLanguage[]> {
  const [listen, live] = await Promise.all([readCategoryListen(categoryId), loadVoiceLanguages("candidate")]);
  return live.filter((language) => categoryOffers(listen, language.code));
}

// What a candidate hears in a category: their choice while it is live and offered there, otherwise English.
export async function listeningLanguageIn(code: string | null | undefined, categoryId: string): Promise<VoiceLanguage> {
  const listen = await readCategoryListen(categoryId);
  if (code && categoryOffers(listen, code)) {
    const found = await findVoiceLanguage(code, "candidate");
    if (found) return found;
  }
  return sourceLanguage();
}

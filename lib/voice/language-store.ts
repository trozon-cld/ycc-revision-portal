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

type LanguageRow = { code: string; name: string; native_name: string; status: LanguageStatus; translator_note: string | null; phrases: Record<string, string> };

// English first, then A–Z by name. A language missing any phrase is left out (it can't be read aloud).
const readLanguages = cache(async (scope: LanguageScope): Promise<VoiceLanguage[]> => {
  const { rows } = await pool.query<LanguageRow>(
    `select l.code, l.name, l.native_name, l.status, l.translator_note,
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

// What a candidate hears in: their chosen language while it is live, otherwise English.
export async function listeningLanguage(code: string | null | undefined): Promise<VoiceLanguage> {
  return (await findVoiceLanguage(code, "candidate")) ?? sourceLanguage();
}

// A language's English name for logs and details (hidden ones too); the code if it is unknown.
export async function languageName(code: string): Promise<string> {
  return (await findVoiceLanguage(code, "any"))?.name ?? code;
}

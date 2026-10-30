import { cache } from "react";
import { pool } from "@/lib/db/pool";
import { SOURCE_LANGUAGE, toVoiceLanguage, type LanguageStatus, type VoiceLanguage } from "./languages";

// Server-only. candidate = live (what candidates choose and hear); staff = draft and live (prepared before going
// live); any = hidden too (names in logs and details, deleting audio).
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

// ---- What a test type offers (0035) ----

export type ListenMode = "off" | "all" | "chosen";
export type TestTypeListen = { mode: ListenMode; chosen: string[] };

const readTestTypeListen = cache(async (testTypeId: string): Promise<TestTypeListen | null> => {
  const { rows } = await pool.query<{ listen_mode: ListenMode; chosen: string[] }>(
    `select c.listen_mode, array(select cl.language from test_type_languages cl where cl.test_type_id = c.id order by cl.language) as chosen
     from test_types c where c.id = $1`,
    [testTypeId]
  );
  return rows[0] ? { mode: rows[0].listen_mode, chosen: rows[0].chosen } : null;
});

export async function testTypeListen(testTypeId: string): Promise<TestTypeListen | null> {
  return readTestTypeListen(testTypeId);
}

// Whether a test type offers this language: never while Listen is off; English always; otherwise all, or its chosen ones.
export function testTypeOffers(listen: TestTypeListen | null, code: string): boolean {
  if (!listen || listen.mode === "off") return false;
  return code === SOURCE_LANGUAGE || listen.mode === "all" || listen.chosen.includes(code);
}

// The live languages candidates in this test type can choose (none while Listen is off).
export async function offeredLanguages(testTypeId: string): Promise<VoiceLanguage[]> {
  const [listen, live] = await Promise.all([readTestTypeListen(testTypeId), loadVoiceLanguages("candidate")]);
  return live.filter((language) => testTypeOffers(listen, language.code));
}

// What a candidate hears in a test type: their choice while it is live and offered there, otherwise English.
export async function listeningLanguageIn(code: string | null | undefined, testTypeId: string): Promise<VoiceLanguage> {
  const listen = await readTestTypeListen(testTypeId);
  if (code && testTypeOffers(listen, code)) {
    const found = await findVoiceLanguage(code, "candidate");
    if (found) return found;
  }
  return sourceLanguage();
}

import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { countOf } from "@/lib/format";
import { catalogueEntry } from "./language-catalogue";
import { phraseKeysFor, SOURCE_LANGUAGE, type LanguageStatus, type PhraseKey } from "./languages";
import { translateItems, voiceFailure } from "./make";
import { deleteAudioFilesQuietly } from "./audio-files";
import { checkPhraseTexts, PHRASE_INFO, type PhraseTexts } from "./phrases";

// Server-only: Manage languages (L2). Reads the database directly (not the per-request language cache), so a page
// shown straight after a change sees it. Every change is logged in the same transaction.

export type ManagedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  status: LanguageStatus;
  phrases: number;
  checked: number;
  // Candidates whose listening language this is.
  candidates: number;
};

export type PhraseRow = { text: string; status: "draft" | "checked"; checkedAt: string | null };

export type LanguagePhrases = {
  language: ManagedLanguage;
  english: PhraseTexts;
  phrases: Partial<Record<PhraseKey, PhraseRow>>;
};

// What the editor loaded; a change is refused if the stored phrases differ meanwhile.
export type ExpectedPhrases = Partial<Record<PhraseKey, string>>;

export type LanguageResult = { ok: true; message?: string } | { ok: false; error: string; conflict?: boolean };

const NOT_FOUND = "This language isn't in the list any more.";
const CONFLICT = "Someone else changed these phrases meanwhile. Reload the page to see their version.";

type LanguageDbRow = { code: string; name: string; native_name: string; status: LanguageStatus };

function toManaged(row: LanguageDbRow & { phrases: number; checked: number; candidates: number }): ManagedLanguage {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    status: row.status,
    phrases: row.phrases,
    checked: row.checked,
    candidates: row.candidates,
  };
}

const MANAGED_SELECT = `
  select l.code, l.name, l.native_name, l.status,
         (select count(*) from voice_phrases p where p.language = l.code)::int as phrases,
         (select count(*) from voice_phrases p where p.language = l.code and p.status = 'checked')::int as checked,
         (select count(*) from users u where u.role = 'candidate' and u.preferred_language = l.code)::int as candidates
  from voice_languages l`;

// English first, then A–Z, hidden ones last.
export async function listManagedLanguages(): Promise<ManagedLanguage[]> {
  const { rows } = await pool.query<LanguageDbRow & { phrases: number; checked: number; candidates: number }>(MANAGED_SELECT);
  return rows
    .map(toManaged)
    .sort(
      (a, b) =>
        Number(b.code === SOURCE_LANGUAGE) - Number(a.code === SOURCE_LANGUAGE) ||
        Number(a.status === "hidden") - Number(b.status === "hidden") ||
        a.name.localeCompare(b.name, "en")
    );
}

export async function loadLanguagePhrases(code: string): Promise<LanguagePhrases | null> {
  const { rows } = await pool.query<LanguageDbRow & { phrases: number; checked: number; candidates: number }>(`${MANAGED_SELECT} where l.code = $1`, [code]);
  if (!rows[0]) return null;
  const { rows: phraseRows } = await pool.query<{ language: string; phrase: PhraseKey; text: string; status: "draft" | "checked"; checked_at: Date | null }>(
    `select language, phrase, text, status, checked_at from voice_phrases where language = any($1::text[])`,
    [[code, SOURCE_LANGUAGE]]
  );
  const english = {} as PhraseTexts;
  const phrases: Partial<Record<PhraseKey, PhraseRow>> = {};
  for (const row of phraseRows) {
    if (row.language === SOURCE_LANGUAGE) english[row.phrase] = row.text;
    if (row.language === code) phrases[row.phrase] = { text: row.text, status: row.status, checkedAt: row.checked_at?.toISOString() ?? null };
  }
  return { language: toManaged(rows[0]), english, phrases };
}

async function lockLanguage(client: PoolClient, code: string): Promise<LanguageDbRow | null> {
  const { rows } = await client.query<LanguageDbRow>(
    `select code, name, native_name, status from voice_languages where code = $1 for update`,
    [code]
  );
  return rows[0] ?? null;
}

async function lockPhrases(client: PoolClient, code: string): Promise<Map<PhraseKey, { text: string; status: string }>> {
  const { rows } = await client.query<{ phrase: PhraseKey; text: string; status: string }>(
    `select phrase, text, status from voice_phrases where language = $1 for update`,
    [code]
  );
  return new Map(rows.map((row) => [row.phrase, { text: row.text, status: row.status }]));
}

function matchesExpected(code: string, stored: Map<PhraseKey, { text: string }>, expected: ExpectedPhrases): boolean {
  return phraseKeysFor(code).every((key) => (stored.get(key)?.text ?? "") === (expected[key] ?? ""));
}

function target(language: { name: string }) {
  return { type: "language" as const, id: null, label: language.name };
}

async function writePhrases(client: PoolClient, code: string, texts: Partial<PhraseTexts>, userId: string) {
  for (const [phrase, text] of Object.entries(texts)) {
    await client.query(
      `insert into voice_phrases (language, phrase, text, status, updated_by)
       values ($1, $2, $3, 'draft', $4)
       on conflict (language, phrase) do update
         set text = excluded.text, status = 'draft', checked_by = null, checked_at = null, updated_by = excluded.updated_by, updated_at = now()`,
      [code, phrase, text, userId]
    );
  }
}

// Adds a language from the built-in list as a draft (no phrases yet).
export async function addLanguage(session: SessionPayload, code: string): Promise<LanguageResult> {
  const entry = catalogueEntry(code);
  if (!entry) return { ok: false, error: "Choose a language from the list." };
  return withTransaction<LanguageResult>(async (client) => {
    const { rowCount } = await client.query(
      `insert into voice_languages (code, name, native_name, status, created_by)
       values ($1, $2, $3, 'draft', $4) on conflict (code) do nothing`,
      [entry.code, entry.name, entry.nativeName, session.sub]
    );
    if (!rowCount) return { ok: false, error: `${entry.name} has already been added.` };
    await logActivity(client, session, "language.added", target(entry), {});
    return { ok: true, message: `${entry.name} added. Next, draft its spoken phrases.` };
  });
}

// The voice service translates the English phrases into the language; all of them become drafts.
export async function draftPhrases(session: SessionPayload, code: string, expected: ExpectedPhrases): Promise<LanguageResult> {
  if (code === SOURCE_LANGUAGE) return { ok: false, error: "English is the source and isn't drafted." };
  const view = await loadLanguagePhrases(code);
  if (!view) return { ok: false, error: NOT_FOUND };
  if (view.language.status === "hidden") return { ok: false, error: "Show this language again before changing its phrases." };
  const keys = phraseKeysFor(code);
  if (keys.some((key) => !view.english[key])) return { ok: false, error: "The English phrases are incomplete." };

  let texts: PhraseTexts;
  try {
    const { items } = await translateItems(
      session.sub,
      keys.map((key) => ({ id: key, texts: [view.english[key] ?? ""] })),
      { code, name: view.language.name, nativeName: view.language.nativeName },
      "phrases"
    );
    const checked = checkPhraseTexts(Object.fromEntries(items.map((item) => [item.id, item.texts[0]])), keys);
    if (!checked.ok) return { ok: false, error: `The voice service's draft wasn't usable (${checked.error}) Nothing was saved. Please try again.` };
    texts = checked.texts;
  } catch (error) {
    return voiceFailure(error);
  }

  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    if (language.status === "hidden") return { ok: false, error: "Show this language again before changing its phrases." };
    if (!matchesExpected(code, await lockPhrases(client, code), expected)) return { ok: false, error: CONFLICT, conflict: true };
    await writePhrases(client, code, texts, session.sub);
    await logActivity(client, session, "language.phrases_drafted", target(language), {});
    return { ok: true, message: `${language.name} phrases drafted. Read them through, correct them, then mark them as checked.` };
  });
}

// Saves corrected phrases; each changed one goes back to draft. Nothing is logged when nothing changed.
export async function savePhrases(session: SessionPayload, code: string, expected: ExpectedPhrases, input: unknown): Promise<LanguageResult> {
  const keys = phraseKeysFor(code);
  const checked = checkPhraseTexts(input, keys);
  if (!checked.ok) return checked;
  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    if (language.status === "hidden") return { ok: false, error: "Show this language again before changing its phrases." };
    const stored = await lockPhrases(client, code);
    if (!matchesExpected(code, stored, expected)) return { ok: false, error: CONFLICT, conflict: true };
    const changed = keys.filter((key) => stored.get(key)?.text !== checked.texts[key]);
    if (changed.length === 0) return { ok: true, message: "No changes to save." };
    await writePhrases(client, code, Object.fromEntries(changed.map((key) => [key, checked.texts[key]])), session.sub);
    await logActivity(client, session, "language.phrases_edited", target(language), {
      items: `Changed: ${changed.map((key) => PHRASE_INFO[key].label).join(", ")}`,
    });
    return { ok: true, message: "Phrases saved. Changed phrases are drafts until they're checked." };
  });
}

// Marks every phrase as checked (all of the language's phrases must be there).
export async function checkPhrases(session: SessionPayload, code: string, expected: ExpectedPhrases): Promise<LanguageResult> {
  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    const stored = await lockPhrases(client, code);
    if (!matchesExpected(code, stored, expected)) return { ok: false, error: CONFLICT, conflict: true };
    if (phraseKeysFor(code).some((key) => !stored.has(key))) return { ok: false, error: "Every phrase needs wording before it can be checked." };
    const { rowCount } = await client.query(
      `update voice_phrases set status = 'checked', checked_by = $2, checked_at = now() where language = $1 and status = 'draft'`,
      [code, session.sub]
    );
    if (!rowCount) return { ok: true, message: "These phrases are already checked." };
    await logActivity(client, session, "language.phrases_checked", target(language), {});
    return { ok: true, message: "Phrases marked as checked." };
  });
}

// Draft → live: candidates can choose it. Only with all its phrases checked.
export async function publishLanguage(session: SessionPayload, code: string): Promise<LanguageResult> {
  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    if (language.status === "live") return { ok: true, message: `${language.name} is already live.` };
    if (language.status === "hidden") return { ok: false, error: "Show this language again first." };
    const stored = await lockPhrases(client, code);
    if (phraseKeysFor(code).some((key) => stored.get(key)?.status !== "checked")) {
      return { ok: false, error: "Check all the spoken phrases before making the language live." };
    }
    await client.query(`update voice_languages set status = 'live', updated_at = now() where code = $1`, [code]);
    await logActivity(client, session, "language.published", target(language), {});
    return { ok: true, message: `${language.name} is live. Candidates can choose it on their Account page.` };
  });
}

// Hidden: off every list. Its candidates move to English; translations, audio and phrases are kept.
export async function hideLanguage(session: SessionPayload, code: string): Promise<LanguageResult> {
  if (code === SOURCE_LANGUAGE) return { ok: false, error: "English can't be hidden." };
  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    if (language.status === "hidden") return { ok: true, message: `${language.name} is already hidden.` };
    const { rowCount } = await client.query(`update users set preferred_language = $2 where preferred_language = $1 and role = 'candidate'`, [
      code,
      SOURCE_LANGUAGE,
    ]);
    const moved = rowCount ?? 0;
    await client.query(`update voice_languages set status = 'hidden', updated_at = now() where code = $1`, [code]);
    await logActivity(client, session, "language.hidden", target(language), {
      items: moved === 0 ? "No candidates were using it" : `${countOf(moved, "candidate", "candidates")} moved to English`,
    });
    return { ok: true, message: moved === 0 ? `${language.name} hidden.` : `${language.name} hidden. ${countOf(moved, "candidate", "candidates")} moved to English.` };
  });
}

// Hidden → draft: it needs Go live again before candidates see it.
export async function restoreLanguage(session: SessionPayload, code: string): Promise<LanguageResult> {
  return withTransaction<LanguageResult>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { ok: false, error: NOT_FOUND };
    if (language.status !== "hidden") return { ok: true, message: `${language.name} isn't hidden.` };
    await client.query(`update voice_languages set status = 'draft', updated_at = now() where code = $1`, [code]);
    await logActivity(client, session, "language.restored", target(language), {});
    return { ok: true, message: `${language.name} is back as a draft. Make it live when it's ready.` };
  });
}

// Superadmin only: a hidden language and everything made for it (phrases, translations, audio rows and files) go for
// good. Anyone still set to it moves to English; test types stop listing it. Files are removed after the commit.
export async function deleteLanguage(session: SessionPayload, code: string): Promise<LanguageResult> {
  if (code === SOURCE_LANGUAGE) return { ok: false, error: "English can't be deleted." };
  const outcome = await withTransaction<{ result: LanguageResult; paths: string[] }>(async (client) => {
    const language = await lockLanguage(client, code);
    if (!language) return { result: { ok: false, error: NOT_FOUND }, paths: [] };
    if (language.status !== "hidden") return { result: { ok: false, error: `Hide ${language.name} before deleting it.` }, paths: [] };
    const { rows: files } = await client.query<{ storage_path: string }>(
      `select storage_path from page_audio where language = $1 union all select storage_path from question_audio where language = $1`,
      [code]
    );
    const { rows: counted } = await client.query<{ translations: number }>(
      `select ((select count(*) from page_translations where language = $1) + (select count(*) from question_translations where language = $1))::int as translations`,
      [code]
    );
    const moved = (await client.query(`update users set preferred_language = $2 where preferred_language = $1`, [code, SOURCE_LANGUAGE])).rowCount ?? 0;
    for (const table of ["test_type_languages", "page_audio", "question_audio", "page_translations", "question_translations", "voice_phrases"]) {
      await client.query(`delete from ${table} where language = $1`, [code]);
    }
    await client.query(`delete from voice_languages where code = $1`, [code]);
    const removed = [
      countOf(counted[0].translations, "translation"),
      countOf(files.length, "audio file"),
      ...(moved > 0 ? [`${countOf(moved, "person", "people")} moved to English`] : []),
    ].join(", ");
    await logActivity(client, session, "language.deleted", target(language), { items: `Removed ${removed}` });
    return { result: { ok: true, message: `${language.name} deleted (${removed}).` }, paths: files.map((file) => file.storage_path) };
  });
  await deleteAudioFilesQuietly(outcome.paths);
  return outcome.result;
}

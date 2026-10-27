import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { getSignedUrls } from "@/lib/storage/storage";
import { testTypeOffers, findVoiceLanguage, languageName, type ListenMode } from "./language-store";
import { SOURCE_LANGUAGE } from "./languages";
import { VOICE_QUESTION_TYPES } from "./question-listen";
import { QUESTION_SOURCE_SQL, TRANSLATION_SOURCE_SQL } from "./question-voice";

// Server-only: what candidates hear (V5; question pages V6b). Only up-to-date audio in the candidate's own language,
// for published pages and questions in their current test type; nothing here is logged except changing the language.

// How long the private link to one page's audio lasts (it's fetched again on the next Listen).
const LISTEN_LINK_SECONDS = 10 * 60;

// What candidate `u` hears in test type `cat` (as listeningLanguageIn): their choice while it's live and offered there,
// otherwise English. The saved choice is kept, so it comes back in a test type that offers it.
const HEARS = `
  (case when exists (select 1 from voice_languages hl where hl.code = u.preferred_language and hl.status = 'live')
             and (u.preferred_language = '${SOURCE_LANGUAGE}' or cat.listen_mode = 'all'
                  or exists (select 1 from test_type_languages cl where cl.test_type_id = cat.id and cl.language = u.preferred_language))
        then u.preferred_language else '${SOURCE_LANGUAGE}' end)`;

// Audio `a` of page `p` is up to date: English from the page's current version, other languages from the
// current revision of a checked translation of that version (the same rules as status.ts).
const READY_AUDIO = `
  ((a.language = '${SOURCE_LANGUAGE}' and a.source_version = p.content_version)
   or exists (select 1 from page_translations t
              where t.content_page_id = p.id and t.language = a.language and t.status = 'checked'
                and t.source_version = p.content_version and a.source_version = t.revision))`;

// Audio `a` of question `q` (`question_audio`) is up to date: made from the current English question and options,
// and for other languages from the current revision of a checked translation of them (as the editor shows it).
const READY_QUESTION_AUDIO = `
  (q.status = 'published' and q.type = any($3::text[]) and a.source = ${QUESTION_SOURCE_SQL}
   and (a.language = '${SOURCE_LANGUAGE}'
        or exists (select 1 from question_translations t
                   where t.question_id = q.id and t.language = a.language and t.status = 'checked'
                     and t.source = ${TRANSLATION_SOURCE_SQL} and a.source_revision = t.revision)))`;

// The Handbook items in a test type with audio ready in this language (only while it is live), and each one's length in ms.
export async function loadReadyAudio(testTypeId: string, language: string): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ item_id: string; duration_ms: number }>(
    `select i.id as item_id, a.duration_ms
     from test_type_chapters cc
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id
     join content_pages p on p.id = i.content_page_id and p.status = 'published'
     join page_audio a on a.content_page_id = p.id and a.language = $2
     join voice_languages vl on vl.code = a.language and vl.status = 'live'
     where cc.test_type_id = $1 and ${READY_AUDIO}
     union all
     select i.id as item_id, a.duration_ms
     from test_type_chapters cc
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id
     join questions q on q.id = i.question_id
     join question_audio a on a.question_id = q.id and a.language = $2
     join voice_languages vl on vl.code = a.language and vl.status = 'live'
     where cc.test_type_id = $1 and ${READY_QUESTION_AUDIO}`,
    [testTypeId, language, [...VOICE_QUESTION_TYPES]]
  );
  return Object.fromEntries(rows.map((row) => [row.item_id, row.duration_ms]));
}

// A short-lived link to one Handbook item's audio for this candidate, or null when they can't hear it
// (Listen off for their current test type, not in it, unpublished, or no up-to-date audio in the language they hear there).
export async function candidateAudioLink(userId: string, itemId: string): Promise<string | null> {
  const { rows } = await pool.query<{ storage_path: string }>(
    `select a.storage_path
     from users u
     join test_types cat on cat.id = u.current_test_type_id
     join test_type_chapters cc on cc.test_type_id = u.current_test_type_id
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id and i.id = $2
     join content_pages p on p.id = i.content_page_id and p.status = 'published'
     join page_audio a on a.content_page_id = p.id and a.language = ${HEARS}
     join voice_languages vl on vl.code = a.language and vl.status = 'live'
     where u.id = $1 and u.role = 'candidate' and cat.listen_mode <> 'off' and ${READY_AUDIO}
     union all
     select a.storage_path
     from users u
     join test_types cat on cat.id = u.current_test_type_id
     join test_type_chapters cc on cc.test_type_id = u.current_test_type_id
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id and i.id = $2
     join questions q on q.id = i.question_id
     join question_audio a on a.question_id = q.id and a.language = ${HEARS}
     join voice_languages vl on vl.code = a.language and vl.status = 'live'
     where u.id = $1 and u.role = 'candidate' and cat.listen_mode <> 'off' and ${READY_QUESTION_AUDIO}`,
    [userId, itemId, [...VOICE_QUESTION_TYPES]]
  );
  const path = rows[0]?.storage_path;
  if (!path) return null;
  const links = await getSignedUrls([path], LISTEN_LINK_SECONDS, "audio");
  return links.get(path) ?? null;
}

type TestTypeListenRow = { listen_mode: ListenMode; chosen: string[] };

export type LanguageSaveResult = { ok: true; changed: boolean } | { ok: false; error: string };

// The candidate's own choice on their Account page; logged when it changes.
export async function saveListeningLanguage(session: SessionPayload, code: string): Promise<LanguageSaveResult> {
  const chosen = await findVoiceLanguage(code, "candidate");
  if (!chosen) return { ok: false, error: "Please choose a language from the list." };
  return withTransaction<LanguageSaveResult>(async (client: PoolClient) => {
    const { rows } = await client.query<{ email: string; preferred_language: string } & TestTypeListenRow>(
      `select u.email, u.preferred_language, c.listen_mode,
              array(select cl.language from test_type_languages cl where cl.test_type_id = c.id) as chosen
       from users u join test_types c on c.id = u.current_test_type_id
       where u.id = $1 and u.role = 'candidate' for update of u`,
      [session.sub]
    );
    const user = rows[0];
    if (!user) return { ok: false, error: "Your account couldn't be found. Please log in again." };
    // Only the languages the current test type offers can be chosen (0035).
    if (!testTypeOffers({ mode: user.listen_mode, chosen: user.chosen }, chosen.code)) return { ok: false, error: "Please choose a language from the list." };
    if (user.preferred_language === chosen.code) return { ok: true, changed: false };
    await client.query(`update users set preferred_language = $2 where id = $1`, [session.sub, chosen.code]);
    await logActivity(client, session, "account.language_changed", { type: "candidate", id: session.sub, label: user.email }, {
      from: await languageName(user.preferred_language),
      to: chosen.name,
    });
    return { ok: true, changed: true };
  });
}

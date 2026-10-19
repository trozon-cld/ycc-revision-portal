import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { getSignedUrls } from "@/lib/storage/storage";
import { SOURCE_LANGUAGE, voiceLanguage, type VoiceLanguage } from "./languages";

// Server-only: what candidates hear (V5). Only up-to-date audio in the candidate's own language, for published
// pages in their current category; nothing here is logged except changing the language itself.

// How long the private link to one page's audio lasts (it's fetched again on the next Listen).
const LISTEN_LINK_SECONDS = 10 * 60;

// Audio `a` of page `p` is up to date: English from the page's current version, other languages from the
// current revision of a checked translation of that version (the same rules as status.ts).
const READY_AUDIO = `
  ((a.language = '${SOURCE_LANGUAGE}' and a.source_version = p.content_version)
   or exists (select 1 from page_translations t
              where t.content_page_id = p.id and t.language = a.language and t.status = 'checked'
                and t.source_version = p.content_version and a.source_version = t.revision))`;

export function listeningLanguage(code: string | null | undefined): VoiceLanguage {
  return voiceLanguage(code) ?? voiceLanguage(SOURCE_LANGUAGE)!;
}

// The Handbook items in a category with audio ready in this language, and each one's length in ms.
export async function loadReadyAudio(categoryId: string, language: string): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ item_id: string; duration_ms: number }>(
    `select i.id as item_id, a.duration_ms
     from category_chapters cc
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id
     join content_pages p on p.id = i.content_page_id and p.status = 'published'
     join page_audio a on a.content_page_id = p.id and a.language = $2
     where cc.category_id = $1 and ${READY_AUDIO}`,
    [categoryId, language]
  );
  return Object.fromEntries(rows.map((row) => [row.item_id, row.duration_ms]));
}

// A short-lived link to one Handbook item's audio for this candidate, or null when they can't hear it
// (not in their current category, unpublished, a question, or no up-to-date audio in their language).
export async function candidateAudioLink(userId: string, itemId: string): Promise<string | null> {
  const { rows } = await pool.query<{ storage_path: string }>(
    `select a.storage_path
     from users u
     join category_chapters cc on cc.category_id = u.current_category_id
     join chapters c on c.id = cc.chapter_id and c.status = 'published'
     join handbook_items i on i.chapter_id = c.id and i.id = $2
     join content_pages p on p.id = i.content_page_id and p.status = 'published'
     join page_audio a on a.content_page_id = p.id and a.language = u.preferred_language
     where u.id = $1 and u.role = 'candidate' and ${READY_AUDIO}`,
    [userId, itemId]
  );
  const path = rows[0]?.storage_path;
  if (!path) return null;
  const links = await getSignedUrls([path], LISTEN_LINK_SECONDS, "audio");
  return links.get(path) ?? null;
}

export type LanguageSaveResult = { ok: true; changed: boolean } | { ok: false; error: string };

// The candidate's own choice on their Account page; logged when it changes.
export async function saveListeningLanguage(session: SessionPayload, code: string): Promise<LanguageSaveResult> {
  const chosen = voiceLanguage(code);
  if (!chosen) return { ok: false, error: "Please choose a language from the list." };
  return withTransaction<LanguageSaveResult>(async (client: PoolClient) => {
    const { rows } = await client.query<{ email: string; preferred_language: string }>(
      `select email, preferred_language from users where id = $1 and role = 'candidate' for update`,
      [session.sub]
    );
    const user = rows[0];
    if (!user) return { ok: false, error: "Your account couldn't be found. Please log in again." };
    if (user.preferred_language === chosen.code) return { ok: true, changed: false };
    await client.query(`update users set preferred_language = $2 where id = $1`, [session.sub, chosen.code]);
    await logActivity(client, session, "account.language_changed", { type: "candidate", id: session.sub, label: user.email }, {
      from: listeningLanguage(user.preferred_language).name,
      to: chosen.name,
    });
    return { ok: true, changed: true };
  });
}

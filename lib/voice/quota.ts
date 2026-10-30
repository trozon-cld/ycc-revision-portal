import type { PoolClient } from "pg";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { formatUkTime } from "@/lib/candidates/access";
import { formatCount } from "@/lib/format";
import { VOICE_CHARACTERS_PER_HOUR } from "./limits";

// Each staff member's hourly allowance of characters sent to the voice services (translation and audio counted
// apart), and everyone's monthly totals per service (what Google bills). Not activity-log material: usage only.
export type VoiceUsageKind = "translate" | "speech";

const KIND_WORDS: Record<VoiceUsageKind, string> = { translate: "translation", speech: "audio" };

// `waitMs`: the limit frees up shortly (a per-minute limit), so a bulk run waits and tries again; otherwise it stops.
export class VoiceQuotaError extends Error {
  constructor(
    message: string,
    readonly waitMs?: number
  ) {
    super(message);
    this.name = "VoiceQuotaError";
  }
}

// A job's characters are taken whole before anything is sent, so the cap never stops a job halfway.
export type VoiceReservation = { id: number; kind: VoiceUsageKind; service: string; characters: number };

// A Gemini-voiced language's call limits (0041), counted for everyone: a day as Gemini counts it (from midnight
// Pacific time), and the last minute. `count`: the calls this job makes (one per part read aloud).
export type GeminiCalls = { language: string; name: string; count: number };

// Gemini's daily quota starts again at midnight Pacific time.
export const GEMINI_DAY_START = `(date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')`;

export async function reserveVoiceUsage(
  userId: string,
  kind: VoiceUsageKind,
  service: string,
  characters: number,
  calls?: GeminiCalls
): Promise<VoiceReservation> {
  const limit = VOICE_CHARACTERS_PER_HOUR[kind];
  const amount = Math.max(0, Math.ceil(characters));
  const words = KIND_WORDS[kind];
  if (amount > limit) {
    throw new VoiceQuotaError(
      `This is longer than the hourly ${words} limit (${formatCount(amount)} of ${formatCount(limit)} characters), so it can't be sent in one go.`
    );
  }
  return withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext('voice_usage:' || $1))`, [userId]);
    await client.query(`delete from voice_usage where user_id = $1 and created_at < now() - interval '1 day'`, [userId]);
    const { rows } = await client.query<{ characters: number; at: Date }>(
      `select characters, created_at + interval '1 hour' as at from voice_usage
       where user_id = $1 and kind = $2 and created_at > now() - interval '1 hour'
       order by created_at`,
      [userId, kind]
    );
    const used = rows.reduce((sum, row) => sum + row.characters, 0);
    if (calls) await checkGeminiCalls(client, calls);
    if (used + amount > limit) {
      // The time when enough of this hour's characters have dropped out of the window.
      let freed = 0;
      const next = rows.find((row) => (freed += row.characters) >= used + amount - limit);
      throw new VoiceQuotaError(
        `This would go over your hourly ${words} limit (${formatCount(used)} of ${formatCount(limit)} characters used; this needs ${formatCount(amount)}). You can do it at ${formatUkTime(next?.at ?? new Date(Date.now() + 60 * 60 * 1000))}.`
      );
    }
    const inserted = await client.query<{ id: number }>(
      `insert into voice_usage (user_id, kind, service, characters, language, calls) values ($1, $2, $3, $4, $5, $6) returning id`,
      [userId, kind, service, amount, calls?.language ?? null, calls?.count ?? 1]
    );
    return { id: Number(inserted.rows[0].id), kind, service, characters: amount };
  });
}

// Refuses a job that would go over the language's Gemini limits; a per-minute wait says how long.
async function checkGeminiCalls(client: PoolClient, calls: GeminiCalls): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext('gemini_calls:' || $1))`, [calls.language]);
  const { rows } = await client.query<{ per_day: number | null; per_minute: number | null; today: number; minute: number; frees: Date | null; resets: Date }>(
    `select l.gemini_calls_per_day as per_day, l.gemini_calls_per_minute as per_minute,
            (select coalesce(sum(u.calls), 0) from voice_usage u
              where u.kind = 'speech' and u.language = l.code and u.created_at >= ${GEMINI_DAY_START})::int as today,
            (select coalesce(sum(u.calls), 0) from voice_usage u
              where u.kind = 'speech' and u.language = l.code and u.created_at > now() - interval '1 minute')::int as minute,
            (select min(u.created_at) + interval '1 minute' from voice_usage u
              where u.kind = 'speech' and u.language = l.code and u.created_at > now() - interval '1 minute') as frees,
            ${GEMINI_DAY_START} + interval '1 day' as resets
     from voice_languages l where l.code = $1`,
    [calls.language]
  );
  const row = rows[0];
  if (!row) return;
  if (row.per_day !== null && row.today + calls.count > row.per_day) {
    throw new VoiceQuotaError(
      `Today's ${calls.name} audio limit (${formatCount(row.per_day, "Gemini call")}) is used up${row.today < row.per_day ? ` (this needs ${calls.count})` : ""}. It starts again at ${formatUkTime(row.resets)} UK time. The limit can be changed on the Languages tab.`
    );
  }
  if (row.per_minute !== null && calls.count > row.per_minute) {
    throw new VoiceQuotaError(
      `This needs ${formatCount(calls.count, "Gemini call")} at once, more than ${calls.name}'s limit of ${row.per_minute} a minute. Raise the limit on the Languages tab.`
    );
  }
  if (row.per_minute !== null && row.minute + calls.count > row.per_minute) {
    const waitMs = Math.max(1000, (row.frees?.getTime() ?? Date.now() + 60_000) - Date.now() + 500);
    throw new VoiceQuotaError(
      `${calls.name} audio is limited to ${formatCount(row.per_minute, "Gemini call")} a minute. Please try again in ${Math.ceil(waitMs / 1000)} seconds.`,
      waitMs
    );
  }
}

// After the job (done or failed): keeps only the characters actually sent and adds them to the month's total.
export async function settleVoiceUsage(reservation: VoiceReservation, sent: number): Promise<void> {
  const used = Math.min(reservation.characters, Math.max(0, Math.ceil(sent)));
  await withTransaction(async (client) => {
    await client.query(`update voice_usage set characters = $2 where id = $1`, [reservation.id, used]);
    if (used > 0) {
      await client.query(
        `insert into voice_usage_months (month, kind, service, characters)
         values (date_trunc('month', now() at time zone 'Europe/London')::date, $1, $2, $3)
         on conflict (month, kind, service) do update set characters = voice_usage_months.characters + excluded.characters`,
        [reservation.kind, reservation.service, used]
      );
    }
  });
}

export type VoiceUsageSummary = {
  // This staff member, the last hour.
  hour: Record<VoiceUsageKind, number>;
  // Everyone, this month (UK), per service.
  month: { kind: VoiceUsageKind; service: string; characters: number }[];
};

export async function voiceUsageSummary(userId: string): Promise<VoiceUsageSummary> {
  const [hour, month] = await Promise.all([
    pool.query<{ kind: VoiceUsageKind; characters: number }>(
      `select kind, coalesce(sum(characters), 0)::int as characters from voice_usage
       where user_id = $1 and created_at > now() - interval '1 hour' group by kind`,
      [userId]
    ),
    pool.query<{ kind: VoiceUsageKind; service: string; characters: string }>(
      `select kind, service, characters from voice_usage_months
       where month = date_trunc('month', now() at time zone 'Europe/London')::date order by kind, service`
    ),
  ]);
  const byKind = (kind: VoiceUsageKind) => hour.rows.find((row) => row.kind === kind)?.characters ?? 0;
  return {
    hour: { translate: byKind("translate"), speech: byKind("speech") },
    month: month.rows.map((row) => ({ kind: row.kind, service: row.service, characters: Number(row.characters) })),
  };
}

// A Gemini-voiced language's limits and today's calls (Bulk tab estimate); null for a language without limits.
export type GeminiToday = { perDay: number | null; perMinute: number | null; usedToday: number; resetsAt: string };

export async function geminiToday(code: string): Promise<GeminiToday> {
  const { rows } = await pool.query<{ per_day: number | null; per_minute: number | null; today: number; resets: Date }>(
    `select l.gemini_calls_per_day as per_day, l.gemini_calls_per_minute as per_minute,
            (select coalesce(sum(u.calls), 0) from voice_usage u
              where u.kind = 'speech' and u.language = l.code and u.created_at >= ${GEMINI_DAY_START})::int as today,
            ${GEMINI_DAY_START} + interval '1 day' as resets
     from voice_languages l where l.code = $1`,
    [code]
  );
  const row = rows[0];
  return { perDay: row?.per_day ?? null, perMinute: row?.per_minute ?? null, usedToday: row?.today ?? 0, resetsAt: (row?.resets ?? new Date()).toISOString() };
}

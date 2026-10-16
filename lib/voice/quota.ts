import { withTransaction } from "@/lib/db/transaction";
import { formatUkTime } from "@/lib/candidates/access";
import { VOICE_REQUESTS_PER_HOUR } from "./limits";

export type VoiceRequestKind = "translate" | "speech";

export class VoiceQuotaError extends Error {
  constructor(readonly nextAt: Date) {
    super(`You've used this hour's ${VOICE_REQUESTS_PER_HOUR} voice service requests. You can make more at ${formatUkTime(nextAt)}.`);
    this.name = "VoiceQuotaError";
  }
}

// Takes `count` requests from the user's hourly allowance before calling the service (failed calls still
// count: they used the service's quota too). Rows older than a day are removed as new ones arrive.
export async function takeVoiceRequests(userId: string, kind: VoiceRequestKind, count: number): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext('voice_requests:' || $1))`, [userId]);
    await client.query(`delete from voice_requests where user_id = $1 and created_at < now() - interval '1 day'`, [userId]);
    const { rows } = await client.query<{ used: number; oldest: Date | null }>(
      `select count(*)::int as used, min(created_at) as oldest
       from (select created_at from voice_requests
             where user_id = $1 and created_at > now() - interval '1 hour'
             order by created_at desc limit $2) recent`,
      [userId, VOICE_REQUESTS_PER_HOUR]
    );
    const used = rows[0].used;
    if (used + count > VOICE_REQUESTS_PER_HOUR) {
      const { rows: next } = await client.query<{ at: Date }>(
        `select created_at + interval '1 hour' as at from voice_requests
         where user_id = $1 and created_at > now() - interval '1 hour'
         order by created_at asc offset $2 limit 1`,
        [userId, Math.max(0, used + count - VOICE_REQUESTS_PER_HOUR - 1)]
      );
      throw new VoiceQuotaError(next[0]?.at ?? new Date(Date.now() + 60 * 60 * 1000));
    }
    await client.query(`insert into voice_requests (user_id, kind) select $1, $2 from generate_series(1, $3)`, [userId, kind, count]);
  });
}

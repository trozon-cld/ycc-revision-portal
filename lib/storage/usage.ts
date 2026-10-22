import { pool } from "@/lib/db/pool";

// Everything kept in storage, by the sizes recorded in the database: pictures, archived login records and
// Handbook audio. Thumbnails (tens of KB each) fit in the margin between STORAGE_LIMIT_BYTES and the quota.
export async function storedBytes(): Promise<number> {
  const { rows } = await pool.query<{ bytes: string }>(
    `select ((select coalesce(sum(byte_size), 0) from media)
           + (select coalesce(sum(byte_size), 0) from log_archives)
           + (select coalesce(sum(byte_size), 0) from page_audio)
           + (select coalesce(sum(byte_size), 0) from question_audio))::text as bytes`
  );
  return Number(rows[0].bytes);
}

import { pool } from "./pool";
import { getErrorCode } from "./transaction";

// The newest migration this code needs. Raise it in every delivery that adds a migration (supabase/migrations).
export const EXPECTED_MIGRATION = "0044_database_backups";

export type SchemaStatus =
  | { state: "current"; latest: string }
  // Some migrations up to this code's one haven't been run (by their four-digit numbers).
  | { state: "behind"; missing: string[] }
  // The database has a newer migration than this code knows (an older version deployed).
  | { state: "ahead"; latest: string }
  // The record table itself isn't there: 0043 hasn't been run.
  | { state: "no_record" };

const FIRST_MIGRATION = 2;
const numberOf = (name: string) => Number(name.slice(0, 4));

// Compares the database's record with what this code needs. Read-only, one small query.
export async function loadSchemaStatus(): Promise<SchemaStatus> {
  let names: string[];
  try {
    const { rows } = await pool.query<{ name: string }>(`select name from schema_migrations order by name`);
    names = rows.map((row) => row.name);
  } catch (error) {
    if (getErrorCode(error) === "42P01") return { state: "no_record" };
    throw error;
  }
  const expected = numberOf(EXPECTED_MIGRATION);
  const have = new Set(names.map(numberOf));
  const missing: string[] = [];
  for (let n = FIRST_MIGRATION; n <= expected; n++) if (!have.has(n)) missing.push(String(n).padStart(4, "0"));
  if (missing.length > 0) return { state: "behind", missing };
  const latest = names.at(-1) ?? EXPECTED_MIGRATION;
  return numberOf(latest) > expected ? { state: "ahead", latest } : { state: "current", latest };
}

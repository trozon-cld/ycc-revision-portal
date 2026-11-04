import type { PoolClient } from "pg";

// Names that must be unique whatever their capitals (each has a unique lower(...) index in schema.sql).
const NAMED = { test_types: "name", test_areas: "name", sections: "title", chapters: "title" } as const;

export type NamedTable = keyof typeof NAMED;

// True when another row of this table already has this name; exceptId is the row being renamed.
export async function nameInUse(client: PoolClient, table: NamedTable, name: string, exceptId: string | null): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from ${table} where lower(${NAMED[table]}) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [name, exceptId]
  );
  return rows.length > 0;
}

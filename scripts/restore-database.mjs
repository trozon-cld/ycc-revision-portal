#!/usr/bin/env node
// Loads a database backup (Backup & Restore → Backup) into a fresh database made from supabase/schema.sql.
// Usage: npm run restore-database -- path/to/ycc-database-….json.gz   (DATABASE_URL set to the NEW database; see docs/database-backups.md)

import fs from "node:fs";
import zlib from "node:zlib";
import pg from "pg";

const FORMAT = "ycc-database-backup";
const VERSION = 1;

function fail(message) {
  console.error(`\nNot restored: ${message}\n`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail("give the backup file: npm run restore-database -- path/to/ycc-database-….json.gz");
const url = process.env.DATABASE_URL;
if (!url) fail("set DATABASE_URL to the new, empty database (not the live one).");

let backup;
try {
  backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
} catch {
  fail("the file can't be read. Choose a database backup (.json.gz) downloaded from Backup & Restore.");
}
if (backup?.format !== FORMAT || backup?.version !== VERSION || typeof backup.tables !== "object") fail("this isn't a database backup file.");

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const client = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false } });
await client.connect();

try {
  // Safety first: only a fresh database at the backup's version, so a live site can never be overwritten.
  const migration = await client.query(`select max(name) as name from schema_migrations`).catch(() => null);
  if (!migration) fail("this database has no migration record. Make it from supabase/schema.sql first.");
  if (migration.rows[0].name !== backup.migration) {
    fail(`the backup was made at migration ${backup.migration}, but this database is at ${migration.rows[0].name}. Make it from the schema.sql of the version that made the backup.`);
  }
  const { rows: accounts } = await client.query(`select count(*)::int as n from users`);
  if (accounts[0].n > 0) fail("this database already has accounts. Restore only into a fresh database made from schema.sql (without the seed).");

  const { rows: tableRows } = await client.query(
    `select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`
  );
  const tables = tableRows.map((row) => row.name).sort();
  const missing = Object.keys(backup.tables).filter((name) => !tables.includes(name));
  const extra = tables.filter((name) => !(name in backup.tables));
  if (missing.length || extra.length) fail(`the tables don't match (not here: ${missing.join(", ") || "none"}; not in the backup: ${extra.join(", ") || "none"}).`);

  const { rows: columnRows } = await client.query(
    `select table_name, column_name, is_generated = 'ALWAYS' as generated, is_identity = 'YES' as identity
     from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`
  );
  const { rows: links } = await client.query(
    `select c.conname as name, c.conrelid::regclass::text as table_name, c.condeferrable as deferrable, c.condeferred as deferred
     from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`
  );
  const columns = new Map(tables.map((name) => [name, columnRows.filter((row) => row.table_name === name)]));

  await client.query("begin");
  // Some tables point at each other (accounts and test types, for example), so the links are checked once every
  // table is in rather than row by row; inside this transaction only, and put back as they were before it ends.
  for (const link of links) await client.query(`alter table ${link.table_name} alter constraint ${q(link.name)} deferrable initially deferred`);
  // A fresh database holds only schema.sql's own rows (English, the support contact row, the migration list).
  await client.query(`truncate ${tables.map(q).join(", ")} restart identity`);
  for (const name of tables) {
    const rows = backup.tables[name];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const insertable = columns.get(name).filter((row) => !row.generated);
    const identity = insertable.some((row) => row.identity) ? "overriding system value" : "";
    await client.query(
      `insert into ${q(name)} (${insertable.map((row) => q(row.column_name)).join(", ")}) ${identity}
       select ${insertable.map((row) => `s.${q(row.column_name)}`).join(", ")}
       from json_populate_recordset(null::${q(name)}, $1::json) s`,
      [JSON.stringify(rows)]
    );
  }
  await client.query("set constraints all immediate");
  for (const link of links) {
    const how = link.deferrable ? `deferrable initially ${link.deferred ? "deferred" : "immediate"}` : "not deferrable";
    await client.query(`alter table ${link.table_name} alter constraint ${q(link.name)} ${how}`);
  }
  // Numbers handed out by the database carry on after the restored ones.
  for (const row of columnRows.filter((column) => column.identity)) {
    await client.query(
      `select setval(pg_get_serial_sequence($1, $2), coalesce((select max(${q(row.column_name)}) from ${q(row.table_name)}), 0) + 1, false)`,
      [`public.${q(row.table_name)}`, row.column_name]
    );
  }
  // The backup list names files in the old project's bucket, so it starts empty here.
  await client.query(`delete from database_backups`);

  const report = [];
  for (const name of tables) {
    const { rows } = await client.query(`select count(*)::int as n from ${q(name)}`);
    const expected = name === "database_backups" ? 0 : (backup.counts?.[name] ?? backup.tables[name].length);
    if (rows[0].n !== expected) fail(`${name} has ${rows[0].n} rows after loading, but the backup has ${expected}. Nothing was saved.`);
    report.push(`  ${name}: ${rows[0].n}`);
  }
  await client.query("commit");
  console.log(`\nRestored the database backup made ${backup.createdAt} (migration ${backup.migration}):\n${report.join("\n")}`);
  console.log("\nNext: put back the pictures and audio (Backup & Restore → Restore), then log in and check. See docs/database-backups.md.\n");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await client.end().catch(() => undefined);
}

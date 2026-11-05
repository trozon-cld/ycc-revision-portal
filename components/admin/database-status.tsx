import type { SchemaStatus } from "@/lib/db/schema-version";
import { Badge } from "./badge";
import { warnNoteClass } from "./styles";

const code = (name: string) => name.slice(0, 4);

// Superadmin, on Backup & Restore: whether the database has had every migration this version of the portal needs.
export function DatabaseStatus({ status }: { status: SchemaStatus }) {
  if (status.state === "current") {
    return (
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        Database: up to migration <span className="font-medium text-ink tabular-nums">{code(status.latest)}</span>
        <Badge tone="success">Matches this version</Badge>
      </p>
    );
  }
  const text =
    status.state === "behind"
      ? `This version needs ${status.missing.length === 1 ? "migration" : "migrations"} ${status.missing.join(", ")}, not yet run on this database. Run ${status.missing.length === 1 ? "it" : "them in order"} from supabase/migrations in the database's SQL editor, then reload this page.`
      : status.state === "ahead"
        ? `This database already has migration ${code(status.latest)}, newer than this version of the portal. Deploy the latest version.`
        : "This database has no migration record yet. Run supabase/migrations/0043_schema_migrations.sql (after any earlier ones not yet run), then reload this page.";
  return (
    <p role="status" className={`mb-4 ${warnNoteClass}`}>
      {text}
    </p>
  );
}

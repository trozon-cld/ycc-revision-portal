"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/badge";
import { buttonClass, cardClass, errorNoteClass, warnNoteClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { AUTOMATIC_STALE_HOURS } from "@/lib/database-backup/format";
import { backUpNow } from "./actions";

export type DatabaseBackupView = { id: string; kind: string; manual: boolean; when: string; size: string; migration: string; by: string | null };

const DOWNLOAD_ROUTE = "/api/database-backups/download";

// Database backups: every table (accounts, results, logs, content), made daily by the schedule or by hand here.
export function DatabaseBackups({
  backups,
  scheduleSetUp,
  automaticStale,
}: {
  backups: DatabaseBackupView[];
  scheduleSetUp: boolean;
  automaticStale: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const newestAutomatic = backups.find((backup) => !backup.manual);

  function onBackUpNow() {
    setMessage(null);
    startTransition(async () => {
      const result = await backUpNow();
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({ ok: true, text: `Backup made (${result.size}). The download has started; keep the file somewhere safe, away from this computer too.` });
      router.refresh();
      await onDownload(result.id, false);
    });
  }

  async function onDownload(id: string, clear = true) {
    if (clear) setMessage(null);
    const result = await startDownload(id);
    if (!result.ok) setMessage({ ok: false, text: result.error });
  }

  return (
    <section aria-labelledby="database-backups-heading" className={`${cardClass} max-w-3xl space-y-3 p-4`}>
      <h2 id="database-backups-heading" className="text-base font-semibold text-ink">
        Database backups
      </h2>
      <p className="text-sm text-ink">
        Everything in the database: accounts, candidates&apos; progress and results, the activity log and login records, content, translations and settings.
        Pictures and audio aren&apos;t in it (they&apos;re in the content and audio backups below). One is made automatically every day; the newest 7, one a week
        for 4 weeks and the last 5 made here are kept.
      </p>
      <p className="text-sm text-slate-600">
        Last automatic backup: {newestAutomatic ? `${newestAutomatic.when} (${newestAutomatic.size})` : "none yet"}. Download one about once a week and keep it
        away from Supabase.
      </p>
      {!scheduleSetUp && (
        <p className={warnNoteClass}>The daily schedule isn&apos;t set up: CRON_SECRET is missing on the server, so only backups made here are being saved.</p>
      )}
      {scheduleSetUp && automaticStale && (
        <p className={warnNoteClass}>No automatic backup in the last {AUTOMATIC_STALE_HOURS} hours. Check the host&apos;s schedule and the server log.</p>
      )}
      <button type="button" onClick={onBackUpNow} disabled={isPending} className={buttonClass("primary")}>
        {isPending ? "Making the backup…" : "Back Up Now"}
      </button>
      <div aria-live="polite">
        {message && (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-strong" : errorNoteClass}>
            {message.text}
          </p>
        )}
      </div>
      <Table columns={["Made", "Kind", "Size", "Database version", "Download"]} isEmpty={backups.length === 0} emptyMessage="No database backups yet.">
        {backups.map((backup) => (
          <Row key={backup.id}>
            <Cell kind="primary">{backup.when}</Cell>
            <Cell label="Kind">
              <Badge tone={backup.manual ? "neutral" : "info"}>{backup.kind}</Badge>
              {backup.by && <span className="text-slate-600"> by {backup.by}</span>}
            </Cell>
            <Cell label="Size" nowrap>
              {backup.size}
            </Cell>
            <Cell label="Database version" nowrap>
              {backup.migration}
            </Cell>
            <Cell label="Download">
              <button
                type="button"
                onClick={() => onDownload(backup.id)}
                aria-label={`Download the ${backup.kind.toLowerCase()} backup made ${backup.when}`}
                className={buttonClass("secondary")}
              >
                Download
              </button>
            </Cell>
          </Row>
        ))}
      </Table>
    </section>
  );
}

// The download is logged first; the browser then fetches the file from storage by a short-lived link.
async function startDownload(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(DOWNLOAD_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const result = (await response.json()) as { ok: true; url: string } | { ok: false; error: string };
    if (!result.ok) return result;
    window.location.assign(result.url);
    return { ok: true };
  } catch {
    return { ok: false, error: "The download couldn't be started. Check the connection and try again." };
  }
}

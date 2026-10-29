"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/admin/dialog";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { Cell, Row, Table } from "@/components/admin/table";
import { buttonClass, cardClass, fileInputClass, labelClass } from "@/components/admin/styles";
import { formatBytes } from "@/lib/format";
import { formatUkDateTime } from "@/lib/candidates/access";
import { backupCounts } from "@/lib/content/backup/format";
import { checkBackup, openBackupZip, runRestore, type OpenedBackup } from "@/lib/content/backup/open";

type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; message: string }
  | { status: "checked"; fileName: string; backup: OpenedBackup; problems: string[] }
  | { status: "restoring"; fileName: string; backup: OpenedBackup; step: string }
  | { status: "restored"; fileName: string; backup: OpenedBackup; tables: Record<string, number> }
  | { status: "restoreFailed"; fileName: string; backup: OpenedBackup; problems: string[] };

export function RestoreBackup() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [confirming, setConfirming] = useState(false);
  const restoring = state.status === "restoring";
  const [leaveTo, setLeaveTo] = useLeaveGuard(restoring);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "working", step: "Opening the backup…" });
    const opened = await openBackupZip(file);
    if (!opened.ok) {
      setState({ status: "failed", message: `${file.name}: ${opened.error}` });
      return;
    }
    setState({ status: "working", step: "Checking this project…" });
    const checked = await checkBackup(opened.backup);
    setState({ status: "checked", fileName: file.name, backup: opened.backup, problems: checked.ok ? [] : checked.problems });
  }

  async function onRestore(fileName: string, backup: OpenedBackup) {
    setConfirming(false);
    setState({ status: "restoring", fileName, backup, step: "Starting…" });
    const result = await runRestore(backup, (step) => setState({ status: "restoring", fileName, backup, step }));
    setState(result.ok ? { status: "restored", fileName, backup, tables: result.tables } : { status: "restoreFailed", fileName, backup, problems: result.problems });
  }

  const shown = state.status === "checked" || state.status === "restoring" || state.status === "restored" || state.status === "restoreFailed" ? state : null;
  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="restore-file" className={`${cardClass} space-y-3 p-4`}>
        <div>
          <label htmlFor="backup-zip" id="restore-file" className={labelClass}>
            Backup file
          </label>
          <p id="backup-zip-hint" className="mt-1 text-sm text-slate-600">
            A zip downloaded from Backup. It&apos;s opened and checked first; nothing changes until you choose Restore. Restore only works on an empty
            project (no pages, questions or pictures), so nothing is ever overwritten.
          </p>
        </div>
        <input
          id="backup-zip"
          type="file"
          accept=".zip,application/zip"
          aria-describedby="backup-zip-hint"
          disabled={state.status === "working" || restoring}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file again checks it again.
            event.target.value = "";
            onFile(file);
          }}
          className={fileInputClass}
        />
        <div aria-live="polite">
          {state.status === "working" && <p className="text-sm text-slate-600">{state.step}</p>}
          {state.status === "failed" && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
              {state.message}
            </p>
          )}
        </div>
      </section>

      {shown && <BackupContents fileName={shown.fileName} backup={shown.backup} tables={shown.status === "restored" ? shown.tables : null} />}

      {state.status === "checked" && state.problems.length > 0 && <Problems title="This backup can't be restored here yet" problems={state.problems} />}
      {state.status === "checked" && state.problems.length === 0 && (
        <section aria-labelledby="restore-heading" className={`${cardClass} space-y-3 p-4`}>
          <h2 id="restore-heading" className="text-base font-semibold text-ink">
            Restore
          </h2>
          <p className="text-sm text-ink">
            This project is empty and can take this backup. Its test areas, test types, sections and chapters replace this project&apos;s; its languages are
            added. Keep this page open until it&apos;s finished.
          </p>
          <button type="button" onClick={() => setConfirming(true)} className={buttonClass("primary")}>
            Restore
          </button>
        </section>
      )}
      {restoring && (
        <p aria-live="polite" className={`${cardClass} p-4 text-sm text-ink`}>
          {state.step} Please keep this page open.
        </p>
      )}
      {state.status === "restoreFailed" && (
        <Problems title="The restore didn't finish" problems={[...state.problems, "Nothing else was saved: only pictures already uploaded stay, and a new try puts them back again. Choose the backup file again to retry."]} />
      )}
      {state.status === "restored" && (
        <section aria-labelledby="restored-heading" role="status" className="space-y-2 rounded-lg bg-ok-bg p-4 text-sm text-ok-strong ring-1 ring-ok/20">
          <h2 id="restored-heading" className="text-base font-semibold">
            Restored
          </h2>
          <p>Everything in the backup is back. The table above compares what was restored with what the backup holds.</p>
          <p>Next: add General queries and the support contact again (they aren&apos;t in backups), and make any Listen audio again.</p>
        </section>
      )}

      {confirming && state.status === "checked" && (
        <Dialog title="Restore this backup?" variant="confirm" onClose={() => setConfirming(false)}>
          <p className="px-5 py-4 text-sm">
            Everything in {state.fileName} is added to this project, and its structure replaces this project&apos;s. This can&apos;t be undone from here.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={() => setConfirming(false)} className={buttonClass("secondary")}>
              Cancel
            </button>
            <button type="button" onClick={() => onRestore(state.fileName, state.backup)} className={buttonClass("primary")}>
              Yes, restore
            </button>
          </div>
        </Dialog>
      )}
      {leaveTo && <LeaveDialog what="the restore" onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </div>
  );
}

// What the backup holds; after a restore, what came back beside it.
function BackupContents({ fileName, backup, tables }: { fileName: string; backup: OpenedBackup; tables: Record<string, number> | null }) {
  const { manifest } = backup;
  const inBackup = backupCounts((table) => manifest.tables[table]?.rows ?? 0);
  const restored = tables ? backupCounts((table) => tables[table] ?? 0) : null;
  return (
    <section aria-labelledby="backup-contents" className="space-y-3">
      <div>
        <h2 id="backup-contents" className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
          {fileName}
        </h2>
        <p className="text-sm text-slate-600">
          Made {formatUkDateTime(manifest.createdAt)} by {manifest.createdBy} · {manifest.pictures.files} picture files ({formatBytes(manifest.pictures.bytes)})
        </p>
      </div>
      <Table columns={restored ? ["Content", "In the backup", "Restored"] : ["Content", "In the backup"]} isEmpty={false} emptyMessage="">
        {inBackup.map(({ label, count }, index) => (
          <Row key={label}>
            <Cell>{label}</Cell>
            <Cell>{count}</Cell>
            {restored && <Cell>{restored[index].count === count ? `${restored[index].count} ✓` : `${restored[index].count} (differs)`}</Cell>}
          </Row>
        ))}
      </Table>
    </section>
  );
}

function Problems({ title, problems }: { title: string; problems: string[] }) {
  return (
    <section aria-labelledby="restore-problems" role="alert" className="space-y-2 rounded-lg bg-danger-bg p-4 text-sm text-danger-strong">
      <h2 id="restore-problems" className="text-base font-semibold">
        {title}
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        {problems.map((problem, index) => (
          <li key={index}>{problem}</li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useState } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { formatBytes } from "@/lib/format";
import { backupCounts, type BackupManifest } from "@/lib/content/backup/format";
import { buildBackup, reportSaved } from "@/lib/content/backup/zip";
import { saveFile } from "../save-file";

type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; message: string }
  | { status: "done"; fileName: string; bytes: number; manifest: BackupManifest; recorded: boolean };

export function BackupDownload() {
  const [state, setState] = useState<State>({ status: "idle" });
  const working = state.status === "working";

  async function onDownload() {
    setState({ status: "working", step: "Starting…" });
    const built = await buildBackup((step) => setState({ status: "working", step }));
    if (!built.ok) {
      setState({ status: "failed", message: built.error });
      return;
    }
    saveFile(built.fileName, built.zip);
    const recorded = await reportSaved(built.fileName, built.data.manifest);
    setState({ status: "done", fileName: built.fileName, bytes: built.zip.length, manifest: built.data.manifest, recorded });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="backup-heading" className={`${cardClass} space-y-3 p-4`}>
        <h2 id="backup-heading" className="text-base font-semibold text-ink">
          Download a backup
        </h2>
        <p className="text-sm text-ink">
          One zip file with the test areas and test types, sections and chapters, every page and question (drafts included), the Handbook order,
          pictures, translations, languages and spoken phrases. Restoring it brings all of this back into an empty project.
        </p>
        <p className="text-sm text-slate-600">
          Not included: General queries and support contact (re-enter them after a restore), audio (downloaded per language under Audio backups, below), and never
          accounts, candidates&apos; data or logs.
        </p>
        <p className="text-sm text-slate-600">Keep this page open until the file is saved. Large backups take a few minutes.</p>
        <button type="button" onClick={onDownload} disabled={working} className={buttonClass("primary")}>
          {working ? "Making the backup…" : "Download backup"}
        </button>
        <div aria-live="polite">
          {state.status === "working" && <p className="text-sm text-slate-600">{state.step}</p>}
          {state.status === "failed" && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
              {state.message}
            </p>
          )}
        </div>
      </section>
      {state.status === "done" && <BackupDone fileName={state.fileName} bytes={state.bytes} manifest={state.manifest} recorded={state.recorded} />}
    </div>
  );
}

function BackupDone({ fileName, bytes, manifest, recorded }: { fileName: string; bytes: number; manifest: BackupManifest; recorded: boolean }) {
  const counts = backupCounts((table) => manifest.tables[table]?.rows ?? 0);
  return (
    <section aria-labelledby="backup-done" role="status" className="space-y-2 rounded-lg bg-ok-bg p-4 text-sm text-ok-strong ring-1 ring-ok/20">
      <h2 id="backup-done" className="text-base font-semibold">
        Backup saved
      </h2>
      <p>
        {fileName} ({formatBytes(bytes)}) is in your downloads. Keep a copy somewhere safe, not only on this computer.
      </p>
      <p>{counts.map(({ label, count }) => `${label}: ${count}`).join(" · ")}</p>
      {!recorded && <p>The backup is saved, but it couldn&apos;t be noted in the Activity log (connection). That doesn&apos;t affect the file.</p>}
    </section>
  );
}

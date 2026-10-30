"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { buttonClass, cardClass, fileInputClass, labelClass } from "@/components/admin/styles";
import { countOf, formatBytes } from "@/lib/format";
import { formatUkDateTime } from "@/lib/candidates/access";
import { checkAudioBackup, openAudioZip, runAudioRestore, type OpenedAudioBackup } from "@/lib/content/backup/audio-zip";

type Checked = { fileName: string; backup: OpenedAudioBackup; paths: string[]; skipped: string[]; skippedCount: number };
type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; problems: string[] }
  | ({ status: "checked" } & Checked)
  | ({ status: "restoring"; step: string } & Checked)
  | ({ status: "restored"; restored: number; skippedTotal: number; notStored: number } & Checked)
  | ({ status: "restoreFailed"; problems: string[] } & Checked);

// One language's audio backup back into this project: only items that exist here and have no audio in that language yet.
export function RestoreAudio() {
  const [state, setState] = useState<State>({ status: "idle" });
  const restoring = state.status === "restoring";
  const [leaveTo, setLeaveTo] = useLeaveGuard(restoring);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "working", step: "Opening the audio backup…" });
    const opened = await openAudioZip(file);
    if (!opened.ok) {
      setState({ status: "failed", problems: [`${file.name}: ${opened.error}`] });
      return;
    }
    setState({ status: "working", step: "Checking this project…" });
    const checked = await checkAudioBackup(opened.backup);
    if (!checked.ok) {
      setState({ status: "failed", problems: checked.problems });
      return;
    }
    setState({ status: "checked", fileName: file.name, backup: opened.backup, paths: checked.paths, skipped: checked.skipped, skippedCount: checked.skippedCount });
  }

  async function onRestore(checked: Checked) {
    setState({ ...checked, status: "restoring", step: "Starting…" });
    const result = await runAudioRestore(checked.backup, checked.paths, (step) => setState({ ...checked, status: "restoring", step }));
    setState(result.ok ? { ...checked, status: "restored", restored: result.restored, skippedTotal: result.skipped, notStored: result.notStored } : { ...checked, status: "restoreFailed", problems: result.problems });
  }

  const shown = state.status === "checked" || state.status === "restoring" || state.status === "restored" || state.status === "restoreFailed" ? state : null;
  return (
    <section aria-labelledby="restore-audio-heading" className={`${cardClass} max-w-3xl space-y-3 p-4`}>
      <div>
        <h2 id="restore-audio-heading" className="text-base font-semibold text-ink">
          Restore audio
        </h2>
        <p className="mt-1 text-sm text-ink">
          One language at a time, from a file downloaded under Backup → Audio backups. Each audio file goes back to its own page or question.
          Restore the main backup first on a new project. Audio that&apos;s already here is never replaced.
        </p>
      </div>
      <div>
        <label htmlFor="audio-zip" className={labelClass}>
          Audio backup file
        </label>
        <input
          id="audio-zip"
          type="file"
          accept=".zip,application/zip"
          disabled={state.status === "working" || restoring}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file again checks it again.
            event.target.value = "";
            onFile(file);
          }}
          className={`${fileInputClass} mt-1`}
        />
      </div>
      <div aria-live="polite" className="space-y-3">
        {state.status === "working" && <p className="text-sm text-slate-600">{state.step}</p>}
        {state.status === "failed" && <Problems problems={state.problems} />}
        {shown && (
          <div className="space-y-1 text-sm text-ink">
            <p className="font-medium [overflow-wrap:anywhere]">{shown.fileName}</p>
            <p className="text-slate-600">
              {shown.backup.manifest.language.name} · made {formatUkDateTime(shown.backup.manifest.createdAt)} by {shown.backup.manifest.createdBy} ·{" "}
              {formatBytes(shown.backup.manifest.bytes)}
            </p>
            {state.status !== "restored" && (
              <p>
                {shown.paths.length > 0 ? `${countOf(shown.paths.length, "item")} can be restored` : "Nothing to restore"}
                {shown.skippedCount > 0 ? `; ${shown.skippedCount} skipped: ${shown.skipped.join("; ")}.` : "."}
              </p>
            )}
          </div>
        )}
        {state.status === "checked" &&
          (state.paths.length > 0 ? (
            <button
              type="button"
              onClick={() => onRestore({ fileName: state.fileName, backup: state.backup, paths: state.paths, skipped: state.skipped, skippedCount: state.skippedCount })}
              className={buttonClass("primary")}
            >
              Restore audio
            </button>
          ) : null)}
        {restoring && <p className="text-sm text-ink">{state.step} Please keep this page open.</p>}
        {state.status === "restoreFailed" && (
          <Problems problems={[...state.problems, "Records already saved stay; choose the file again to finish (uploaded files are reused)."]} />
        )}
        {state.status === "restored" && (
          <div role="status" className="space-y-1 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-strong">
            <p className="font-semibold">Audio restored</p>
            <p>
              {state.backup.manifest.language.name}: {countOf(state.restored, "item")} restored, {state.skippedTotal} skipped. Audio made from text that has
              changed since shows as Out of date, as usual.
            </p>
            {state.notStored > 0 && <p>{countOf(state.notStored, "file")} didn&apos;t reach storage; choose the file again to try those.</p>}
          </div>
        )}
      </div>
      {leaveTo && <LeaveDialog what="the audio restore" onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </section>
  );
}

function Problems({ problems }: { problems: string[] }) {
  return (
    <ul role="alert" className="list-disc space-y-1 rounded-md bg-danger-bg py-2 pl-8 pr-3 text-sm text-danger-strong">
      {problems.map((problem, index) => (
        <li key={index}>{problem}</li>
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { buttonClass, cardClass, errorNoteClass, fileInputClass, labelClass } from "@/components/admin/styles";
import { formatUkDateTime } from "@/lib/candidates/access";
import { countOf } from "@/lib/format";
import { checkFiles, openFilesZip, putBackFiles, type OpenedFiles } from "@/lib/content/backup/missing-files-zip";

type Checked = { fileName: string; opened: OpenedFiles; upload: string[]; notInFile: number; notInFileExamples: string[]; alreadyThere: number };
type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; error: string }
  | ({ status: "checked" } & Checked)
  | ({ status: "putting"; step: string } & Checked)
  | ({ status: "done"; putBack: number; stillMissing: number } & Checked)
  | ({ status: "stopped"; putBack: number; error: string } & Checked);

// After a database backup is restored: the pictures and audio files its records list, from the content and audio backups.
export function RestoreFiles() {
  const [state, setState] = useState<State>({ status: "idle" });
  const putting = state.status === "putting";
  const [leaveTo, setLeaveTo] = useLeaveGuard(putting);
  const router = useRouter();
  const noun = (checked: Checked) => (checked.opened.kind === "pictures" ? "picture file" : "audio file");

  async function onFile(file: File | undefined) {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "working", step: "Opening the backup…" });
    const result = await openFilesZip(file);
    if (!result.ok) {
      setState({ status: "failed", error: `${file.name}: ${result.error}` });
      return;
    }
    setState({ status: "working", step: "Checking storage…" });
    const checked = await checkFiles(result.opened);
    if (!checked.ok) {
      setState({ status: "failed", error: checked.error });
      return;
    }
    setState({
      status: "checked",
      fileName: file.name,
      opened: result.opened,
      upload: checked.upload,
      notInFile: checked.notInFile,
      notInFileExamples: checked.notInFileExamples,
      alreadyThere: checked.alreadyThere,
    });
  }

  async function onPutBack(checked: Checked) {
    setState({ ...checked, status: "putting", step: "Starting…" });
    const result = await putBackFiles(checked.opened, checked.upload, (step) => setState({ ...checked, status: "putting", step }));
    setState(result.ok ? { ...checked, status: "done", putBack: result.putBack, stillMissing: result.stillMissing } : { ...checked, status: "stopped", putBack: result.putBack, error: result.error });
  }

  const shown = state.status === "checked" || state.status === "putting" || state.status === "done" || state.status === "stopped" ? state : null;
  return (
    <section aria-labelledby="restore-files-heading" className={`${cardClass} max-w-3xl space-y-3 p-4`}>
      <div>
        <h2 id="restore-files-heading" className="text-base font-semibold text-ink">
          Put back missing files
        </h2>
        <p className="mt-1 text-sm text-ink">
          After a database backup has been restored into a new project, its pictures and audio files may be missing from storage. Choose a content backup
          (for pictures) or an audio backup (one language). Only files the database lists and storage doesn&apos;t have are uploaded: nothing else changes,
          and no file that&apos;s already there is replaced.
        </p>
      </div>
      <div>
        <label htmlFor="files-zip" className={labelClass}>
          Content or audio backup file
        </label>
        <input
          id="files-zip"
          type="file"
          accept=".zip,application/zip"
          disabled={state.status === "working" || putting}
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
        {state.status === "failed" && (
          <p role="alert" className={errorNoteClass}>
            {state.error}
          </p>
        )}
        {shown && (
          <div className="space-y-1 text-sm text-ink">
            <p className="font-medium [overflow-wrap:anywhere]">{shown.fileName}</p>
            <p className="text-slate-600">
              {shown.opened.what} · made {formatUkDateTime(shown.opened.createdAt)} by {shown.opened.createdBy}
            </p>
            {state.status !== "done" && (
              <p>
                {shown.upload.length > 0 ? `${countOf(shown.upload.length, noun(shown))} to put back` : "Nothing to put back from this file"}
                {` · ${countOf(shown.alreadyThere, noun(shown))} already in storage.`}
              </p>
            )}
            {shown.notInFile > 0 && (
              <p className="text-warn-strong [overflow-wrap:anywhere]">
                {countOf(shown.notInFile, noun(shown))} missing from storage {shown.notInFile === 1 ? "isn't" : "aren't"} in this file
                {shown.opened.kind === "audio" ? " (other languages, or audio made after this backup)" : " (added after this backup was made)"}:{" "}
                {shown.notInFileExamples.join(", ")}
                {shown.notInFile > shown.notInFileExamples.length ? "…" : ""}
              </p>
            )}
          </div>
        )}
        {state.status === "checked" && state.upload.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onPutBack({
                fileName: state.fileName,
                opened: state.opened,
                upload: state.upload,
                notInFile: state.notInFile,
                notInFileExamples: state.notInFileExamples,
                alreadyThere: state.alreadyThere,
              })
            }
            className={buttonClass("primary")}
          >
            Put Back {countOf(state.upload.length, "File")}
          </button>
        )}
        {putting && <p className="text-sm text-ink">{state.step} Please keep this page open.</p>}
        {state.status === "stopped" && (
          <p role="alert" className={errorNoteClass}>
            {state.error} {countOf(state.putBack, noun(state))} put back before it stopped; choose the file again to carry on.
          </p>
        )}
        {state.status === "done" && (
          <div role="status" className="space-y-1 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-strong">
            <p className="font-semibold">Files put back</p>
            <p>
              {countOf(state.putBack, noun(state))} put back.{" "}
              {state.stillMissing > 0 ? `${countOf(state.stillMissing, noun(state))} still missing from storage.` : "Nothing is missing from storage now."}
            </p>
          </div>
        )}
      </div>
      {leaveTo && <LeaveDialog what="putting files back" onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </section>
  );
}

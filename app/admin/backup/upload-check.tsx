"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { Badge } from "@/components/admin/badge";
import { Cell, Row, Table } from "@/components/admin/table";
import { buttonClass, cardClass, fileInputClass, labelClass } from "@/components/admin/styles";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { countOf } from "@/lib/format";
import type { CheckReport, ChangeCounts } from "@/lib/content/import/check";
import { sourceLabel, type BatchIssue } from "@/lib/content/import/format";
import { openBatchZip, pictureType, type OpenedBatch } from "@/lib/content/import/zip";
import type { ImportResult } from "@/lib/content/import/run";
import { prepareImage } from "@/lib/media/prepare-image";

type Opened = Extract<OpenedBatch, { ok: true }>;
type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; message: string }
  | { status: "checked"; fileName: string; report: CheckReport; opened: Opened }
  | { status: "importing"; fileName: string; report: CheckReport; step: string }
  | { status: "imported"; fileName: string; report: CheckReport; result: ImportDone }
  | { status: "importFailed"; fileName: string; report: CheckReport; opened: Opened; message: string };
type ImportDone = Extract<ImportResult, { ok: true }>;

export function UploadCheck() {
  const [state, setState] = useState<State>({ status: "idle" });
  const importing = state.status === "importing";
  const [leaveTo, setLeaveTo] = useLeaveGuard(importing);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "working", step: "Opening the zip and checking its pictures…" });
    const opened = await openBatchZip(file);
    if (!opened.ok) {
      setState({ status: "failed", message: `${file.name}: ${opened.error}` });
      return;
    }
    setState({ status: "working", step: "Checking the batch against the portal…" });
    const result = await sendCheck({ content: opened.content, pictures: opened.files });
    setState("report" in result ? { status: "checked", fileName: file.name, report: result.report, opened } : { status: "failed", message: `${file.name}: ${result.error}` });
  }

  async function runImport(fileName: string, report: CheckReport, opened: Opened) {
    const toSend = report.pictureChanges.filter((picture) => picture.change !== "same");
    for (const [index, picture] of toSend.entries()) {
      setState({ status: "importing", fileName, report, step: `Uploading pictures: ${index + 1} of ${toSend.length} (${picture.file})…` });
      const sent = await sendPicture(picture.file, opened);
      if (!sent.ok) {
        setState({ status: "importFailed", fileName, report, opened, message: `${sent.error} Nothing else was saved; import again to carry on.` });
        return;
      }
    }
    setState({ status: "importing", fileName, report, step: "Saving pages and questions…" });
    const result = await sendImport({ content: opened.content, pictures: opened.files });
    if (!result.ok) {
      setState({ status: "importFailed", fileName, report: result.report ?? report, opened, message: result.error });
      return;
    }
    setState({ status: "imported", fileName, report, result });
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-3 p-4`}>
        <div>
          <label htmlFor="batch-zip" className={labelClass}>
            Batch zip
          </label>
          <p id="batch-zip-hint" className="mt-1 text-sm text-slate-600">
            The zip is opened in your browser and checked first. Nothing is saved until you choose Import; new pages and questions come in as drafts.
          </p>
        </div>
        <input
          id="batch-zip"
          type="file"
          accept=".zip,application/zip"
          aria-describedby="batch-zip-hint"
          disabled={state.status === "working" || importing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same zip again (e.g. after fixing it) checks it again.
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

      {(state.status === "checked" || state.status === "importFailed") && state.report.ok && (
        <ImportPanel report={state.report} message={state.status === "importFailed" ? state.message : null} onImport={() => runImport(state.fileName, state.report, state.opened)} />
      )}
      {state.status === "importFailed" && !state.report.ok && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
          {state.message}
        </p>
      )}
      {importing && (
        <p aria-live="polite" className={`${cardClass} p-4 text-sm text-ink`}>
          {state.step} Please keep this page open.
        </p>
      )}
      {state.status === "imported" && <ImportedPanel result={state.result} report={state.report} />}
      {state.status !== "idle" && state.status !== "working" && state.status !== "failed" && <CheckResult fileName={state.fileName} report={state.report} />}
      {leaveTo && <LeaveDialog what="the import" onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </div>
  );
}

function ImportPanel({ report, message, onImport }: { report: CheckReport; message: string | null; onImport: () => void }) {
  const pages = report.pages.new + report.pages.update;
  const questions = report.questions.new + report.questions.update;
  const pictures = report.pictures.new + report.pictures.update;
  if (pages + questions + pictures === 0) {
    return <p className={`${cardClass} p-4 text-sm text-ink`}>Everything in this batch is already in the portal, unchanged. There&apos;s nothing to import.</p>;
  }
  return (
    <section aria-labelledby="import-heading" className={`${cardClass} space-y-3 p-4`}>
      <h2 id="import-heading" className="text-base font-semibold text-ink">
        Import
      </h2>
      <p className="text-sm text-ink">
        {[countOf(pages, "page"), countOf(questions, "question"), countOf(pictures, "picture")].join(", ")} to add or update. New pages and questions come in
        as drafts; candidates see them once they&apos;re published.
      </p>
      {report.publishedChanges > 0 && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong">
          {report.publishedChanges === 1 ? "1 published item changes" : `${report.publishedChanges} published items change`} straight away: published items stay
          published.
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
          {message}
        </p>
      )}
      <button type="button" onClick={onImport} className={buttonClass("primary")}>
        Import
      </button>
    </section>
  );
}

function ImportedPanel({ result, report }: { result: ImportDone; report: CheckReport }) {
  const line = (counts: ImportDone["pages"]) => `${counts.created} new, ${counts.updated} updated, ${counts.unchanged} unchanged`;
  return (
    <section aria-labelledby="imported-heading" role="status" className="space-y-2 rounded-lg bg-ok-bg p-4 text-sm text-ok-strong ring-1 ring-ok/20">
      <h2 id="imported-heading" className="text-base font-semibold">
        Imported
      </h2>
      <p>
        Pages: {line(result.pages)}. Questions: {line(result.questions)}. Pictures: {report.pictures.new} new, {report.pictures.update} replaced.
      </p>
      <p>
        New items are drafts. Check and publish them on the chapter page:{" "}
        {result.chapters.map((chapter, index) => (
          <span key={chapter.id}>
            {index > 0 && ", "}
            <Link href={`/admin/handbook/chapters/${chapter.id}`} className="font-medium underline underline-offset-2">
              {chapter.name}
            </Link>
          </span>
        ))}
        .
      </p>
    </section>
  );
}

function CheckResult({ fileName, report }: { fileName: string; report: CheckReport }) {
  const errorCount = report.errors.length + report.moreErrors;
  return (
    <section aria-labelledby="check-result" className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="check-result" className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
          {report.batchName || fileName}
        </h2>
        {report.batchName && <span className="text-sm text-slate-600 [overflow-wrap:anywhere]">{fileName}</span>}
        {report.ok ? <Badge tone="success">No problems found</Badge> : <Badge tone="danger">{countOf(errorCount, "problem")} to fix</Badge>}
      </div>

      <Table columns={["Content", "New", "Would update", "Unchanged"]} isEmpty={false} emptyMessage="">
        <CountsRow label="Pages" counts={report.pages} />
        <CountsRow label="Questions" counts={report.questions} />
        <CountsRow label="Pictures" counts={report.pictures} />
      </Table>

      {report.chapters.length > 0 && (
        <Table columns={["Chapter", "Items in batch", "Other items in the chapter"]} isEmpty={false} emptyMessage="">
          {report.chapters.map((chapter) => (
            <Row key={chapter.name}>
              <Cell kind="primary">
                {chapter.name} {!chapter.found && <Badge tone="danger">Not in the portal</Badge>}
              </Cell>
              <Cell label="Items in batch">{chapter.items}</Cell>
              <Cell label="Other items in the chapter">{chapter.notInBatch}</Cell>
            </Row>
          ))}
        </Table>
      )}

      <IssueList title="Problems to fix" issues={report.errors} more={report.moreErrors} tone="danger" />
      <IssueList title="Notes" issues={report.notes} more={report.moreNotes} tone="neutral" />

      {report.skipped.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink">Left out of the batch ({report.skipped.length}), to add by hand</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {report.skipped.map((skip, index) => (
              <li key={index}>
                {skip.sourcePage ? `PDF page ${skip.sourcePage}: ` : ""}
                {skip.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CountsRow({ label, counts }: { label: string; counts: ChangeCounts }) {
  return (
    <Row>
      <Cell kind="primary">{label}</Cell>
      <Cell label="New">{counts.new}</Cell>
      <Cell label="Would update">{counts.update}</Cell>
      <Cell label="Unchanged">{counts.same}</Cell>
    </Row>
  );
}

function IssueList({ title, issues, more, tone }: { title: string; issues: BatchIssue[]; more: number; tone: "danger" | "neutral" }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3 className={`text-sm font-semibold ${tone === "danger" ? "text-danger-strong" : "text-ink"}`}>
        {title} ({issues.length + more})
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {issues.map((issue, index) => (
          <li key={index} className="[overflow-wrap:anywhere]">
            {issue.key && <span className="font-mono text-slate-600">{issue.key} </span>}
            {issue.key && sourceLabel(issue.key) !== issue.key && <span className="text-slate-600">({sourceLabel(issue.key)}) </span>}
            {issue.key && "· "}
            {issue.message}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-sm text-slate-600">…and {more} more.</p>}
    </div>
  );
}

// Its own address (app/api/content/check/route.ts), as a batch can be bigger than other requests may be.
async function sendCheck(body: unknown): Promise<{ report: CheckReport } | { error: string }> {
  try {
    const response = await fetch("/api/content/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = (await response.json()) as { report?: CheckReport; error?: string };
    if (result.report) return { report: result.report };
    return { error: result.error ?? NOT_THROUGH_MESSAGE };
  } catch {
    return { error: NOT_THROUGH_MESSAGE };
  }
}

// One picture of the batch, prepared as on the Media page and sent to /api/content/picture.
async function sendPicture(file: string, opened: Opened): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = opened.pictures.get(file.toLowerCase());
  const info = opened.files.find((entry) => entry.name.toLowerCase() === file.toLowerCase());
  const type = data ? pictureType(data) : null;
  if (!data || !info?.sha256 || !type) return { ok: false, error: `${file} couldn't be read from the zip.` };
  const description = readDescription(opened.content, file);
  try {
    const image = await prepareImage(new File([data as BlobPart], file, { type }));
    const form = new FormData();
    form.set("file", image.main);
    form.set("thumb", image.thumb);
    form.set("sourceName", file);
    form.set("sha256", info.sha256);
    form.set("altText", description);
    const response = await fetch("/api/content/picture", { method: "POST", body: form });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? NOT_THROUGH_MESSAGE };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? `${file}: ${error.message}` : NOT_THROUGH_MESSAGE };
  }
}

// The picture's description from content.json (already checked on the server).
function readDescription(content: unknown, file: string): string {
  const pictures = content && typeof content === "object" && Array.isArray((content as { pictures?: unknown }).pictures) ? (content as { pictures: unknown[] }).pictures : [];
  for (const picture of pictures) {
    if (picture && typeof picture === "object" && String((picture as { file?: unknown }).file).toLowerCase() === file.toLowerCase()) {
      return String((picture as { description?: unknown }).description ?? "");
    }
  }
  return "";
}

async function sendImport(body: unknown): Promise<ImportResult> {
  try {
    const response = await fetch("/api/content/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = (await response.json()) as ImportResult;
    return typeof result?.ok === "boolean" ? result : { ok: false, error: NOT_THROUGH_MESSAGE };
  } catch {
    return { ok: false, error: NOT_THROUGH_MESSAGE };
  }
}

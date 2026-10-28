"use client";

import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { Cell, Row, Table } from "@/components/admin/table";
import { cardClass, fileInputClass, labelClass } from "@/components/admin/styles";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { countOf } from "@/lib/format";
import type { CheckReport, ChangeCounts } from "@/lib/content/import/check";
import { sourceLabel, type BatchIssue } from "@/lib/content/import/format";
import { openBatchZip } from "@/lib/content/import/zip";

type State =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "failed"; message: string }
  | { status: "checked"; fileName: string; report: CheckReport };

export function UploadCheck() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function onFile(file: File | undefined) {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "working", step: "Opening the zip and checking its pictures…" });
    const opened = await openBatchZip(file);
    if (!opened.ok) {
      setState({ status: "failed", message: opened.error });
      return;
    }
    setState({ status: "working", step: "Checking the batch against the portal…" });
    const result = await sendCheck({ content: opened.content, pictures: opened.files });
    setState("report" in result ? { status: "checked", fileName: file.name, report: result.report } : { status: "failed", message: result.error });
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-3 p-4`}>
        <div>
          <label htmlFor="batch-zip" className={labelClass}>
            Batch zip
          </label>
          <p id="batch-zip-hint" className="mt-1 text-sm text-slate-600">
            The zip is opened in your browser; only content.json and the picture names are sent for checking. Nothing is saved: importing comes in the
            next step.
          </p>
        </div>
        <input
          id="batch-zip"
          type="file"
          accept=".zip,application/zip"
          aria-describedby="batch-zip-hint"
          disabled={state.status === "working"}
          onChange={(event) => onFile(event.target.files?.[0])}
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

      {state.status === "checked" && <CheckResult fileName={state.fileName} report={state.report} />}
    </div>
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
      <p className="text-sm text-slate-600">Nothing has been saved.</p>
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

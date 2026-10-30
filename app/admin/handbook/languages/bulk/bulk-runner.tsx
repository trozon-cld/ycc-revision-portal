"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { formatBytes, formatCount, formatDuration } from "@/lib/format";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import type { BulkItem, BulkOutcome, BulkPlan, BulkStep, BulkStepResult } from "@/lib/voice/bulk";
import { SOURCE_LANGUAGE } from "@/lib/voice/languages";
import { BULK_FAILURES_BEFORE_PAUSE, BULK_PAUSE_MS, BULK_RETRY_WAITS_MS } from "@/lib/voice/limits";
import { bulkStepAction, finishBulkRunAction, startBulkRunAction } from "./actions";

// What's left of this person's limits, for the estimate (characters; Google's free month; Gemini's calls).
export type BulkLimits = {
  hourLeft: { translate: number; speech: number };
  hourLimit: { translate: number; speech: number };
  monthFreeLeft: { translate: number; speech: number };
  pricePerMillion: { translate: number; speech: number };
  gemini: { perDay: number | null; perMinute: number | null; usedToday: number; resets: string } | null;
};

type Failed = { label: string; error: string };
type Ended = { outcome: BulkOutcome; message: string };
type RunView = {
  phase: "idle" | "starting" | "running" | "ended";
  total: number;
  // Items finished, whatever the result.
  processed: number;
  current: string | null;
  // A wait before trying again, with its countdown (not read out every second).
  wait: string | null;
  translated: number;
  audio: number;
  skipped: number;
  failed: Failed[];
  characters: { translate: number; speech: number };
  elapsedMs: number;
  etaMs: number | null;
  ended: Ended | null;
  error: string | null;
  stopping: boolean;
};

const IDLE: RunView = {
  phase: "idle",
  total: 0,
  processed: 0,
  current: null,
  wait: null,
  translated: 0,
  audio: 0,
  skipped: 0,
  failed: [],
  characters: { translate: 0, speech: 0 },
  elapsedMs: 0,
  etaMs: null,
  ended: null,
  error: null,
  stopping: false,
};

// How one item went: done (or nothing needed), failed (the run carries on), or the run must stop.
type ItemOutcome =
  | { kind: "done"; skipped: boolean }
  | { kind: "failed"; error: string; temporary: boolean }
  | { kind: "stop"; error: string; limit: boolean }
  // Stop was pressed while it waited to try again: not done, not counted.
  | { kind: "stopped" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function BulkRunner({ plan, limits, closeHref }: { plan: BulkPlan; limits: BulkLimits; closeHref: string }) {
  const router = useRouter();
  const [view, setView] = useState<RunView>(IDLE);
  const stopRef = useRef(false);
  const running = view.phase === "starting" || view.phase === "running";
  const [leaveTo, setLeaveTo] = useLeaveGuard(running);
  const name = plan.language.name;
  const update = (patch: Partial<RunView>) => setView((current) => ({ ...current, ...patch }));

  // Counts down a wait; Stop ends it early.
  async function waitFor(ms: number, text: (seconds: number) => string) {
    const end = Date.now() + ms;
    while (!stopRef.current) {
      const left = end - Date.now();
      if (left <= 0) break;
      update({ wait: text(Math.ceil(left / 1000)) });
      await sleep(Math.min(1000, left));
    }
    update({ wait: null });
  }

  // One step, tried again after busy / timeout / connection problems; a per-minute limit waits as long as it says.
  async function runStep(runId: string, item: BulkItem, step: BulkStep): Promise<ItemOutcome> {
    const service = step === "translate" || !plan.language.gemini ? "Google" : "Gemini";
    let attempt = 0;
    let limitWaits = 0;
    while (!stopRef.current) {
      const result: BulkStepResult = (await reachServer(() => bulkStepAction({ runId, kind: item.kind, id: item.id, step }))) ?? {
        ok: false,
        error: NOT_THROUGH_MESSAGE,
        failure: "retry",
      };
      if (result.ok) {
        update({ translated: result.counts.translated, audio: result.counts.audio, characters: result.counts.characters });
        return { kind: "done", skipped: result.skipped };
      }
      if (result.failure === "stop") return { kind: "stop", error: result.error, limit: result.limit === true };
      if (result.failure !== "retry") return { kind: "failed", error: result.error, temporary: false };
      if (result.waitMs && limitWaits < 30) {
        limitWaits++;
        await waitFor(result.waitMs, (seconds) => `Waiting for ${name}'s Gemini limit per minute: carrying on in ${seconds} seconds…`);
        continue;
      }
      if (attempt >= BULK_RETRY_WAITS_MS.length) return { kind: "failed", error: result.error, temporary: true };
      const wait = BULK_RETRY_WAITS_MS[attempt++];
      await waitFor(wait, (seconds) => `${service} is busy or didn't answer. Trying ${item.label} again in ${seconds} seconds…`);
    }
    return { kind: "stopped" };
  }

  async function runItem(runId: string, item: BulkItem, index: number, total: number): Promise<ItemOutcome> {
    let skipped = true;
    if (item.translate) {
      update({ current: `Translating ${item.label} into ${name} (${index + 1} of ${total})…` });
      const outcome = await runStep(runId, item, "translate");
      if (outcome.kind !== "done") return outcome;
      skipped = outcome.skipped;
    }
    if (item.audio && !stopRef.current) {
      update({ current: `Making ${name} audio for ${item.label} (${index + 1} of ${total})…` });
      const outcome = await runStep(runId, item, "audio");
      if (outcome.kind !== "done") return outcome;
      skipped = skipped && outcome.skipped;
    }
    return { kind: "done", skipped };
  }

  async function start() {
    stopRef.current = false;
    setView({ ...IDLE, phase: "starting", current: "Starting…" });
    const started = await reachServer(() => startBulkRunAction(plan.chapter.id, plan.language.code));
    if (!started || !started.ok) {
      setView({ ...IDLE, error: started?.error ?? NOT_THROUGH_MESSAGE });
      return;
    }
    const items = started.plan.todo;
    const startedAt = Date.now();
    update({ phase: "running", total: items.length });

    const failed: Failed[] = [];
    let skipped = 0;
    let inARow = 0;
    let pausedAlready = false;
    let ended: Ended | null = null;
    for (const [index, item] of items.entries()) {
      if (stopRef.current) break;
      const outcome = await runItem(started.runId, item, index, items.length);
      if (outcome.kind === "stopped") break;
      if (outcome.kind === "stop") {
        failed.push({ label: item.label, error: outcome.error });
        ended = { outcome: outcome.limit ? "limit" : "stopped", message: `${outcome.error} Everything done so far is saved; start again to carry on.` };
        break;
      }
      if (outcome.kind === "failed") {
        failed.push({ label: item.label, error: outcome.error });
        inARow = outcome.temporary ? inARow + 1 : 0;
      } else {
        inARow = 0;
        pausedAlready = false;
        if (outcome.skipped) skipped++;
      }
      const elapsedMs = Date.now() - startedAt;
      const processed = index + 1;
      update({
        processed,
        skipped,
        failed: [...failed],
        elapsedMs,
        etaMs: processed >= 3 ? Math.round((elapsedMs / processed) * (items.length - processed)) : null,
      });
      // Several temporary failures in a row: pause once, then stop if it carries on.
      if (inARow >= BULK_FAILURES_BEFORE_PAUSE || (pausedAlready && inARow > 0)) {
        if (pausedAlready) {
          ended = {
            outcome: "stopped",
            message: "The voice service is having problems at the moment. Everything done so far is saved. Please try again later.",
          };
          break;
        }
        pausedAlready = true;
        inARow = 0;
        await waitFor(BULK_PAUSE_MS, (seconds) => `${BULK_FAILURES_BEFORE_PAUSE} items in a row didn't work. Pausing, then carrying on in ${seconds} seconds…`);
      }
    }
    if (!ended) {
      ended = stopRef.current
        ? { outcome: "stopped", message: "Stopped. Everything done so far is saved; start again to carry on from here." }
        : {
            outcome: "finished",
            message: failed.length > 0 ? `Finished, but ${formatCount(failed.length, "item")} didn't work. Retry them below.` : "Finished.",
          };
    }
    update({ current: null, wait: null, elapsedMs: Date.now() - startedAt, etaMs: null });
    const finished = await reachServer(() => finishBulkRunAction({ runId: started.runId, outcome: ended.outcome, failed: failed.length }));
    update({ phase: "ended", ended, error: finished && finished.ok ? null : "The run's log entry couldn't be saved. It will be added when this chapter is next run." });
    router.refresh();
  }

  function stop() {
    stopRef.current = true;
    update({ stopping: true, current: "Stopping after this step…" });
  }

  const percent = view.total > 0 ? Math.round((view.processed / view.total) * 100) : 0;

  return (
    <div className={`${cardClass} space-y-4 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="run-heading" className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
            {plan.chapter.label} in {name}
          </h2>
          <p className="text-sm text-slate-600">
            {formatCount(plan.done)} of {formatCount(plan.total, "item")} done · {formatCount(plan.todo.length)} to do
            {plan.waiting.length > 0 && ` · ${formatCount(plan.waiting.length)} waiting for a person to check`}
          </p>
        </div>
        {!running && (
          <Link href={closeHref} className={buttonClass("secondary", "sm")}>
            Close
          </Link>
        )}
      </div>

      {view.phase === "idle" && <Estimate plan={plan} limits={limits} />}

      {view.error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
          {view.error}
        </p>
      )}

      {view.phase !== "idle" && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">
                {formatCount(view.processed)} of {formatCount(view.total || plan.todo.length, "item")}
              </span>
              <span className="tabular-nums text-slate-600">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Bulk Listen progress"
              aria-valuemin={0}
              aria-valuemax={view.total || plan.todo.length}
              aria-valuenow={view.processed}
              aria-valuetext={`${view.processed} of ${view.total || plan.todo.length} items`}
              className="h-3 overflow-hidden rounded-full bg-slate-200"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <p aria-live="polite" className="min-h-5 text-sm text-ink [overflow-wrap:anywhere]">
            {view.current}
          </p>
          {view.wait && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">{view.wait}</p>}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {plan.language.code !== SOURCE_LANGUAGE && <Figure label="Translated and checked" value={view.translated} />}
            <Figure label="Audio made" value={view.audio} />
            <Figure label="Already done" value={view.skipped} />
            <Figure label="Failed" value={view.failed.length} />
            <div>
              <dt className="text-slate-600">Time</dt>
              <dd className="tabular-nums text-ink">{formatDuration(Math.round(view.elapsedMs / 1000))}</dd>
            </div>
            <div>
              <dt className="text-slate-600">About left</dt>
              <dd className="tabular-nums text-ink">{view.etaMs === null ? "—" : formatDuration(Math.round(view.etaMs / 1000))}</dd>
            </div>
          </dl>
          <p className="text-sm text-slate-600">
            Characters this run: {formatCount(view.characters.translate)} translation · {formatCount(view.characters.speech)} audio. Left this
            hour when it started: {formatCount(limits.hourLeft.translate)} translation · {formatCount(limits.hourLeft.speech)} audio.
          </p>
        </div>
      )}

      {view.phase === "ended" && view.ended && (
        <div role="status" className={`rounded-md px-3 py-2 text-sm ring-1 ${view.ended.outcome === "finished" && view.failed.length === 0 ? "bg-ok-bg text-ok-strong ring-ok/20" : "bg-warn-bg text-warn-strong ring-warn/25"}`}>
          {view.ended.message}
        </div>
      )}

      {view.phase === "ended" && view.failed.length > 0 && (
        <details open={view.failed.length <= 5} className="text-sm">
          <summary className="cursor-pointer font-medium text-ink">Didn&apos;t work ({formatCount(view.failed.length)})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-ink">
            {view.failed.map((item, index) => (
              <li key={index} className="[overflow-wrap:anywhere]">
                {item.label}: <span className="text-slate-700">{item.error}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {view.phase === "idle" && (
          <button type="button" onClick={start} className={buttonClass("primary")}>
            Start
          </button>
        )}
        {running && (
          <button type="button" onClick={stop} disabled={view.stopping} className={buttonClass("secondary")}>
            Stop
          </button>
        )}
        {view.phase === "ended" && plan.todo.length > 0 && (
          <button type="button" onClick={start} className={buttonClass("primary")}>
            {view.failed.length > 0 ? `Retry failed (${formatCount(view.failed.length)})` : "Start again"}
          </button>
        )}
      </div>

      {leaveTo && (
        <LeaveDialog
          what="the run"
          running="The run stops after its current step. Everything done so far is saved, and starting it again carries on from there."
          onStay={() => setLeaveTo(null)}
          onLeave={() => {
            stopRef.current = true;
            router.push(leaveTo);
          }}
        />
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums text-ink">{formatCount(value)}</dd>
    </div>
  );
}

// Before starting: what the run will do and roughly what it uses.
function Estimate({ plan, limits }: { plan: BulkPlan; limits: BulkLimits }) {
  const toTranslate = plan.todo.filter((item) => item.translate).length;
  const toAudio = plan.todo.filter((item) => item.audio).length;
  const { estimate } = plan;
  const name = plan.language.name;
  const cost = (kind: "translate" | "speech", characters: number) =>
    (Math.max(0, characters - limits.monthFreeLeft[kind]) / 1_000_000) * limits.pricePerMillion[kind];
  const translateCost = cost("translate", estimate.translate);
  const speechCost = plan.language.gemini ? 0 : cost("speech", estimate.speech);
  const overHour = estimate.translate > limits.hourLeft.translate || estimate.speech > limits.hourLeft.speech;
  const gemini = limits.gemini;
  const geminiLeft = gemini?.perDay != null ? Math.max(0, gemini.perDay - gemini.usedToday) : null;
  const waiting = plan.waiting.slice(0, 5).join(", ") + (plan.waiting.length > 5 ? ` and ${plan.waiting.length - 5} more` : "");

  return (
    <div className="space-y-2 text-sm text-ink">
      <ul className="list-disc space-y-1 pl-5">
        {toTranslate > 0 && (
          <li>
            {formatCount(toTranslate, "item")} to translate into {name} and mark as checked automatically
            {plan.replaces > 0 && ` (${formatCount(plan.replaces)} of them replace an out-of-date translation)`}.
          </li>
        )}
        <li>{formatCount(toAudio, "item")} to give audio.</li>
        {plan.waiting.length > 0 && <li>Left alone, waiting for a person to check their draft: {waiting}.</li>}
        <li>
          About {estimate.translate > 0 && `${formatCount(estimate.translate)} characters of translation and `}
          {formatCount(estimate.speech)} characters of audio, about {formatBytes(estimate.storageBytes)} of storage.
        </li>
        <li>
          {translateCost + speechCost > 0
            ? `About $${(translateCost + speechCost).toFixed(2)} beyond this month's free Google allowance.`
            : "Within this month's free Google allowance."}
        </li>
        {gemini && (
          <li>
            {name} audio uses Gemini: about {formatCount(estimate.geminiCalls, "call")}
            {geminiLeft !== null && `; ${formatCount(geminiLeft)} of ${formatCount(gemini.perDay!)} left today (starts again at ${gemini.resets} UK time)`}
            {gemini.perMinute !== null && `, at most ${gemini.perMinute} a minute`}. The run stops when the daily limit is reached; start it again
            after that.
          </li>
        )}
      </ul>
      {overHour && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-warn-strong ring-1 ring-warn/25">
          This is more than is left of your hourly limit, so the run will stop at the limit. Start it again later to carry on.
        </p>
      )}
    </div>
  );
}

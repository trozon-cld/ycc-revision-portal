"use client";

import { useState, type ReactNode } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { formatUkDateTime } from "@/lib/candidates/access";
import type { LanguageName } from "@/lib/voice/languages";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import type { TranslationState } from "@/lib/voice/status";
import { TranslationBadge } from "./translation-badge";

export type TranslationProblem = { message: string; conflict?: boolean };

// The Translations pages' bar (page and question): the language and its state, Translate / Translate again (asks
// first) / Mark as checked / Save, and what went wrong. Each editor keeps its own texts and server actions.
export function TranslationToolbar({
  what,
  language,
  state,
  summary,
  outdatedLine,
  dirty,
  isTranslating,
  isChecking,
  isSaving,
  canSave = true,
  unavailable = null,
  notice,
  problem,
  onTranslate,
  onCheck,
  onSave,
}: {
  what: "page" | "question";
  language: LanguageName;
  state: TranslationState;
  summary: TranslationSummary | null;
  // What the state line says when the English has changed since the translation was made.
  outdatedLine: string;
  dirty: boolean;
  isTranslating: boolean;
  isChecking: boolean;
  isSaving: boolean;
  canSave?: boolean;
  // Why nothing can be translated now (shown as the buttons' title).
  unavailable?: string | null;
  // Shown under the bar, before any problem (e.g. why translating is unavailable).
  notice?: ReactNode;
  problem: TranslationProblem | null;
  onTranslate: () => void;
  onCheck: () => void;
  onSave: () => void;
}) {
  const [confirmAgain, setConfirmAgain] = useState(false);
  const busy = isSaving || isChecking || isTranslating;
  const translate = () => {
    setConfirmAgain(false);
    onTranslate();
  };

  return (
    <>
      <div className={`${cardClass} mt-4 flex flex-wrap items-center gap-3 p-3`}>
        <div className="mr-auto min-w-0 text-sm text-slate-700">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">
              {language.name} <span lang={language.code}>{language.nativeName}</span>
            </span>
            <TranslationBadge state={state} />
          </p>
          <p className="mt-0.5 text-xs text-slate-600" aria-live="polite">
            {busy
              ? isTranslating
                ? `Translating into ${language.name}… this can take up to a minute.`
                : "Saving…"
              : dirty
                ? "Unsaved changes"
                : summary
                  ? stateLine(state, summary, outdatedLine)
                  : "No translation yet."}
          </p>
        </div>
        {summary ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmAgain(true)}
              disabled={busy || unavailable !== null}
              title={unavailable ?? undefined}
              className={buttonClass("secondary")}
            >
              {isTranslating ? "Translating…" : "Translate again"}
            </button>
            <button
              type="button"
              onClick={onCheck}
              disabled={busy || dirty || state !== "draft"}
              title={dirty ? "Save your changes first" : state === "outdated" ? `The English ${what} changed: translate again or edit and save first` : undefined}
              className={buttonClass("secondary")}
            >
              {isChecking ? "Saving…" : state === "checked" ? "Checked" : "Mark as checked"}
            </button>
            <button type="button" onClick={onSave} disabled={busy || !dirty || !canSave} className={buttonClass("primary")}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" onClick={translate} disabled={busy || unavailable !== null} title={unavailable ?? undefined} className={buttonClass("primary")}>
            {isTranslating ? "Translating…" : `Translate into ${language.name}`}
          </button>
        )}
      </div>

      {notice}
      {problem && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
          <p className="min-w-0 flex-1">{problem.message}</p>
          {problem.conflict && (
            <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary", "sm")}>
              Reload page
            </button>
          )}
        </div>
      )}
      {confirmAgain && (
        <div role="alertdialog" aria-labelledby="again-title" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          <p id="again-title" className="font-medium">
            Translate the {what} into {language.name} again?
          </p>
          <p className="mt-0.5">This replaces the current text, including any corrections. The new translation starts as a draft.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={translate} className={buttonClass("primary", "sm")}>
              Translate again
            </button>
            <button type="button" onClick={() => setConfirmAgain(false)} className={buttonClass("secondary", "sm")}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function stateLine(state: TranslationState, summary: TranslationSummary, outdatedLine: string): string {
  if (state === "checked") return `Checked ${formatUkDateTime(summary.checkedAt ?? summary.updatedAt)}.`;
  if (state === "outdated") return outdatedLine;
  return `Draft, last changed ${formatUkDateTime(summary.updatedAt)}. Not checked yet.`;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ListBackLink } from "@/components/admin/list-place";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { buttonClass, cardClass, inputClass, textareaClass } from "@/components/admin/styles";
import { useToast } from "@/components/admin/toast";
import { formatUkDateTime } from "@/lib/candidates/access";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { optionLetter } from "@/lib/questions/types/single-text";
import { TRANSLATED_LANGUAGES, voiceLanguage } from "@/lib/voice/languages";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import { QUESTION_CURRENT_VERSION, type QuestionText } from "@/lib/voice/question-listen";
import { areasPhrase, choosePhrase } from "@/lib/voice/reading";
import { translationState } from "@/lib/voice/status";
import { TranslationBadge } from "@/app/admin/handbook/pages/translation-badge";
import { checkQuestionTranslation, saveQuestionTranslation, translateQuestionLanguage } from "../../voice-actions";

type Texts = { stem: string; options: Record<string, string> };

// One language of one question page: the English question and options beside their translation, with save,
// check and translate again. Only what Listen reads is translated (not the explanation). Remounted after every save.
export function QuestionTranslationsEditor({
  questionId,
  refLabel,
  english,
  language,
  summaries,
  unavailable,
  current,
}: {
  questionId: string;
  refLabel: string;
  english: QuestionText;
  language: string;
  summaries: TranslationSummary[];
  unavailable: string | null;
  current: { summary: TranslationSummary; texts: QuestionText; optionsChanged: boolean } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const lang = voiceLanguage(language)!;
  const initialTexts = useMemo<Texts>(
    () => ({ stem: current?.texts.stem ?? "", options: Object.fromEntries((current?.texts.options ?? []).map((option) => [option.id, option.text])) }),
    [current]
  );
  const [texts, setTexts] = useState<Texts>(initialTexts);
  const [problem, setProblem] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isChecking, startChecking] = useTransition();
  const [isTranslating, startTranslating] = useTransition();

  const summary = current?.summary ?? null;
  const state = translationState(QUESTION_CURRENT_VERSION, summary);
  const dirty = JSON.stringify(texts) !== JSON.stringify(initialTexts);
  const busy = isSaving || isChecking || isTranslating;
  const editable = current !== null && !current.optionsChanged;
  const [leaveTo, setLeaveTo] = useLeaveGuard(dirty);
  const href = `/admin/questions/${questionId}/translations`;

  function translate() {
    setConfirmAgain(false);
    setProblem(null);
    startTranslating(async () => {
      const result = await reachServer(() => translateQuestionLanguage(questionId, language));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error });
      else toast(`${lang.name} translation ready. Read it through, then mark it as checked.`);
    });
  }

  function save() {
    if (!summary || !dirty) return;
    setProblem(null);
    const edited: QuestionText = { stem: texts.stem, options: english.options.map((option) => ({ id: option.id, text: texts.options[option.id] ?? "" })) };
    startSaving(async () => {
      const result = await reachServer(() => saveQuestionTranslation({ questionId, language, expectedRevision: summary.revision, texts: edited }));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error, conflict: result.conflict });
      else toast("Translation saved. It's a draft until it's checked.");
    });
  }

  function check() {
    if (!summary) return;
    setProblem(null);
    startChecking(async () => {
      const result = await reachServer(() => checkQuestionTranslation(questionId, language, summary.revision));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error, conflict: result.conflict });
      else toast("Translation marked as checked.");
    });
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <ListBackLink list="questions" href="/admin/questions" className="text-primary underline underline-offset-2 hover:text-ink">
          Question bank
        </ListBackLink>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <Link href={`/admin/questions/${questionId}`} className="text-primary underline underline-offset-2 hover:text-ink">
          {refLabel}
        </Link>
      </nav>
      <h1 className="text-xl font-semibold text-ink">Translations</h1>
      <p className="mt-0.5 text-sm text-slate-600">
        The question and its options are drafted by the voice service from the saved English question. The explanation isn&apos;t translated: Listen
        reads only what the page shows before the answer is checked. Read each one through and correct it, then mark it as checked.
      </p>

      <div role="group" aria-label="Language" className="mt-4 flex flex-wrap gap-2">
        {TRANSLATED_LANGUAGES.map((item) => {
          const isCurrent = item.code === language;
          const itemState = translationState(QUESTION_CURRENT_VERSION, summaries.find((row) => row.language === item.code) ?? null);
          return (
            <Link
              key={item.code}
              href={`${href}?lang=${item.code}`}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isCurrent ? "border-primary bg-primary/10 text-ink" : "border-slate-300 bg-white text-ink hover:bg-slate-100"
              }`}
            >
              {item.name}
              <TranslationBadge state={itemState} />
            </Link>
          );
        })}
      </div>

      <div className={`${cardClass} mt-4 flex flex-wrap items-center gap-3 p-3`}>
        <div className="mr-auto min-w-0 text-sm text-slate-700">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">
              {lang.name} <span lang={lang.code}>{lang.nativeName}</span>
            </span>
            <TranslationBadge state={state} />
          </p>
          <p className="mt-0.5 text-xs text-slate-600" aria-live="polite">
            {busy
              ? isTranslating
                ? `Translating into ${lang.name}… this can take up to a minute.`
                : "Saving…"
              : dirty
                ? "Unsaved changes"
                : summary
                  ? stateLine(state, summary)
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
              onClick={check}
              disabled={busy || dirty || state !== "draft"}
              title={dirty ? "Save your changes first" : state === "outdated" ? "The English question changed: translate again or edit and save first" : undefined}
              className={buttonClass("secondary")}
            >
              {isChecking ? "Saving…" : state === "checked" ? "Checked" : "Mark as checked"}
            </button>
            <button type="button" onClick={save} disabled={busy || !dirty || !editable} className={buttonClass("primary")}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" onClick={translate} disabled={busy || unavailable !== null} title={unavailable ?? undefined} className={buttonClass("primary")}>
            {isTranslating ? "Translating…" : `Translate into ${lang.name}`}
          </button>
        )}
      </div>

      {unavailable && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{unavailable}</p>}
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
          <p id="again-title" className="font-medium">Translate the question into {lang.name} again?</p>
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
      {current?.optionsChanged && (
        <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          The English options were added, removed or moved since this was translated, so it can&apos;t be edited. Translate the question again.
        </p>
      )}

      {english.pick && (
        <p className="mt-3 text-sm text-slate-700">
          After the question, Listen reads &ldquo;{choosePhrase(voiceLanguage("en")!, english.pick)}&rdquo; in fixed wording:{" "}
          <span lang={lang.code}>&ldquo;{choosePhrase(lang, english.pick)}&rdquo;</span> in {lang.name}. It isn&apos;t translated by the voice service.
        </p>
      )}
      {english.areas && (
        <p className="mt-3 text-sm text-slate-700">
          After the question, Listen reads &ldquo;{areasPhrase(voiceLanguage("en")!, english.areas)}&rdquo; in fixed wording:{" "}
          <span lang={lang.code}>&ldquo;{areasPhrase(lang, english.areas)}&rdquo;</span> in {lang.name}. The areas themselves aren&apos;t read, and
          this isn&apos;t translated by the voice service.
        </p>
      )}
      {english.boxes && (
        <p className="mt-3 text-sm text-slate-700">
          After the question, Listen reads &ldquo;{voiceLanguage("en")!.questionLabels.matchBoxes}. {voiceLanguage("en")!.questionLabels.boxesAre}&rdquo; in
          fixed wording (<span lang={lang.code}>&ldquo;{lang.questionLabels.matchBoxes}. {lang.questionLabels.boxesAre}&rdquo;</span> in {lang.name}), then the
          box labels below. The pictures aren&apos;t read.
        </p>
      )}
      {english.tap && (
        <p className="mt-3 text-sm text-slate-700">
          After the question, Listen reads &ldquo;{voiceLanguage("en")!.questionLabels.tapArea}&rdquo; in fixed wording:{" "}
          <span lang={lang.code}>&ldquo;{lang.questionLabels.tapArea}&rdquo;</span> in {lang.name}. The answer spot is never read, and this
          isn&apos;t translated by the voice service.
        </p>
      )}
      {english.options.some((option) => option.from === "description") && (
        <p className="mt-3 text-sm text-slate-700">
          Options without a label are read using their picture&apos;s description from Media. Make sure those descriptions say what the
          picture shows without hinting at the right answer.
        </p>
      )}
      {editable && (
        <ol className="mt-4 space-y-3">
          <li className={`${cardClass} p-3`}>
            <TextRow
              id="tr-stem"
              label="Question"
              english={english.stem}
              language={lang.code}
              languageName={lang.name}
              value={texts.stem}
              multiline
              onChange={(value) => setTexts((all) => ({ ...all, stem: value }))}
            />
          </li>
          {english.options.map((option, index) => (
            <li key={option.id} className={`${cardClass} p-3`}>
              <TextRow
                id={`tr-${option.id}`}
                label={`${english.boxes ? `Box ${index + 1}` : `Option ${optionLetter(index)}`}${option.from === "label" ? " · picture label" : option.from === "description" ? " · picture description (no label)" : ""}`}
                english={option.text}
                language={lang.code}
                languageName={lang.name}
                value={texts.options[option.id] ?? ""}
                onChange={(value) => setTexts((all) => ({ ...all, options: { ...all.options, [option.id]: value } }))}
              />
            </li>
          ))}
        </ol>
      )}

      {leaveTo && (
        <LeaveDialog
          what="this translation"
          onStay={() => setLeaveTo(null)}
          onLeave={() => {
            const target = leaveTo;
            setTexts(initialTexts);
            setLeaveTo(null);
            router.push(target);
          }}
        />
      )}
    </>
  );
}

function TextRow({
  id,
  label,
  english,
  language,
  languageName,
  value,
  multiline = false,
  onChange,
}: {
  id: string;
  label: string;
  english: string;
  language: string;
  languageName: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-slate-600">English</p>
          <p lang="en-GB" className="whitespace-pre-wrap text-sm text-ink">{english}</p>
        </div>
        <div className="min-w-0">
          <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
            {languageName}
          </label>
          {multiline ? (
            <textarea id={id} lang={language} value={value} rows={3} onChange={(event) => onChange(event.target.value)} className={textareaClass} />
          ) : (
            <input id={id} lang={language} type="text" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
          )}
        </div>
      </div>
    </>
  );
}

function stateLine(state: ReturnType<typeof translationState>, summary: TranslationSummary): string {
  if (state === "checked") return `Checked ${formatUkDateTime(summary.checkedAt ?? summary.updatedAt)}.`;
  if (state === "outdated") return "The English question or options have changed since this was translated.";
  return `Draft, last changed ${formatUkDateTime(summary.updatedAt)}. Not checked yet.`;
}

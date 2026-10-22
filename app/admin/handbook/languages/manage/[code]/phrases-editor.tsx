"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/admin/badge";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { buttonClass, cardClass, inputClass } from "@/components/admin/styles";
import { useToast } from "@/components/admin/toast";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import type { ExpectedPhrases, LanguagePhrases, LanguageResult } from "@/lib/voice/language-admin";
import { LANGUAGES_MANAGE_PATH } from "@/lib/voice/language-tabs";
import { phraseKeysFor, SOURCE_LANGUAGE, type PhraseKey } from "@/lib/voice/languages";
import { VOICE_PHRASE_MAX_LENGTH } from "@/lib/voice/limits";
import { PHRASE_INFO } from "@/lib/voice/phrases";
import { checkLanguagePhrases, draftLanguagePhrases, publishLanguageNow, saveLanguagePhrases } from "../actions";

type Texts = Partial<Record<PhraseKey, string>>;
type Confirm = "draft" | "live" | null;

// One language's fixed spoken phrases beside the English: draft with the voice service, correct, check, make live.
// Remounted whenever the stored phrases or the status change.
export function PhrasesEditor({ view }: { view: LanguagePhrases }) {
  const router = useRouter();
  const toast = useToast();
  const { language, english, phrases } = view;
  const isSource = language.code === SOURCE_LANGUAGE;
  const isHidden = language.status === "hidden";
  const keys = phraseKeysFor(language.code);
  const expected: ExpectedPhrases = Object.fromEntries(keys.flatMap((key) => (phrases[key] ? [[key, phrases[key].text]] : [])));
  const initialTexts = Object.fromEntries(keys.map((key) => [key, phrases[key]?.text ?? ""])) as Texts;
  const [texts, setTexts] = useState<Texts>(initialTexts);
  const [problem, setProblem] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [confirming, setConfirming] = useState<Confirm>(null);
  const [running, setRunning] = useState<"draft" | "save" | "check" | "live" | null>(null);
  const [isPending, startTransition] = useTransition();

  const written = keys.filter((key) => phrases[key]).length;
  const checked = keys.filter((key) => phrases[key]?.status === "checked").length;
  const total = keys.length;
  const dirty = keys.some((key) => texts[key] !== initialTexts[key]);
  const busy = isPending;
  const [leaveTo, setLeaveTo] = useLeaveGuard(dirty);

  function run(kind: "draft" | "save" | "check" | "live", action: () => Promise<LanguageResult>) {
    setConfirming(null);
    setProblem(null);
    setRunning(kind);
    startTransition(async () => {
      const result = await reachServer(action);
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error, conflict: result.conflict });
      else if (result.message) toast(result.message);
    });
  }

  const statusLine = busy
    ? running === "draft"
      ? `Drafting ${language.name} phrases… this can take up to a minute.`
      : "Saving…"
    : dirty
      ? "Unsaved changes"
      : written === 0
        ? "No phrases yet."
        : written < total
          ? `${written} of ${total} phrases written.`
          : checked === total
            ? `All ${total} phrases checked.`
            : `${checked} of ${total} phrases checked.`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <Link href={LANGUAGES_MANAGE_PATH} className="text-primary underline underline-offset-2 hover:text-ink">
          Languages
        </Link>
      </nav>
      <h1 className="text-xl font-semibold text-ink">
        {language.name} spoken phrases{" "}
        {!isSource && (
          <span lang={language.code} className="font-normal text-slate-600">
            {language.nativeName}
          </span>
        )}
      </h1>
      <p className="mt-0.5 max-w-3xl text-sm text-slate-600">
        {isSource
          ? "The fixed wording Listen reads around the English text. Every other language's phrases are drafted from these."
          : "The fixed wording Listen reads around the translated text. Draft it with the voice service, read it through and correct it, then mark it as checked."}
      </p>

      <div className={`${cardClass} mt-4 flex flex-wrap items-center gap-3 p-3`}>
        <div className="mr-auto min-w-0 text-sm text-slate-700">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{language.name}</span>
            <Badge tone={language.status === "live" ? "success" : language.status === "draft" ? "info" : "neutral"}>
              {language.status === "live" ? "Live" : language.status === "draft" ? "Draft" : "Hidden"}
            </Badge>
          </p>
          <p className="mt-0.5 text-xs text-slate-600" aria-live="polite">
            {statusLine}
          </p>
        </div>
        {!isSource && !isHidden && (
          <button
            type="button"
            onClick={() => (written > 0 ? setConfirming("draft") : run("draft", () => draftLanguagePhrases(language.code, expected)))}
            disabled={busy}
            className={buttonClass(written > 0 ? "secondary" : "primary")}
          >
            {busy && running === "draft" ? "Drafting…" : written > 0 ? "Draft again" : "Draft with the voice service"}
          </button>
        )}
        {written > 0 && !isHidden && (
          <>
            <button
              type="button"
              onClick={() => run("check", () => checkLanguagePhrases(language.code, expected))}
              disabled={busy || dirty || written < total || checked === total}
              title={dirty ? "Save your changes first" : written < total ? "Every phrase needs wording first" : undefined}
              className={buttonClass("secondary")}
            >
              {busy && running === "check" ? "Saving…" : checked === total ? "All checked" : "Mark all as checked"}
            </button>
            <button
              type="button"
              onClick={() => run("save", () => saveLanguagePhrases({ code: language.code, expected, texts }))}
              disabled={busy || !dirty}
              className={buttonClass("primary")}
            >
              {busy && running === "save" ? "Saving…" : "Save"}
            </button>
          </>
        )}
        {language.status === "draft" && checked === total && !dirty && (
          <button type="button" onClick={() => setConfirming("live")} disabled={busy} className={buttonClass("primary")}>
            {busy && running === "live" ? "Making live…" : "Make live"}
          </button>
        )}
      </div>

      {isHidden && (
        <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {language.name} is hidden, so its phrases can&apos;t be changed. Show it again from the Languages tab.
        </p>
      )}
      {language.status === "live" && written > 0 && (
        <p className="mt-3 max-w-3xl text-sm text-slate-700">
          {language.name} is live: saved changes are used for audio made from now on. Audio made earlier keeps the wording it was made with; make it
          again from the Pages tab to use the new wording.
        </p>
      )}
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
      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-title" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          <p id="confirm-title" className="font-medium">
            {confirming === "draft" ? `Draft the ${language.name} phrases again?` : `Make ${language.name} live?`}
          </p>
          <p className="mt-0.5">
            {confirming === "draft"
              ? "This replaces every phrase, including any corrections. The new phrases start as drafts."
              : `Candidates will be able to choose ${language.name} on their Account page.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() =>
                confirming === "draft"
                  ? run("draft", () => draftLanguagePhrases(language.code, expected))
                  : run("live", () => publishLanguageNow(language.code))
              }
              className={buttonClass("primary", "sm")}
            >
              {confirming === "draft" ? "Draft again" : "Make live"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={buttonClass("secondary", "sm")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(written > 0 || isSource) && (
        <ol className="mt-4 space-y-3">
          {keys.map((key) => {
            const stored = phrases[key];
            const id = `phrase-${key}`;
            return (
              <li key={key} className={`${cardClass} p-3`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{PHRASE_INFO[key].label}</p>
                  {stored ? (
                    <Badge tone={stored.status === "checked" ? "success" : "warning"}>{stored.status === "checked" ? "Checked" : "Not checked"}</Badge>
                  ) : (
                    <Badge tone="warning">Missing</Badge>
                  )}
                </div>
                <p className="mb-2 text-xs text-slate-600">{PHRASE_INFO[key].use}</p>
                <div className={isSource ? "" : "grid gap-3 md:grid-cols-2"}>
                  {!isSource && (
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-slate-600">English</p>
                      <p lang="en-GB" className="text-sm text-ink">
                        {english[key]}
                      </p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
                      {language.name}
                    </label>
                    <input
                      id={id}
                      lang={language.code}
                      dir={language.rtl ? "rtl" : "auto"}
                      type="text"
                      value={texts[key] ?? ""}
                      maxLength={VOICE_PHRASE_MAX_LENGTH}
                      disabled={isHidden}
                      onChange={(event) => setTexts((all) => ({ ...all, [key]: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {leaveTo && (
        <LeaveDialog
          what="these phrases"
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

"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { TRANSLATED_LANGUAGES } from "@/lib/voice/languages";
import { translationState } from "@/lib/voice/status";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import { translatePageLanguage } from "../translation-actions";
import { TranslationBadge } from "../translation-badge";

// The page editor's Languages strip: each language's translation status, Translate (one or all missing and
// out of date, one at a time), and the way to the Translations page. Always from the saved page.
export function LanguagesStrip({
  pageId,
  pageVersion,
  dirty,
  initial,
}: {
  pageId: string;
  pageVersion: number;
  dirty: boolean;
  initial: TranslationSummary[];
}) {
  const [rows, setRows] = useState<Record<string, TranslationSummary>>(() => Object.fromEntries(initial.map((row) => [row.language, row])));
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string[] | null>(null);

  const stateOf = (code: string) => translationState(pageVersion, rows[code] ?? null);
  const needed = TRANSLATED_LANGUAGES.filter((language) => ["missing", "outdated"].includes(stateOf(language.code))).map((language) => language.code);

  async function translate(codes: string[]) {
    setConfirming(null);
    for (const code of codes) {
      setBusy(code);
      setMessages((current) => ({ ...current, [code]: "" }));
      const result = await reachServer(() => translatePageLanguage(pageId, code));
      if (!result) setMessages((current) => ({ ...current, [code]: NOT_THROUGH_MESSAGE }));
      else if (!result.ok) setMessages((current) => ({ ...current, [code]: result.error }));
      else {
        const saved = result.translation;
        setRows((current) => ({ ...current, [code]: saved }));
      }
    }
    setBusy(null);
  }

  // An out-of-date translation may hold staff edits, so replacing it asks first.
  function start(codes: string[]) {
    const replacing = codes.filter((code) => rows[code]);
    if (replacing.length) setConfirming(codes);
    else translate(codes);
  }

  const disabledReason = dirty ? "Save the page first" : undefined;
  return (
    <section aria-labelledby="languages-title" className={`${cardClass} mb-4 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="languages-title" className="text-sm font-semibold text-ink">
          Languages
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => start(needed)}
            disabled={dirty || busy !== null || needed.length === 0}
            title={disabledReason ?? (needed.length === 0 ? "Every translation is up to date" : undefined)}
            className={buttonClass("secondary", "sm")}
          >
            {busy ? "Translating…" : "Translate all"}
          </button>
          <Link href={`/admin/handbook/pages/${pageId}/translations`} className={buttonClass("secondary", "sm")}>
            Open translations
          </Link>
        </div>
      </div>
      {dirty && <p className="mt-1 text-xs text-slate-600">Translations are made from the saved page. Save your changes first.</p>}
      <ul className="mt-2 divide-y divide-slate-100">
        {TRANSLATED_LANGUAGES.map((language) => {
          const state = stateOf(language.code);
          const message = messages[language.code];
          return (
            <li key={language.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link
                href={`/admin/handbook/pages/${pageId}/translations?lang=${language.code}`}
                className="inline-flex min-h-6 min-w-28 items-center gap-1 text-sm text-primary underline underline-offset-2 hover:text-ink"
              >
                {language.name} <span lang={language.code}>{language.nativeName}</span>
              </Link>
              <TranslationBadge state={state} />
              {(state === "missing" || state === "outdated") && (
                <button
                  type="button"
                  onClick={() => start([language.code])}
                  disabled={dirty || busy !== null}
                  title={disabledReason}
                  className={`${buttonClass("ghost", "sm")} ml-auto`}
                >
                  {busy === language.code ? "Translating…" : state === "outdated" ? "Translate again" : "Translate"}
                  <span className="sr-only"> into {language.name}</span>
                </button>
              )}
              <p aria-live="polite" className="w-full text-xs empty:hidden">
                {busy === language.code ? (
                  <span className="text-slate-600">Translating {language.name}… this can take up to a minute.</span>
                ) : message ? (
                  <span className="text-danger-strong">{message}</span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      {confirming && (
        <div role="alertdialog" aria-labelledby="replace-title" className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          <p id="replace-title" className="font-medium">
            Replace the out-of-date {listNames(confirming.filter((code) => rows[code]))} translation?
          </p>
          <p className="mt-0.5">Any edits made to it will be lost. Its new translation starts as a draft.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => translate(confirming)} className={buttonClass("primary", "sm")}>
              Translate
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={buttonClass("secondary", "sm")}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function listNames(codes: string[]) {
  const names = codes.map((code) => TRANSLATED_LANGUAGES.find((language) => language.code === code)?.name ?? code);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

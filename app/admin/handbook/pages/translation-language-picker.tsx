"use client";

import Link from "next/link";
import { inputClass } from "@/components/admin/styles";
import type { LanguageName } from "@/lib/voice/languages";
import { TRANSLATION_STATE_LABELS, type TranslationState } from "@/lib/voice/status";

// The Translations pages' language choice (page and question): one list with each language's state, however many
// there are, and a link to the next one waiting to be checked. `go` follows the page's unsaved-changes guard.
export function TranslationLanguagePicker({
  languages,
  states,
  current,
  hrefFor,
  go,
}: {
  languages: LanguageName[];
  states: Record<string, TranslationState>;
  current: string;
  hrefFor: (code: string) => string;
  go: (href: string) => void;
}) {
  const at = languages.findIndex((language) => language.code === current);
  const after = [...languages.slice(at + 1), ...languages.slice(0, at)];
  const next = after.find((language) => states[language.code] === "draft") ?? null;
  return (
    <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
      <div>
        <label htmlFor="translation-language" className="mb-1 block text-sm font-medium text-ink">
          Language
        </label>
        <select
          id="translation-language"
          value={current}
          onChange={(event) => go(hrefFor(event.target.value))}
          className={`${inputClass} sm:w-72`}
        >
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {`${language.name} (${language.nativeName}) — ${TRANSLATION_STATE_LABELS[states[language.code] ?? "missing"]}`}
            </option>
          ))}
        </select>
      </div>
      <p className="pb-2 text-sm text-slate-700">
        {next ? (
          <>
            Next to check:{" "}
            <Link href={hrefFor(next.code)} className="text-primary underline underline-offset-2 hover:text-ink">
              {next.name}
            </Link>
          </>
        ) : (
          "No other translation is waiting to be checked."
        )}
      </p>
    </div>
  );
}

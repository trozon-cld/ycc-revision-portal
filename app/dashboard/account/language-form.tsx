"use client";

import { useActionState, useState } from "react";
import { CHOICE_INPUT, CHOICE_ROW, ERROR_BOX, OK_BOX, PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { submitKeepingChoices } from "@/components/candidate/submit-form";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { VOICE_LANGUAGES, voiceLanguage } from "@/lib/voice/languages";
import { saveLanguage, type LanguageFormState } from "./actions";

// The language Listen reads Handbook pages in. The choice stays selected if saving doesn't go through.
export function LanguageForm({ current }: { current: string }) {
  const [chosen, setChosen] = useState(current);
  const [state, action, pending] = useActionState<LanguageFormState, FormData>(
    async (previous, formData) => (await reachServer(() => saveLanguage(previous, formData))) ?? { error: NOT_THROUGH_MESSAGE },
    {}
  );
  const savedName = state.saved ? voiceLanguage(state.saved)?.name : undefined;
  return (
    <form method="post" onSubmit={submitKeepingChoices(action)} className="mt-4">
      <fieldset>
        <legend className="sr-only">Listening language</legend>
        <div className="flex flex-col gap-3">
          {VOICE_LANGUAGES.map((language) => (
            <label key={language.code} className={CHOICE_ROW}>
              <input
                type="radio"
                name="language"
                value={language.code}
                checked={chosen === language.code}
                onChange={() => setChosen(language.code)}
                className={CHOICE_INPUT}
              />
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base font-semibold text-ink">
                {language.code === "en" ? (
                  <span>English</span>
                ) : (
                  <>
                    <span lang={language.code}>{language.nativeName}</span>
                    <span className="font-normal text-muted">{language.name}</span>
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className={`mt-4 ${ERROR_BOX}`}>
            {state.error}
          </p>
        )}
        {savedName && !pending && (
          <p className={`mt-4 ${OK_BOX} p-4 text-base font-semibold`}>Saved. Listen now reads pages in {savedName} when audio is available.</p>
        )}
      </div>
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
        {pending ? "Saving…" : "Save language"}
      </button>
    </form>
  );
}

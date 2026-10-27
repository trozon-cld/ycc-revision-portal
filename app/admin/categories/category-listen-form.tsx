"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import type { ListenMode } from "@/lib/voice/language-store";
import { setCategoryListen } from "./actions";

export type ListenLanguageOption = { code: string; name: string; draft: boolean };

const MODES: { value: ListenMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Candidates don't see Listen or the listening language." },
  { value: "all", label: "All languages", hint: "Every live language, including ones added later." },
  { value: "chosen", label: "Chosen languages", hint: "English and the languages ticked below." },
];

// One category's Listen: off, all languages, or English plus chosen ones. Choices and audio are always kept.
export function CategoryListenForm({
  categoryId,
  categoryName,
  initialMode,
  initialChosen,
  languages,
  onClose,
}: {
  categoryId: string;
  categoryName: string;
  initialMode: ListenMode;
  initialChosen: string[];
  languages: ListenLanguageOption[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ListenMode>(initialMode);
  const choosing = mode === "chosen";
  return (
    <ActionForm
      action={setCategoryListen}
      hidden={{ categoryId }}
      submitLabel="Save"
      successMessage="Listen saved."
      onSuccess={onClose}
      onCancel={onClose}
    >
      <fieldset>
        <legend className="text-sm font-medium text-ink">How Listen works</legend>
        <div className="mt-2 space-y-2">
          {MODES.map((item) => (
            <label key={item.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                value={item.value}
                checked={mode === item.value}
                onChange={() => setMode(item.value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="font-medium text-ink">{item.label}</span>
                <span className="block text-slate-600">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={!choosing} className="disabled:opacity-60">
        <legend className="text-sm font-medium text-ink">Chosen languages</legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked disabled className="size-4 accent-primary" />
            <span>English (always offered)</span>
          </label>
          {languages.map((language) => (
            <label key={language.code} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="languages" value={language.code} defaultChecked={initialChosen.includes(language.code)} className="size-4 accent-primary" />
              <span>
                {language.name}
                {language.draft && <span className="text-slate-600"> (draft: offered once it&apos;s live)</span>}
              </span>
            </label>
          ))}
          {languages.length === 0 && <p className="text-sm text-slate-600">No other languages yet. Add them on the Languages page.</p>}
        </div>
      </fieldset>
      {mode === "off" && (
        <p className="text-sm text-slate-700">
          Candidates working in {categoryName} won&apos;t see Listen in the Handbook or the listening language on their Account page.
          Translations and audio are kept, and their language choice is saved.
        </p>
      )}
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { countOf } from "@/lib/format";
import { LANGUAGES_MANAGE_PATH } from "@/lib/voice/language-tabs";
import { SOURCE_LANGUAGE, type LanguageStatus } from "@/lib/voice/languages";
import { GEMINI_CALLS_MAX } from "@/lib/voice/limits";
import { addLanguageAction, deleteLanguageAction, hideLanguageAction, publishLanguageAction, restoreLanguageAction, setGeminiLimitsAction } from "./actions";

export function AddLanguageButton({ options }: { options: { code: string; label: string }[] }) {
  return (
    <PanelButton label="Add language" title="Add language">
      {(close) =>
        options.length === 0 ? (
          <p className="px-5 py-4 text-sm">Every language in the list has been added.</p>
        ) : (
          <ActionForm
            action={addLanguageAction}
            submitLabel="Add language"
            pendingLabel="Adding…"
            successMessage="Language added. Next, draft its spoken phrases."
            onSuccess={close}
            onCancel={close}
          >
            <Field
              id="add-language"
              label="Language"
              hint="The languages the platform offers. More can be added on request."
            >
              <select id="add-language" name="code" required className={inputClass}>
                {options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-slate-700">It starts as a draft: candidates don&apos;t see it until you make it live.</p>
          </ActionForm>
        )
      }
    </PanelButton>
  );
}

export function LanguageRowActions({
  code,
  name,
  status,
  candidates,
  ready,
  canDelete,
  gemini,
}: {
  code: string;
  name: string;
  status: LanguageStatus;
  candidates: number;
  // All its spoken phrases written and checked.
  ready: boolean;
  // Superadmin: a hidden language can be deleted.
  canDelete: boolean;
  // A language Gemini reads aloud: its call limits (null: no limit).
  gemini: { perDay: number | null; perMinute: number | null } | null;
}) {
  const hidden = { code };
  const actions: RowAction[] = [{ label: "Spoken phrases", href: `${LANGUAGES_MANAGE_PATH}/${code}` }];

  if (gemini && status !== "hidden") {
    actions.push({
      label: "Gemini limits",
      title: `Gemini limits for ${name}`,
      description: "Match these to your Gemini key's tier. Every audio file made counts: in bulk runs and one at a time.",
      render: (close) => (
        <ActionForm
          action={setGeminiLimitsAction}
          hidden={hidden}
          submitLabel="Save limits"
          successMessage="Limits saved."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`gemini-day-${code}`} label="Calls a day" hint="Gemini's day starts at midnight Pacific time (8 or 9 am UK). Empty: no limit.">
            <input
              id={`gemini-day-${code}`}
              name="perDay"
              type="number"
              inputMode="numeric"
              min={1}
              max={GEMINI_CALLS_MAX.perDay}
              step={1}
              defaultValue={gemini.perDay ?? ""}
              className={inputClass}
            />
          </Field>
          <Field id={`gemini-minute-${code}`} label="Calls a minute" hint="Empty: no limit.">
            <input
              id={`gemini-minute-${code}`}
              name="perMinute"
              type="number"
              inputMode="numeric"
              min={1}
              max={GEMINI_CALLS_MAX.perMinute}
              step={1}
              defaultValue={gemini.perMinute ?? ""}
              className={inputClass}
            />
          </Field>
          <p className="text-sm text-slate-700">The free tier allows about 10 a day and 3 a minute. A long page can take more than one call.</p>
        </ActionForm>
      ),
    });
  }

  if (status === "draft" && ready) {
    actions.push({
      label: "Make live",
      title: `Make ${name} live?`,
      variant: "confirm",
      render: (close) => (
        <ActionForm
          action={publishLanguageAction}
          hidden={hidden}
          submitLabel="Make live"
          pendingLabel="Making live…"
          successMessage="Language is live."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            Candidates will be able to choose <strong className="font-medium">{name}</strong> on their Account page. Listen plays only the pages
            whose {name} translation is checked and has audio.
          </p>
        </ActionForm>
      ),
    });
  }

  if (status !== "hidden" && code !== SOURCE_LANGUAGE) {
    actions.push({
      label: "Hide",
      danger: true,
      title: `Hide ${name}?`,
      variant: "confirm",
      render: (close) => (
        <ActionForm
          action={hideLanguageAction}
          hidden={hidden}
          submitLabel="Hide"
          pendingLabel="Hiding…"
          variant="danger"
          successMessage="Language hidden."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            {candidates > 0 ? (
              <>
                <strong className="font-medium">{countOf(candidates, "candidate", "candidates")}</strong> listening in {name} will move to English.{" "}
              </>
            ) : (
              <>No candidates are listening in {name}. </>
            )}
            {name} disappears from every list. Its translations, audio and phrases are kept, and you can show it again later as a draft.
          </p>
        </ActionForm>
      ),
    });
  }

  if (status === "hidden") {
    actions.push({ label: "Show again", run: () => restoreLanguageAction(code), successMessage: "Language is back as a draft." });
  }

  if (status === "hidden" && canDelete) {
    actions.push({
      label: "Delete",
      danger: true,
      title: `Delete ${name}?`,
      variant: "confirm",
      render: (close) => (
        <ActionForm
          action={deleteLanguageAction}
          hidden={hidden}
          submitLabel="Delete for good"
          pendingLabel="Deleting…"
          variant="danger"
          successMessage="Language deleted."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            This removes {name}&apos;s spoken phrases and every {name} translation and audio file, for good. It can&apos;t be undone. You can add{" "}
            {name} again later, but its translations and audio would have to be made again.
          </p>
        </ActionForm>
      ),
    });
  }

  return <RowActions label={`Actions for ${name}`} actions={actions} />;
}

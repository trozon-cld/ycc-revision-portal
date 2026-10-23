"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { countOf } from "@/lib/format";
import { LANGUAGES_MANAGE_PATH } from "@/lib/voice/language-tabs";
import { SOURCE_LANGUAGE, type LanguageStatus } from "@/lib/voice/languages";
import { addLanguageAction, hideLanguageAction, publishLanguageAction, restoreLanguageAction } from "./actions";

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
}: {
  code: string;
  name: string;
  status: LanguageStatus;
  candidates: number;
  // All its spoken phrases written and checked.
  ready: boolean;
}) {
  const hidden = { code };
  const actions: RowAction[] = [{ label: "Spoken phrases", href: `${LANGUAGES_MANAGE_PATH}/${code}` }];

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

  return <RowActions label={`Actions for ${name}`} actions={actions} />;
}

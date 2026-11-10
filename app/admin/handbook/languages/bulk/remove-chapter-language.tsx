"use client";

import { ActionForm } from "@/components/admin/action-form";
import { RowActions } from "@/components/admin/row-actions";
import { countOf, formatBytes } from "@/lib/format";
import { removeChapterLanguageAction } from "./actions";

// A chapter row's "⋯" on Batch Generate: removes the shown language's translations and audio from that chapter only.
export function RemoveChapterLanguage({
  chapterId,
  chapterLabel,
  language,
  languageName,
  translations,
  audio,
  bytes,
}: {
  chapterId: string;
  chapterLabel: string;
  language: string;
  languageName: string;
  translations: number;
  audio: number;
  bytes: number;
}) {
  const what = `${countOf(translations, "translation")} and ${countOf(audio, "audio file")}${audio > 0 ? ` (${formatBytes(bytes)})` : ""}`;
  return (
    <RowActions
      label={`More for ${chapterLabel}`}
      actions={[
        {
          label: `Remove ${languageName}`,
          danger: true,
          title: `Remove ${languageName} from ${chapterLabel}?`,
          variant: "confirm",
          render: (close) => (
            <ActionForm
              action={removeChapterLanguageAction}
              hidden={{ chapterId, language }}
              submitLabel="Remove for good"
              pendingLabel="Removing…"
              variant="danger"
              successMessage={`Removed ${languageName} from ${chapterLabel}.`}
              onSuccess={close}
              onCancel={close}
            >
              <p className="text-sm">
                This removes <strong className="font-medium">{what}</strong> in {languageName} from {chapterLabel}, for good: from the database and
                from storage. English, other languages and other chapters aren&apos;t touched. It can&apos;t be undone; to keep a copy, download the{" "}
                {languageName} audio backup first (Backup &amp; Restore → Backup).
              </p>
            </ActionForm>
          ),
        },
      ]}
    />
  );
}

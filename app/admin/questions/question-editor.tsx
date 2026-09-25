"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import type { PictureAlign, PictureSize } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import type { SectionOptions } from "@/lib/questions/queries";
import { questionTypeLabel } from "@/lib/questions/registry";
import type { QuestionType } from "@/lib/questions/types";
import { parseQuestion, QUESTION_LIMITS } from "@/lib/questions/validate";
import { Badge } from "@/components/admin/badge";
import { Dialog } from "@/components/admin/dialog";
import { BoldTextarea, Segmented } from "@/components/admin/editor-fields";
import { PicturePicker } from "@/components/admin/picture-picker";
import { QuestionPreview } from "@/components/admin/question-preview";
import { buttonClass, cardClass, inputClass, labelClass } from "@/components/admin/styles";
import { useToast } from "@/components/admin/toast";
import { getPreviewMedia, listPickerMedia, type PickerItem } from "@/app/admin/handbook/pages/actions";
import { saveQuestion, setQuestionStatus } from "./actions";
import { TYPE_EDITORS } from "./type-editors";

export type QuestionDraft = {
  chapterId: string;
  stemText: string;
  stemMediaId: string | null;
  // As in the page builder: "full" and "center" are the defaults.
  stemMediaSize: PictureSize;
  stemMediaAlign: PictureAlign;
  content: unknown;
  answer: unknown;
  explanation: string;
  inPractice: boolean;
  inMock: boolean;
};

type SaveProblem = { message: string; conflict?: boolean } | null;

export function QuestionEditor({
  questionId,
  refLabel,
  type,
  initial,
  initialVersion,
  status,
  chapters,
  bookChapter,
  initialMedia,
  storageReady,
  loadProblem,
}: {
  questionId: string | null;
  refLabel: string | null;
  type: QuestionType;
  initial: QuestionDraft;
  initialVersion: number | null;
  status: "draft" | "published" | null;
  chapters: SectionOptions[];
  // Chapter number when the question is placed in the Handbook; it can't change chapter then.
  bookChapter: string | null;
  initialMedia: ResolvedMedia;
  storageReady: boolean;
  loadProblem: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));
  const [problem, setProblem] = useState<SaveProblem>(null);
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [media, setMedia] = useState<ResolvedMedia>(initialMedia);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const editor = TYPE_EDITORS[type];
  const isNew = questionId === null;
  const snapshot = JSON.stringify(draft);
  const dirty = snapshot !== savedSnapshot;
  const update = (patch: Partial<QuestionDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = useCallback(() => {
    if (isSaving || (!dirty && !isNew)) return;
    if (!draft.chapterId) {
      setProblem({ message: "Choose a chapter." });
      return;
    }
    const check = parseQuestion({ type, ...draft });
    if (!check.ok) {
      setProblem({ message: check.error });
      return;
    }
    const sent = JSON.stringify(draft);
    startSaving(async () => {
      const result = await saveQuestion({ questionId, expectedVersion: version, type, ...draft });
      if (!result.ok) {
        setProblem({ message: result.error, conflict: result.conflict });
        return;
      }
      setProblem(null);
      setVersion(result.version);
      setSavedSnapshot(sent);
      toast("Question saved.");
      if (isNew) router.replace(`/admin/questions/${result.id}`);
      else router.refresh();
    });
  }, [dirty, draft, isNew, isSaving, questionId, router, toast, type, version]);

  // Ctrl/Cmd+S saves from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Unsaved changes: warn on closing the tab, and catch in-app links (sidebar included) before they navigate.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(anchor.pathname + anchor.search);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  function pick(item: PickerItem) {
    setPicking(false);
    update({ stemMediaId: item.id });
    if (item.thumbUrl) setThumbs((current) => ({ ...current, [item.id]: item.thumbUrl as string }));
    if (!media[item.id]) getPreviewMedia([item.id]).then((found) => setMedia((current) => ({ ...current, ...found })));
  }

  function publish(next: "draft" | "published") {
    if (!questionId) return;
    startPublishing(async () => {
      const result = await setQuestionStatus(questionId, next);
      toast(result.error ?? (next === "published" ? "Question published." : "Question is a draft again."));
      router.refresh();
    });
  }

  // The preview follows typing without slowing it down.
  const deferred = useDeferredValue(draft);
  const pictureSize = deferred.stemMediaSize === "full" ? null : deferred.stemMediaSize;
  const pictureAlign = deferred.stemMediaAlign === "center" ? null : deferred.stemMediaAlign;
  const preview = useMemo(() => {
    const shown = editor?.previewable(deferred.content, deferred.answer) ?? { content: deferred.content, answer: deferred.answer };
    return {
      id: questionId ?? "new-question",
      type,
      stemText: deferred.stemText.trim() || "Your question text appears here.",
      stemMediaId: deferred.stemMediaId,
      stemMediaSize: pictureSize,
      stemMediaAlign: pictureSize ? pictureAlign : null,
      content: shown.content,
      answer: shown.answer,
      explanation: deferred.explanation.trim() || null,
    };
  }, [deferred, editor, pictureAlign, pictureSize, questionId, type]);

  // Running header of the book preview: the chosen chapter and its section.
  const previewChapter = useMemo(() => {
    for (const section of chapters) {
      const found = section.chapters.find((chapter) => chapter.id === deferred.chapterId);
      if (found) return { id: found.id, sectionLabel: section.label, chapterLabel: found.label };
    }
    return { id: "no-chapter", sectionLabel: "Section", chapterLabel: "Chapter" };
  }, [chapters, deferred.chapterId]);

  const saveState = isSaving ? "Saving…" : isNew ? "Not saved yet" : dirty ? "Unsaved changes" : "All changes saved";
  const pictureThumb = draft.stemMediaId ? (thumbs[draft.stemMediaId] ?? media[draft.stemMediaId]?.src) : undefined;

  if (!editor) {
    return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This question type can&apos;t be edited yet.</p>;
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/questions" className="text-primary underline-offset-2 hover:underline">
          Question bank
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <span className="text-slate-700">{refLabel ?? "New question"}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{refLabel ? `Question ${refLabel}` : "New question"}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{questionTypeLabel(type)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status && <Badge tone={status === "published" ? "success" : "neutral"}>{status === "published" ? "Published" : "Draft"}</Badge>}
          <p aria-live="polite" className={`text-sm ${dirty && !isSaving ? "font-medium text-amber-900" : "text-slate-600"}`}>
            {saveState}
          </p>
          {status && (
            <button
              type="button"
              onClick={() => publish(status === "published" ? "draft" : "published")}
              disabled={dirty || isSaving || isPublishing}
              title={dirty ? "Save your changes first" : undefined}
              className={buttonClass("secondary")}
            >
              {status === "published" ? "Unpublish" : "Publish"}
            </button>
          )}
          <button type="button" onClick={save} disabled={isSaving || (!dirty && !isNew)} className={buttonClass("primary")}>
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {status === "published" && (
        <p className="mb-3 text-sm text-slate-700">This question is published. Saved changes go live straight away.</p>
      )}
      {isNew && (
        <p className="mb-3 text-sm text-slate-700">The question is added to the bank when you first save it. New questions start as drafts.</p>
      )}
      {loadProblem && (
        <p role="alert" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
          This question no longer passes the checks: {loadProblem} Fix it and save.
        </p>
      )}
      {problem && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="min-w-0 flex-1">{problem.message}</p>
          {problem.conflict && (
            <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary", "sm")}>
              Reload page
            </button>
          )}
        </div>
      )}

      <div role="group" aria-label="View" className="mb-3 inline-flex rounded-md border border-slate-300 bg-white p-0.5 lg:hidden">
        {(["edit", "preview"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`h-9 rounded px-4 text-sm font-medium ${tab === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"}`}
          >
            {key === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Question content" className={`min-w-0 space-y-4 ${tab === "preview" ? "hidden lg:block" : ""}`}>
          <div className={`${cardClass} space-y-4 p-4`}>
            <div className="space-y-1">
              <label htmlFor="question-chapter" className={labelClass}>
                Chapter
              </label>
              <select
                id="question-chapter"
                value={draft.chapterId}
                disabled={bookChapter !== null}
                onChange={(event) => update({ chapterId: event.target.value })}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a chapter
                </option>
                {chapters
                  .filter((section) => section.chapters.length > 0)
                  .map((section) => (
                    <optgroup key={section.id} label={section.label}>
                      {section.chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
              {bookChapter && (
                <p className="text-sm text-slate-600">
                  It&apos;s in the Handbook in chapter {bookChapter}, so it stays in this chapter.
                </p>
              )}
            </div>

            <BoldTextarea
              id="question-stem"
              label="Question text"
              value={draft.stemText}
              maxLength={QUESTION_LIMITS.stemLength}
              rows={3}
              onChange={(stemText) => update({ stemText })}
            />

            <div className="space-y-1">
              <p className={labelClass}>
                Question picture <span className="font-normal text-slate-600">(optional)</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {draft.stemMediaId &&
                  (pictureThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
                    <img src={pictureThumb} alt="" className="size-24 shrink-0 rounded-md bg-slate-100 object-contain" />
                  ) : (
                    <span className="grid size-24 shrink-0 place-items-center rounded-md bg-slate-100 text-xs text-slate-600">
                      Picture chosen
                    </span>
                  ))}
                <div className="min-w-0 flex-1 space-y-2">
                  {draft.stemMediaId && media[draft.stemMediaId]?.alt && (
                    <p className="line-clamp-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{media[draft.stemMediaId].alt}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPicking(true)} className={buttonClass("secondary", "sm")}>
                      {draft.stemMediaId ? "Change picture" : "Choose picture"}
                    </button>
                    {draft.stemMediaId && (
                      <button
                        type="button"
                        onClick={() => update({ stemMediaId: null, stemMediaSize: "full", stemMediaAlign: "center" })}
                        className={buttonClass("ghost", "sm")}
                      >
                        Remove picture
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {draft.stemMediaId && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                  <Segmented
                    label="Size"
                    value={draft.stemMediaSize}
                    options={[
                      ["small", "Small"],
                      ["medium", "Medium"],
                      ["large", "Large"],
                      ["full", "Full width"],
                    ]}
                    onChange={(size) => update({ stemMediaSize: size as PictureSize })}
                  />
                  <Segmented
                    label="Position"
                    value={draft.stemMediaAlign}
                    disabled={draft.stemMediaSize === "full"}
                    disabledHint="Full-width pictures fill the page, so position doesn't apply."
                    options={[
                      ["left", "Left"],
                      ["center", "Centre"],
                      ["right", "Right"],
                    ]}
                    onChange={(align) => update({ stemMediaAlign: align as PictureAlign })}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={`${cardClass} p-4`}>
            <editor.Fields
              content={draft.content}
              answer={draft.answer}
              onChange={(content, answer) => update({ content, answer })}
              newId={() => crypto.randomUUID()}
            />
          </div>

          <div className={`${cardClass} p-4`}>
            <BoldTextarea
              id="question-explanation"
              label="Explanation (optional)"
              hint="Shown in the Handbook after the candidate checks or reveals the answer."
              value={draft.explanation}
              maxLength={QUESTION_LIMITS.explanationLength}
              rows={3}
              onChange={(explanation) => update({ explanation })}
            />
          </div>

          <fieldset className={`${cardClass} space-y-2 p-4`}>
            <legend className="sr-only">Where this question is used</legend>
            <p className={labelClass} aria-hidden="true">
              Where this question is used
            </p>
            <Check
              label="Use in Practice"
              checked={draft.inPractice}
              onChange={(inPractice) => update({ inPractice })}
            />
            <Check label="Use in Mock tests" checked={draft.inMock} onChange={(inMock) => update({ inMock })} />
            <p className="text-sm text-slate-600">
              The Handbook shows a question only where you place it in a chapter&apos;s page order.
            </p>
          </fieldset>
        </section>

        <section aria-label="Live preview" className={`min-w-0 ${tab === "edit" ? "hidden lg:block" : ""}`}>
          <div className="lg:sticky lg:top-4">
            <QuestionPreview question={preview} media={media} shuffles={editor.shuffles(deferred.content)} chapter={previewChapter} />
          </div>
        </section>
      </div>

      {picking && <PicturePicker load={listPickerMedia} storageReady={storageReady} onPick={pick} onClose={() => setPicking(false)} />}

      {leaveTo && (
        <Dialog title="Leave without saving?" variant="confirm" onClose={() => setLeaveTo(null)}>
          <p className="px-5 py-4 text-sm">
            {isNew ? "This question hasn't been saved yet." : "Your changes to this question haven't been saved yet."}
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={() => setLeaveTo(null)} className={buttonClass("secondary")}>
              Stay
            </button>
            <button
              type="button"
              onClick={() => {
                const target = leaveTo;
                setSavedSnapshot(snapshot);
                setLeaveTo(null);
                router.push(target);
              }}
              className={buttonClass("danger")}
            >
              Leave without saving
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" />
      {label}
    </label>
  );
}

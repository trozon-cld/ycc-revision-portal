"use client";

import { ListBackLink } from "@/components/admin/list-place";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import type { PictureAlign, PictureSize } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import type { SectionOptions } from "@/lib/questions/queries";
import { questionTypeLabel } from "@/lib/questions/registry";
import type { QuestionType } from "@/lib/questions/types";
import { parseQuestion, QUESTION_LIMITS } from "@/lib/questions/validate";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
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
import { LanguagesStrip } from "@/app/admin/handbook/languages/languages-strip";
import { QUESTION_CURRENT_VERSION, type QuestionVoice } from "@/lib/voice/question-listen";

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
  voice = null,
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
  // Saved questions: translations and audio for Listen in the Handbook.
  voice?: QuestionVoice | null;
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
  // Who gets the picture chosen in the Media picker (the question picture or an answer option).
  const [pickFor, setPickFor] = useState<((mediaId: string) => void) | null>(null);
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
      const result = await reachServer(() => saveQuestion({ questionId, expectedVersion: version, type, ...draft }));
      if (!result) {
        setProblem({ message: NOT_THROUGH_MESSAGE });
        return;
      }
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
    pickFor?.(item.id);
    setPickFor(null);
    if (item.thumbUrl) setThumbs((current) => ({ ...current, [item.id]: item.thumbUrl as string }));
    if (!media[item.id]) {
      reachServer(() => getPreviewMedia([item.id])).then((found) => found && setMedia((current) => ({ ...current, ...found })));
    }
  }

  function publish(next: "draft" | "published") {
    if (!questionId) return;
    startPublishing(async () => {
      const result = (await reachServer(() => setQuestionStatus(questionId, next))) ?? { error: NOT_THROUGH_MESSAGE };
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

  const saveState = isSaving ? "Saving…" : isNew ? "Not saved yet" : dirty ? "Unsaved changes" : "All changes saved";
  const pictureThumb = draft.stemMediaId ? (thumbs[draft.stemMediaId] ?? media[draft.stemMediaId]?.src) : undefined;

  if (!editor) {
    return <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong">This question type can&apos;t be edited yet.</p>;
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <ListBackLink list="questions" href="/admin/questions" className="text-primary underline underline-offset-2 hover:text-ink">
          Question bank
        </ListBackLink>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <span aria-current="page" className="text-slate-700">{refLabel ?? "New question"}</span>
      </nav>

      {/* On tablets and laptops the title, status and Save stay in view while scrolling. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:sticky md:top-14 md:z-10 md:[@media(max-height:500px)]:top-0 md:-mx-6 md:border-b md:border-slate-200 md:bg-slate-50/95 md:px-6 md:py-3 md:backdrop-blur lg:top-0 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{refLabel ? `Question ${refLabel}` : "New question"}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{questionTypeLabel(type)}</p>
        </div>
        <div
          data-editor-bar
          className="flex flex-wrap items-center gap-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:flex-nowrap max-md:gap-2 max-md:border-t max-md:border-slate-200 max-md:bg-white max-md:px-4 max-md:py-2.5 max-md:shadow-[0_-2px_8px_rgb(0_0_0/0.06)]"
        >
          <span className="flex items-center gap-3 max-md:mr-auto max-md:flex-col max-md:items-start max-md:gap-0.5 md:contents">
            {status && <Badge tone={status === "published" ? "success" : "neutral"}>{status === "published" ? "Published" : "Draft"}</Badge>}
            <p aria-live="polite" className={`text-sm max-md:text-xs ${dirty && !isSaving ? "font-medium text-warn-strong" : "text-slate-600"}`}>
              {saveState}
            </p>
          </span>
          {status && (
            <button
              type="button"
              onClick={() => publish(status === "published" ? "draft" : "published")}
              disabled={dirty || isSaving || isPublishing}
              title={dirty ? "Save your changes first" : undefined}
              className={buttonClass("secondary")}
            >
              {status === "published" ? (isPublishing ? "Unpublishing…" : "Unpublish") : isPublishing ? "Publishing…" : "Publish"}
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
      {voice && questionId && (
        <LanguagesStrip
          key={voiceKey(voice)}
          target={{ kind: "question", id: questionId, version: QUESTION_CURRENT_VERSION }}
          dirty={dirty}
          initial={voice.translations}
          initialAudio={voice.audio}
          unavailable={voice.unavailable}
        />
      )}
      {isNew && (
        <p className="mb-3 text-sm text-slate-700">The question is added to the bank when you first save it. New questions start as drafts.</p>
      )}
      {loadProblem && (
        <p role="alert" className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          This question no longer passes the checks: {loadProblem} Fix it and save.
        </p>
      )}
      {problem && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
          <p className="min-w-0 flex-1">{problem.message}</p>
          {problem.conflict && (
            <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary", "sm")}>
              Reload page
            </button>
          )}
        </div>
      )}

      <div role="group" aria-label="View" className="mb-3 inline-flex rounded-md border border-slate-300 bg-white p-0.5 xl:hidden">
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

      <div className="grid gap-6 max-md:pb-20 xl:grid-cols-[3fr_2fr]">
        <section aria-label="Question content" className={`min-w-0 space-y-4 ${tab === "preview" ? "hidden xl:block" : ""}`}>
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

            {!editor.ownsPicture && (
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
                      <button
                        type="button"
                        onClick={() => setPickFor(() => (mediaId: string) => update({ stemMediaId: mediaId }))}
                        className={buttonClass("secondary", "sm")}
                      >
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
            )}
          </div>

          <div className={`${cardClass} p-4`}>
            <editor.Fields
              content={draft.content}
              answer={draft.answer}
              onChange={(content, answer) => update({ content, answer })}
              newId={() => crypto.randomUUID()}
              media={media}
              thumbs={thumbs}
              choosePicture={(onPicked) => setPickFor(() => onPicked)}
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

        <section aria-label="Live preview" className={`min-w-0 ${tab === "edit" ? "hidden xl:block" : ""}`}>
          <div className="xl:sticky xl:top-28">
            <QuestionPreview question={preview} media={media} shuffles={editor.shuffles(deferred.content)} chapters={chapters} chapterId={deferred.chapterId} />
          </div>
        </section>
      </div>

      {pickFor && <PicturePicker load={listPickerMedia} storageReady={storageReady} onPick={pick} onClose={() => setPickFor(null)} />}

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

// The strip starts again from the server's figures whenever they change (e.g. after saving the English).
function voiceKey(voice: QuestionVoice): string {
  const parts = [...voice.translations.map((row) => `${row.language}:${row.revision}:${row.sourceVersion}:${row.status}`)];
  parts.push(...voice.audio.map((row) => `${row.language}:${row.sourceVersion}:${row.createdAt}`), voice.unavailable ?? "");
  return parts.join("|");
}

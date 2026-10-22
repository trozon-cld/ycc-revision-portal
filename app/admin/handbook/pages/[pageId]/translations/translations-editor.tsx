"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import type { Block } from "@/lib/content/blocks";
import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import type { ChapterContext } from "@/lib/content/pages";
import { BookPreview } from "@/components/admin/book-preview";
import { buttonClass, cardClass, inputClass, textareaClass } from "@/components/admin/styles";
import { useToast } from "@/components/admin/toast";
import { LeaveDialog, useLeaveGuard } from "@/components/admin/leave-guard";
import { formatUkDateTime } from "@/lib/candidates/access";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { translatedLanguages, type VoiceLanguage } from "@/lib/voice/languages";
import { translationState } from "@/lib/voice/status";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import { toTranslatable } from "@/lib/voice/translation";
import { checkTranslation, saveTranslation, translatePageLanguage } from "../../translation-actions";
import { TranslationBadge } from "../../translation-badge";

type Texts = Record<string, string[]>;

const KIND: Record<Block["type"], string> = { heading: "Heading", paragraph: "Paragraph", list: "List", picture: "Picture caption", callout: "Box" };

// One language of one page: the English beside its translation, block by block, with save, check,
// translate again and a book preview of the translated page. Remounted (key) after every saved change.
export function TranslationsEditor({
  pageId,
  pageTitle,
  pageVersion,
  chapter,
  english,
  language,
  languages,
  summaries,
  current,
  media,
}: {
  pageId: string;
  pageTitle: string;
  pageVersion: number;
  chapter: ChapterContext;
  english: Block[];
  language: string;
  // English first, then the languages staff work with.
  languages: VoiceLanguage[];
  summaries: TranslationSummary[];
  current: { summary: TranslationSummary; blocks: Block[] } | null;
  media: ResolvedMedia;
}) {
  const router = useRouter();
  const toast = useToast();
  const lang = languages.find((item) => item.code === language)!;
  const initialTexts = useMemo(() => textsOf(current?.blocks ?? []), [current]);
  const [texts, setTexts] = useState<Texts>(initialTexts);
  const [problem, setProblem] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [isSaving, startSaving] = useTransition();
  const [isChecking, startChecking] = useTransition();
  const [isTranslating, startTranslating] = useTransition();

  const summary = current?.summary ?? null;
  const state = translationState(pageVersion, summary);
  const dirty = JSON.stringify(texts) !== JSON.stringify(initialTexts);
  const busy = isSaving || isChecking || isTranslating;
  const translatable = useMemo(() => new Set(toTranslatable(english).map((block) => block.id)), [english]);
  const [leaveTo, setLeaveTo] = useLeaveGuard(dirty);
  const missingBlocks = current ? english.filter((block) => translatable.has(block.id) && !current.blocks.some((b) => b.id === block.id)).length : 0;

  function translate() {
    setConfirmAgain(false);
    setProblem(null);
    startTranslating(async () => {
      const result = await reachServer(() => translatePageLanguage(pageId, language));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error });
      else toast(`${lang.name} translation ready. Read it through, then mark it as checked.`);
    });
  }

  function save() {
    if (!summary || !dirty) return;
    setProblem(null);
    const blocks = buildBlocks(english, texts);
    startSaving(async () => {
      const result = await reachServer(() => saveTranslation({ pageId, language, expectedRevision: summary.revision, blocks }));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error, conflict: result.conflict });
      else toast("Translation saved. It's a draft until it's checked.");
    });
  }

  function check() {
    if (!summary) return;
    setProblem(null);
    startChecking(async () => {
      const result = await reachServer(() => checkTranslation(pageId, language, summary.revision));
      if (!result) setProblem({ message: NOT_THROUGH_MESSAGE });
      else if (!result.ok) setProblem({ message: result.error, conflict: result.conflict });
      else toast("Translation marked as checked.");
    });
  }

  const deferredTexts = useDeferredValue(texts);
  const previewPages = useMemo<BookPageData[]>(
    () => [
      {
        id: pageId,
        chapterId: chapter.id,
        sectionLabel: chapter.sectionLabel,
        chapterLabel: chapter.chapterLabel,
        blocks: buildBlocks(english, deferredTexts).filter(isShowable),
      },
    ],
    [pageId, chapter, english, deferredTexts]
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <Link href={`/admin/handbook/chapters/${chapter.id}`} className="text-primary underline underline-offset-2 hover:text-ink">
          {chapter.chapterLabel}
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <Link href={`/admin/handbook/pages/${pageId}`} className="text-primary underline underline-offset-2 hover:text-ink">
          {pageTitle}
        </Link>
      </nav>
      <h1 className="text-xl font-semibold text-ink">Translations</h1>
      <p className="mt-0.5 text-sm text-slate-600">
        Translations are drafted by the voice service from the saved English page. Read each one through and correct it, then mark it as checked.
      </p>

      <div role="group" aria-label="Language" className="mt-4 flex flex-wrap gap-2">
        {translatedLanguages(languages).map((item) => {
          const isCurrent = item.code === language;
          const itemState = translationState(pageVersion, summaries.find((row) => row.language === item.code) ?? null);
          return (
            <Link
              key={item.code}
              href={`/admin/handbook/pages/${pageId}/translations?lang=${item.code}`}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isCurrent ? "border-primary bg-primary/10 text-ink" : "border-slate-300 bg-white text-ink hover:bg-slate-100"
              }`}
            >
              {item.name}
              <TranslationBadge state={itemState} />
            </Link>
          );
        })}
      </div>

      <div className={`${cardClass} mt-4 flex flex-wrap items-center gap-3 p-3`}>
        <div className="mr-auto min-w-0 text-sm text-slate-700">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">
              {lang.name} <span lang={lang.code}>{lang.nativeName}</span>
            </span>
            <TranslationBadge state={state} />
          </p>
          <p className="mt-0.5 text-xs text-slate-600" aria-live="polite">
            {busy
              ? isTranslating
                ? `Translating into ${lang.name}… this can take up to a minute.`
                : "Saving…"
              : dirty
                ? "Unsaved changes"
                : summary
                  ? stateLine(state, summary)
                  : "No translation yet."}
          </p>
        </div>
        {summary ? (
          <>
            <button type="button" onClick={() => setConfirmAgain(true)} disabled={busy} className={buttonClass("secondary")}>
              {isTranslating ? "Translating…" : "Translate again"}
            </button>
            <button
              type="button"
              onClick={check}
              disabled={busy || dirty || state !== "draft"}
              title={dirty ? "Save your changes first" : state === "outdated" ? "The English page changed: translate again or edit and save first" : undefined}
              className={buttonClass("secondary")}
            >
              {isChecking ? "Saving…" : state === "checked" ? "Checked" : "Mark as checked"}
            </button>
            <button type="button" onClick={save} disabled={busy || !dirty} className={buttonClass("primary")}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" onClick={translate} disabled={busy || english.length === 0} className={buttonClass("primary")}>
            {isTranslating ? "Translating…" : `Translate into ${lang.name}`}
          </button>
        )}
      </div>

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
      {confirmAgain && (
        <div role="alertdialog" aria-labelledby="again-title" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          <p id="again-title" className="font-medium">Translate the page into {lang.name} again?</p>
          <p className="mt-0.5">This replaces the current text, including any corrections. The new translation starts as a draft.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={translate} className={buttonClass("primary", "sm")}>
              Translate again
            </button>
            <button type="button" onClick={() => setConfirmAgain(false)} className={buttonClass("secondary", "sm")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {missingBlocks > 0 && (
        <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          The English page has {missingBlocks} new block{missingBlocks === 1 ? "" : "s"} that {missingBlocks === 1 ? "isn't" : "aren't"} translated yet. Fill {missingBlocks === 1 ? "it" : "them"} in below, or translate the page again.
        </p>
      )}

      {current && (
        <>
          <div role="group" aria-label="View" className="mt-4 inline-flex rounded-md border border-slate-300 bg-white p-0.5 xl:hidden">
            {(["edit", "preview"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`h-9 rounded px-4 text-sm font-medium ${view === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"}`}
              >
                {key === "edit" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-6 xl:grid-cols-[3fr_2fr]">
            <section aria-label={`${lang.name} translation`} className={`min-w-0 space-y-3 ${view === "preview" ? "hidden xl:block" : ""}`}>
              <ol className="space-y-3">
                {english.map((block, index) => (
                  <li key={block.id} className={`${cardClass} p-3`}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">
                      {index + 1}. {block.type === "callout" ? (block.tone === "remember" ? "Remember box" : "Key point box") : KIND[block.type]}
                    </p>
                    <BlockRow block={block} language={lang.code} languageName={lang.name} texts={texts[block.id]} translatable={translatable.has(block.id)} onChange={(next) => setTexts((all) => ({ ...all, [block.id]: next }))} />
                  </li>
                ))}
              </ol>
            </section>
            <section aria-label="Preview" className={`min-w-0 ${view === "edit" ? "hidden xl:block" : ""}`}>
              <div className="xl:sticky xl:top-6">
                <BookPreview pages={previewPages} media={media} label={`${lang.name} page preview`} initialDevice="phone" devices={["phone", "tablet", "desktop"]} />
              </div>
            </section>
          </div>
        </>
      )}

      {leaveTo && (
        <LeaveDialog
          what="this translation"
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

function BlockRow({
  block,
  language,
  languageName,
  texts,
  translatable,
  onChange,
}: {
  block: Block;
  language: string;
  languageName: string;
  texts: string[] | undefined;
  translatable: boolean;
  onChange: (texts: string[]) => void;
}) {
  const englishText =
    block.type === "list" ? block.items.join("\n") : block.type === "picture" ? (block.caption ?? "") : block.text;
  if (!translatable) {
    return <p className="text-sm text-slate-600">Picture without a caption: nothing to translate.</p>;
  }
  const id = `tr-${block.id}`;
  const value = block.type === "list" ? (texts ?? []).join("\n") : (texts?.[0] ?? "");
  const field =
    block.type === "heading" || block.type === "picture" ? (
      <input id={id} lang={language} type="text" value={value} onChange={(event) => onChange([event.target.value])} className={inputClass} />
    ) : (
      <textarea
        id={id}
        lang={language}
        value={value}
        rows={block.type === "list" ? Math.max(3, block.items.length + 1) : 4}
        onChange={(event) => onChange(block.type === "list" ? event.target.value.split("\n") : [event.target.value])}
        className={textareaClass}
      />
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-slate-600">English</p>
        <p lang="en-GB" className="whitespace-pre-wrap text-sm text-ink">{englishText}</p>
      </div>
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
          {languageName}
          {block.type === "list" && ` (${block.items.length} item${block.items.length === 1 ? "" : "s"}, one per line)`}
        </label>
        {field}
        {!texts && <p className="mt-1 text-xs text-warn-strong">Not translated yet.</p>}
      </div>
    </div>
  );
}

function textsOf(blocks: Block[]): Texts {
  return Object.fromEntries(toTranslatable(blocks).map((block) => [block.id, block.texts]));
}

// The English page's blocks with the edited texts in place (blocks not translated yet stay empty).
function buildBlocks(english: Block[], texts: Texts): Block[] {
  return english.map((block): Block => {
    const own = texts[block.id];
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "callout":
        return { ...block, text: own?.[0] ?? "" };
      case "list":
        return { ...block, items: own ?? [] };
      case "picture":
        return block.caption ? { ...block, caption: own?.[0] ?? "" } : block;
    }
  });
}

// The preview leaves out blocks that are still empty, as the page editor's preview does.
function isShowable(block: Block): boolean {
  if (block.type === "list") return block.items.some((item) => item.trim());
  if (block.type === "picture") return true;
  return block.text.trim() !== "";
}

function stateLine(state: ReturnType<typeof translationState>, summary: TranslationSummary): string {
  if (state === "checked") return `Checked ${formatUkDateTime(summary.checkedAt ?? summary.updatedAt)}.`;
  if (state === "outdated") return "The English page has changed since this was translated.";
  return `Draft, last changed ${formatUkDateTime(summary.updatedAt)}. Not checked yet.`;
}

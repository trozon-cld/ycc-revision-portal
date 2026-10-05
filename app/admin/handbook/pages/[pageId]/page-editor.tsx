"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BLOCK_LIMITS, parseBlocks, type Block, type BlockType } from "@/lib/content/blocks";
import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import { BLOCK_LABELS, duplicateBlock, newBlock, previewableBlocks, toSavable } from "@/lib/content/editor";
import type { ChapterContext } from "@/lib/content/pages";
import { Badge } from "@/components/admin/badge";
import { BookPreview, FitReadout } from "@/components/admin/book-preview";
import { Dialog } from "@/components/admin/dialog";
import { buttonClass, inputClass, labelClass } from "@/components/admin/styles";
import { useToast } from "@/components/admin/toast";
import { PicturePicker } from "@/components/admin/picture-picker";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { getPreviewMedia, listPickerMedia, savePageContent, type PickerItem } from "../actions";
import { BlockEditor } from "./block-editor";

const ADD_ORDER: BlockType[] = ["heading", "paragraph", "list", "picture", "callout"];

type SaveProblem = { message: string; conflict?: boolean } | null;

export function PageEditor({
  pageId,
  initialTitle,
  initialBlocks,
  initialVersion,
  status,
  chapter,
  initialMedia,
  storageReady,
  loadProblem,
}: {
  pageId: string;
  initialTitle: string;
  initialBlocks: Block[];
  initialVersion: number;
  status: "draft" | "published";
  chapter: ChapterContext;
  initialMedia: ResolvedMedia;
  storageReady: boolean;
  loadProblem: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [version, setVersion] = useState(initialVersion);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(initialTitle, initialBlocks));
  const [problem, setProblem] = useState<SaveProblem>(null);
  const [isSaving, startSaving] = useTransition();
  const [media, setMedia] = useState<ResolvedMedia>(initialMedia);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const focusRef = useRef<string | null>(null);

  const snapshot = snapshotOf(title, blocks);
  const dirty = snapshot !== savedSnapshot;

  const save = useCallback(() => {
    if (isSaving || !dirty) return;
    const savable = toSavable(blocks);
    const check = parseBlocks(savable);
    if (!check.ok) {
      setProblem({ message: check.error });
      return;
    }
    if (!title.trim()) {
      setProblem({ message: "Page title is required." });
      return;
    }
    const sentSnapshot = snapshotOf(title, blocks);
    startSaving(async () => {
      const result = await savePageContent({ pageId, expectedVersion: version, title, blocks: savable });
      if (result.ok) {
        setVersion(result.version);
        setSavedSnapshot(sentSnapshot);
        setProblem(null);
        toast("Page saved.");
      } else {
        setProblem({ message: result.error, conflict: result.conflict });
      }
    });
  }, [blocks, dirty, isSaving, pageId, title, toast, version]);

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

  // Move focus into a block that was just added.
  useEffect(() => {
    const id = focusRef.current;
    if (!id) return;
    focusRef.current = null;
    document.getElementById(`${id}-text`)?.focus();
  }, [blocks]);

  function update(index: number, next: Block) {
    setBlocks((current) => current.map((block, i) => (i === index ? next : block)));
  }

  function move(index: number, direction: -1 | 1) {
    setBlocks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add(type: BlockType) {
    if (blocks.length >= BLOCK_LIMITS.blocksPerPage) {
      toast(`A page can have up to ${BLOCK_LIMITS.blocksPerPage} blocks.`);
      return;
    }
    const block = newBlock(type);
    focusRef.current = block.id;
    setBlocks((current) => [...current, block]);
    if (type === "picture") setPickingFor(block.id);
  }

  function pick(item: PickerItem) {
    const blockId = pickingFor;
    setPickingFor(null);
    if (!blockId) return;
    setBlocks((current) => current.map((block) => (block.id === blockId && block.type === "picture" ? { ...block, mediaId: item.id } : block)));
    if (item.thumbUrl) setThumbs((current) => ({ ...current, [item.id]: item.thumbUrl as string }));
    if (!media[item.id]) {
      getPreviewMedia([item.id]).then((found) => setMedia((current) => ({ ...current, ...found })));
    }
    requestAnimationFrame(() => document.getElementById(`${blockId}-caption`)?.focus());
  }

  // The preview follows typing without slowing it down.
  const deferredBlocks = useDeferredValue(blocks);
  const previewPages = useMemo<BookPageData[]>(
    () => [
      {
        id: pageId,
        chapterId: chapter.id,
        sectionLabel: chapter.sectionLabel,
        chapterLabel: chapter.chapterLabel,
        blocks: previewableBlocks(deferredBlocks),
      },
    ],
    [chapter, deferredBlocks, pageId]
  );

  const saveState = isSaving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline-offset-2 hover:underline">
          Handbook
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <Link href={`/admin/handbook/chapters/${chapter.id}`} className="text-primary underline-offset-2 hover:underline">
          {chapter.chapterLabel}
        </Link>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full min-w-0 space-y-1 sm:w-auto sm:max-w-md sm:flex-1">
          <label htmlFor="page-title" className={labelClass}>
            Page title <span className="font-normal text-slate-600">(only admins see this)</span>
          </label>
          <input
            id="page-title"
            type="text"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            className={`${inputClass} font-medium`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={status === "published" ? "success" : "neutral"}>{status === "published" ? "Published" : "Draft"}</Badge>
          <p aria-live="polite" className={`text-sm ${dirty && !isSaving ? "font-medium text-amber-900" : "text-slate-600"}`}>
            {saveState}
          </p>
          <button type="button" onClick={save} disabled={isSaving || !dirty} className={buttonClass("primary")}>
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {status === "published" && (
        <p className="mb-3 text-sm text-slate-700">This page is published. Saved changes go live straight away.</p>
      )}
      {loadProblem && (
        <p role="alert" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
          Some saved content no longer passes the checks and was left out: {loadProblem}
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
        <section aria-label="Page content" className={`min-w-0 space-y-3 ${tab === "preview" ? "hidden lg:block" : ""}`}>
          {blocks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
              This page is empty. Add your first block below, e.g. a heading.
            </p>
          ) : (
            <ol className="space-y-3">
              {blocks.map((block, index) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  index={index}
                  total={blocks.length}
                  onChange={(next) => update(index, next)}
                  onMove={(direction) => move(index, direction)}
                  onDuplicate={() => {
                    if (blocks.length >= BLOCK_LIMITS.blocksPerPage) return toast(`A page can have up to ${BLOCK_LIMITS.blocksPerPage} blocks.`);
                    setBlocks((current) => [...current.slice(0, index + 1), duplicateBlock(block), ...current.slice(index + 1)]);
                  }}
                  onRemove={() => {
                    setBlocks((current) => current.filter((_, i) => i !== index));
                    toast("Block removed. Save to keep this change.");
                  }}
                  onChoosePicture={() => setPickingFor(block.id)}
                  picture={
                    block.type === "picture" && block.mediaId
                      ? { thumbUrl: thumbs[block.mediaId] ?? media[block.mediaId]?.src, alt: media[block.mediaId]?.alt }
                      : undefined
                  }
                />
              ))}
            </ol>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-medium text-ink">Add a block</p>
            <div className="flex flex-wrap gap-2">
              {ADD_ORDER.map((type) => (
                <button key={type} type="button" onClick={() => add(type)} className={buttonClass("secondary", "sm")}>
                  <span aria-hidden="true">+</span> {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Live preview" className={`min-w-0 ${tab === "edit" ? "hidden lg:block" : ""}`}>
          <div className="lg:sticky lg:top-4">
            <BookPreview
              pages={previewPages}
              media={media}
              label="Page preview"
              initialDevice="phone"
              devices={["phone", "tablet", "desktop"]}
              readout={(info) => <FitReadout info={info} noun="page" hint="Shorten it or split it into two pages." />}
            />
          </div>
        </section>
      </div>

      {pickingFor && (
        <PicturePicker load={listPickerMedia} storageReady={storageReady} onPick={pick} onClose={() => setPickingFor(null)} />
      )}

      {leaveTo && (
        <Dialog title="Leave without saving?" variant="confirm" onClose={() => setLeaveTo(null)}>
          <p className="px-5 py-4 text-sm">Your changes to this page haven&apos;t been saved yet.</p>
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

function snapshotOf(title: string, blocks: Block[]) {
  return JSON.stringify({ title: title.trim(), blocks: toSavable(blocks) });
}

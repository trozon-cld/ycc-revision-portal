"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/admin/badge";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { useToast } from "@/components/admin/toast";
import { setQuestionStatus } from "@/app/admin/questions/actions";
import { addQuestionsToChapter, moveHandbookItem, removeQuestionForm } from "../../order-actions";
import { PageRowActions } from "./page-row-actions";

type Status = "draft" | "published";
export type OrderItem =
  | { kind: "page"; id: string; position: number; pageId: string; title: string; status: Status; summary: string }
  | { kind: "question"; id: string; position: number; questionId: string; label: string; typeLabel: string; status: Status };
export type AddableQuestion = { id: string; label: string; typeLabel: string; status: Status };

type Drag = { from: number; to: number };

// The chapter's page order: pages and questions in book order. Rows can be dragged by their
// grip (mouse or touch) or moved with the arrow keys on the grip; the ⋯ menu has Move up/down too.
export function ChapterOrder({ items }: { items: OrderItem[] }) {
  const toast = useToast();
  const router = useRouter();
  const [order, setOrder] = useState(items);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, startMove] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  // The server's order wins whenever it arrives.
  useEffect(() => setOrder(items), [items]);

  function commit(from: number, to: number) {
    if (pending || to === from || to < 0 || to >= order.length) return;
    const item = order[from];
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    setAnnouncement(`Moved to position ${to + 1} of ${order.length}.`);
    startMove(async () => {
      const result = await moveHandbookItem(item.id, item.position, to + 1);
      if (result.error) {
        toast(result.error);
        setOrder(items);
        router.refresh();
      }
    });
  }

  function targetAt(clientY: number, from: number) {
    const rows = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>("tr[data-item-id]")) : [];
    let to = 0;
    rows.forEach((row, index) => {
      if (index === from) return;
      const box = row.getBoundingClientRect();
      if (clientY > box.top + box.height / 2) to += 1;
    });
    return to;
  }

  function onGripDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (pending || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, to: index });
  }

  function onGripMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    // Scroll a long list while dragging near the top or bottom of the window.
    if (event.clientY < 60) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    const to = targetAt(event.clientY, drag.from);
    if (to !== drag.to) setDrag({ ...drag, to });
  }

  function onGripUp() {
    if (drag) commit(drag.from, drag.to);
    setDrag(null);
  }

  function onGripKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    commit(index, event.key === "ArrowUp" ? index - 1 : index + 1);
  }

  return (
    <div ref={listRef}>
      <p id={hintId} className="sr-only">
        Drag to move, or use the up and down arrow keys.
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <Table
        columns={["Item", "Type", "Status", ""]}
        isEmpty={order.length === 0}
        emptyMessage="Nothing in this chapter yet. Add a page or a question."
      >
        {order.map((item, index) => {
          const name = item.kind === "page" ? item.title : item.label;
          let marker = "";
          if (drag && index === drag.from) marker = "opacity-50";
          else if (drag && drag.to !== drag.from && index === drag.to) {
            marker =
              drag.to < drag.from
                ? "shadow-[inset_0_3px_0_0_var(--color-primary)] md:shadow-none md:[&>td]:shadow-[inset_0_3px_0_0_var(--color-primary)]"
                : "shadow-[inset_0_-3px_0_0_var(--color-primary)] md:shadow-none md:[&>td]:shadow-[inset_0_-3px_0_0_var(--color-primary)]";
          }
          return (
            <Row key={item.id} extra={{ "data-item-id": item.id, className: marker }}>
              <Cell kind="primary">
                <span className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-label={`Move ${item.kind === "page" ? "page" : "question"} ${name}`}
                    aria-describedby={hintId}
                    title="Drag to move"
                    aria-disabled={pending || undefined}
                    onPointerDown={(event) => onGripDown(event, index)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => onGripKey(event, index)}
                    data-grip
                    className="-my-1 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing aria-disabled:cursor-wait"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="currentColor">
                      {[6, 10, 14].flatMap((y) => [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
                    </svg>
                  </button>
                  <span className="min-w-0">
                    <span className="mr-1 font-mono text-slate-600 tabular-nums">{index + 1}.</span>{" "}
                    {item.kind === "page" ? (
                      <Link href={`/admin/handbook/pages/${item.pageId}`} className="text-ink underline-offset-2 hover:text-primary hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <Link href={`/admin/questions/${item.questionId}`} className="text-ink underline-offset-2 hover:text-primary hover:underline">
                        {item.label}
                      </Link>
                    )}
                  </span>
                </span>
              </Cell>
              <Cell label="Type">{item.kind === "page" ? `Page · ${item.summary}` : `Question · ${item.typeLabel}`}</Cell>
              <Cell label="Status" nowrap>
                <Badge tone={item.status === "published" ? "success" : "neutral"}>{item.status === "published" ? "Published" : "Draft"}</Badge>
              </Cell>
              <Cell kind="actions">
                {item.kind === "page" ? (
                  <PageRowActions
                    id={item.pageId}
                    title={item.title}
                    status={item.status}
                    isFirst={index === 0}
                    isLast={index === order.length - 1}
                  />
                ) : (
                  <QuestionItemActions item={item} isFirst={index === 0} isLast={index === order.length - 1} />
                )}
              </Cell>
            </Row>
          );
        })}
      </Table>
    </div>
  );
}

function QuestionItemActions({
  item,
  isFirst,
  isLast,
}: {
  item: Extract<OrderItem, { kind: "question" }>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const actions: RowAction[] = [
    {
      label: "Edit question",
      run: async () => {
        router.push(`/admin/questions/${item.questionId}`);
        return { success: true };
      },
    },
  ];
  if (!isFirst) actions.push({ label: "Move up", run: () => moveHandbookItem(item.id, item.position, item.position - 1), successMessage: "Question moved up." });
  if (!isLast) actions.push({ label: "Move down", run: () => moveHandbookItem(item.id, item.position, item.position + 1), successMessage: "Question moved down." });
  actions.push(
    item.status === "published"
      ? { label: "Unpublish", run: () => setQuestionStatus(item.questionId, "draft"), successMessage: "Question is a draft again." }
      : { label: "Publish", run: () => setQuestionStatus(item.questionId, "published"), successMessage: "Question published." }
  );
  actions.push({
    label: "Remove from chapter",
    danger: true,
    title: "Remove from chapter?",
    variant: "confirm",
    render: (close) => (
      <ActionForm
        action={removeQuestionForm}
        hidden={{ questionId: item.questionId }}
        submitLabel="Remove"
        pendingLabel="Removing…"
        variant="danger"
        successMessage="Question removed from the chapter."
        onSuccess={close}
        onCancel={close}
      >
        <p className="text-sm [overflow-wrap:anywhere]">
          <strong className="font-medium">{item.label}</strong> will no longer appear in the Handbook. It stays in the Question
          bank, and you can add it again later.
        </p>
      </ActionForm>
    ),
  });
  return <RowActions label={`Actions for question ${item.label}`} actions={actions} />;
}

// "+ Add questions": this chapter's questions that aren't in the book yet. They go to the end.
export function AddQuestionsButton({ chapterId, questions }: { chapterId: string; questions: AddableQuestion[] }) {
  return (
    <PanelButton label="Add questions" title="Add questions to this chapter" variant="secondary">
      {(close) => <AddQuestionsForm chapterId={chapterId} questions={questions} close={close} />}
    </PanelButton>
  );
}

function AddQuestionsForm({ chapterId, questions, close }: { chapterId: string; questions: AddableQuestion[]; close: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startAdding] = useTransition();
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? questions.filter((question) => `${question.label} ${question.typeLabel}`.toLowerCase().includes(term)) : questions;
  }, [questions, search]);

  if (questions.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-3 px-5 py-4 text-sm text-slate-700">
          <p>All of this chapter&apos;s questions are already in the Handbook, or it has none yet.</p>
          <p>
            Questions are written in the{" "}
            <Link href={`/admin/questions?chapter=${chapterId}`} className="text-primary underline underline-offset-2">
              Question bank
            </Link>
            . A question from another chapter can be moved to this one in its editor.
          </p>
        </div>
        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-5 py-3">
          <button type="button" onClick={close} className={buttonClass("secondary")}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allShownChosen = shown.length > 0 && shown.every((question) => chosen.has(question.id));

  function submit() {
    // Added in bank order, whatever order they were ticked in.
    const ids = questions.filter((question) => chosen.has(question.id)).map((question) => question.id);
    if (ids.length === 0) return;
    startAdding(async () => {
      const result = await addQuestionsToChapter(chapterId, ids);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast(ids.length === 1 ? "Question added to the end of the chapter." : `${ids.length} questions added to the end of the chapter.`);
      close();
    });
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex-1 space-y-3 px-5 py-4">
        <p className="text-sm text-slate-700">
          This chapter&apos;s questions that aren&apos;t in the Handbook yet. They&apos;re added to the end of the chapter; move
          them afterwards.
        </p>
        <div className="space-y-1">
          <label htmlFor="add-questions-search" className="text-sm font-medium text-ink">
            Search
          </label>
          <input
            id="add-questions-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Q0012 or words from the question"
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-slate-600">No questions match.</p>
        ) : (
          <fieldset className="space-y-1">
            <legend className="sr-only">Questions to add</legend>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 border-b border-slate-200 pb-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={allShownChosen}
                onChange={(event) => shown.forEach((question) => toggle(question.id, event.target.checked))}
                className="size-4 accent-primary"
              />
              {`Choose all${search.trim() ? " shown" : ""} (${shown.length})`}
            </label>
            {shown.map((question) => (
              <label key={question.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={chosen.has(question.id)}
                  onChange={(event) => toggle(question.id, event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="text-ink">{question.label}</span>
                  <span className="block text-xs text-slate-600">
                    {question.typeLabel}
                    {question.status === "draft" && " · Draft"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
        <button type="button" onClick={close} className={buttonClass("secondary")}>
          Cancel
        </button>
        <button type="submit" disabled={chosen.size === 0 || pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : chosen.size === 1 ? "Add 1 question" : `Add ${chosen.size} questions`}
        </button>
      </div>
    </form>
  );
}

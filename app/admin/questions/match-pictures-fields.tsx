"use client";

import { useRef } from "react";
import { draftPair, MATCH_LIMITS, type MatchDraft } from "@/lib/questions/types/match-pictures";
import { IconButton } from "@/components/admin/editor-fields";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { TypeFieldsProps } from "./type-editors";

type Row = { item: MatchDraft["content"]["items"][number]; target: MatchDraft["content"]["targets"][number] };

// "Match pictures": 3–5 pairs, each a picture and the text of the box it belongs in. The pairs are the
// right answer. Candidates see the boxes in this order and the pictures shuffled.
export function MatchPicturesFields({ content, answer, onChange, newId, media, thumbs, choosePicture }: TypeFieldsProps) {
  const data = content as MatchDraft["content"];
  const solution = answer as MatchDraft["answer"];
  // The picker answers later; read the latest values then.
  const latest = useRef({ data, solution });
  latest.current = { data, solution };

  // Row i: box i, the picture matched to it.
  const rowsOf = (current: MatchDraft["content"], matches: MatchDraft["answer"]["matches"]): Row[] =>
    current.targets.map((target) => {
      const itemId = matches.find((match) => match.targetId === target.id)?.itemId;
      return { target, item: current.items.find((item) => item.id === itemId) ?? { id: newId(), mediaId: "" } };
    });
  const rows = rowsOf(data, solution.matches);
  const setRows = (next: Row[]) =>
    onChange(
      { items: next.map((row) => row.item), targets: next.map((row) => row.target) },
      { matches: next.map((row) => ({ targetId: row.target.id, itemId: row.item.id })) }
    );
  const current = () => rowsOf(latest.current.data, latest.current.solution.matches);
  const updateRow = (targetId: string, patch: { mediaId?: string; label?: string }) =>
    setRows(
      current().map((row) =>
        row.target.id === targetId
          ? {
              item: patch.mediaId !== undefined ? { ...row.item, mediaId: patch.mediaId } : row.item,
              target: patch.label !== undefined ? { ...row.target, label: patch.label } : row.target,
            }
          : row
      )
    );
  const pickFor = (targetId: string) => choosePicture((mediaId) => updateRow(targetId, { mediaId }));

  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function add() {
    if (rows.length >= MATCH_LIMITS.maxPairs) return;
    const pair = draftPair(newId);
    setRows([...rows, { item: pair.item, target: pair.target }]);
    pickFor(pair.target.id);
  }

  const missing = rows.filter((row) => !row.item.mediaId).length;
  const unlabelled = rows.filter((row) => !row.target.label.trim()).length;

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Pairs</legend>
        <p className="text-sm text-slate-600">
          Each pair is a picture and the text of the box it belongs in; the pairs are the right answer. Candidates see the boxes
          in this order and the pictures shuffled. Screen readers use each picture&apos;s description from Media.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {rows.map((row, index) => {
            const number = index + 1;
            const thumb = row.item.mediaId ? (thumbs[row.item.mediaId] ?? media[row.item.mediaId]?.src) : undefined;
            const alt = row.item.mediaId ? media[row.item.mediaId]?.alt : undefined;
            return (
              <li key={row.target.id} aria-label={`Pair ${number}`} className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">Pair {number}</p>
                  <div className="flex shrink-0 items-center">
                    <IconButton label={`Move pair ${number} up`} disabled={index === 0} onClick={() => move(index, -1)} path="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
                    <IconButton
                      label={`Move pair ${number} down`}
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      path="M10 5v10M5.5 10.5 10 15l4.5-4.5"
                    />
                    <IconButton
                      label={`Remove pair ${number}`}
                      disabled={rows.length <= MATCH_LIMITS.minPairs}
                      onClick={() => setRows(current().filter((item) => item.target.id !== row.target.id))}
                      path="M5 6h10M8 6V4.5h4V6M6.5 6l.7 9.5h5.6l.7-9.5"
                      danger
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
                    <img src={thumb} alt="" className="size-20 shrink-0 rounded-md bg-slate-100 object-contain" />
                  ) : (
                    <span className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-xs text-slate-600">
                      {row.item.mediaId ? "Picture chosen" : "No picture yet"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    {alt && <p className="line-clamp-2 text-xs text-slate-700 [overflow-wrap:anywhere]">{alt}</p>}
                    <button type="button" onClick={() => pickFor(row.target.id)} className={buttonClass("secondary", "sm")}>
                      {row.item.mediaId ? "Change picture" : "Choose picture"}
                      <span className="sr-only"> for pair {number}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label htmlFor={`box-${row.target.id}`} className="text-xs font-medium text-slate-700">
                    Text for its box<span className="sr-only">, pair {number}</span>
                  </label>
                  <input
                    id={`box-${row.target.id}`}
                    type="text"
                    value={row.target.label}
                    maxLength={MATCH_LIMITS.labelLength}
                    placeholder="For example: Mandatory"
                    onChange={(event) => updateRow(row.target.id, { label: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={rows.length >= MATCH_LIMITS.maxPairs} className={buttonClass("secondary", "sm")}>
          <span aria-hidden="true">+</span> Add pair
        </button>
        <p className="text-sm text-slate-600">
          {rows.length} of {MATCH_LIMITS.maxPairs} pairs
          {missing > 0 && ` · ${missing} still need${missing === 1 ? "s" : ""} a picture`}
          {unlabelled > 0 && ` · ${unlabelled} still need${unlabelled === 1 ? "s" : ""} box text`}
        </p>
      </div>
    </div>
  );
}

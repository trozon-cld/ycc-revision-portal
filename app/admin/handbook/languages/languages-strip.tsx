"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { formatClock } from "@/lib/format";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { SOURCE_LANGUAGE, translatedLanguages, type LanguageName } from "@/lib/voice/languages";
import { audioSourceVersion, audioState, translationState } from "@/lib/voice/status";
import type { AudioSummary } from "@/lib/voice/audio-files";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import { deleteQuestionAudioFile, generateQuestionAudioFile, questionAudioLink, translateQuestionLanguage } from "@/app/admin/questions/voice-actions";
import { deletePageAudio, generatePageAudio, pageAudioLink } from "../pages/audio-actions";
import { translatePageLanguage } from "../pages/translation-actions";
import { AudioBadge, TranslationBadge } from "../pages/translation-badge";

// `index` of `total`: where a "Translate all" or "Generate all audio" run has got to.
type Job = { kind: "translate" | "audio"; code: string; index: number; total: number };

// From this many languages (English included) the list starts closed, with a summary line; fewer stay open.
const CLOSED_FROM = 5;

// What the strip is for: a Handbook page, or a question (whose version is QUESTION_CURRENT_VERSION).
export type VoiceTarget = { kind: "page" | "question"; id: string; version: number };

const KINDS = {
  page: {
    noun: "page",
    translate: translatePageLanguage,
    makeAudio: generatePageAudio,
    deleteAudio: deletePageAudio,
    link: pageAudioLink,
    translations: (id: string) => `/admin/handbook/pages/${id}/translations`,
    audioWait: "a long page can take a minute or more",
  },
  question: {
    noun: "question",
    translate: translateQuestionLanguage,
    makeAudio: generateQuestionAudioFile,
    deleteAudio: deleteQuestionAudioFile,
    link: questionAudioLink,
    translations: (id: string) => `/admin/questions/${id}/translations`,
    audioWait: "this can take up to a minute",
  },
};

// The Languages strip of the page and question editors: each language's translation and audio, made one at a
// time from the saved English (English audio) or a checked translation, with a player and the way to Translations.
export function LanguagesStrip({
  target,
  dirty,
  initial,
  initialAudio,
  unavailable = null,
  languages,
}: {
  target: VoiceTarget;
  dirty: boolean;
  initial: TranslationSummary[];
  initialAudio: AudioSummary[];
  // Why nothing new can be translated or made (a question type without Listen yet, or not in the Handbook).
  unavailable?: string | null;
  // English first, then the languages staff work with.
  languages: LanguageName[];
}) {
  const kind = KINDS[target.kind];
  const itemId = target.id;
  const version = target.version;
  const [rows, setRows] = useState<Record<string, TranslationSummary>>(() => byLanguage(initial));
  const [audio, setAudio] = useState<Record<string, AudioSummary>>(() => byLanguage(initialAudio));
  // Fresh figures from the server (after a save or an action): taken in place, so a running "all" keeps its progress.
  const [fromServer, setFromServer] = useState({ initial, initialAudio });
  if (fromServer.initial !== initial || fromServer.initialAudio !== initialAudio) {
    setFromServer({ initial, initialAudio });
    setRows(byLanguage(initial));
    setAudio(byLanguage(initialAudio));
  }
  const [busy, setBusy] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [open, setOpen] = useState(languages.length < CLOSED_FROM);

  const isSource = (code: string) => code === SOURCE_LANGUAGE;
  const stateOf = (code: string) => translationState(version, rows[code] ?? null);
  const audioOf = (code: string) => audioState(isSource(code), version, rows[code] ?? null, audio[code] ?? null);
  const canMakeAudio = (code: string) => audioSourceVersion(isSource(code), version, rows[code] ?? null) !== null;
  const needed = translatedLanguages(languages).filter((language) => ["missing", "outdated"].includes(stateOf(language.code))).map((language) => language.code);
  const audioNeeded = languages.filter(
    (language) => ["missing", "outdated"].includes(audioOf(language.code)) && canMakeAudio(language.code)
  ).map((language) => language.code);

  // A message opens the list, so it's never hidden.
  const say = (code: string, text: string) => {
    setMessages((current) => ({ ...current, [code]: text }));
    if (text) setOpen(true);
  };
  const closePlayer = (code: string) =>
    setPlayers((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });

  async function translate(codes: string[]) {
    setConfirming(null);
    for (const [index, code] of codes.entries()) {
      setBusy({ kind: "translate", code, index: index + 1, total: codes.length });
      say(code, "");
      const result = await reachServer(() => kind.translate(itemId, code));
      if (!result) say(code, NOT_THROUGH_MESSAGE);
      else if (!result.ok) say(code, result.error);
      else {
        const saved = result.translation;
        setRows((current) => ({ ...current, [code]: saved }));
      }
    }
    setBusy(null);
  }

  // An out-of-date translation may hold staff edits, so replacing it asks first.
  function start(codes: string[]) {
    const replacing = codes.filter((code) => rows[code]);
    if (replacing.length) setConfirming(codes);
    else translate(codes);
  }

  async function makeAudio(codes: string[]) {
    for (const [index, code] of codes.entries()) {
      setBusy({ kind: "audio", code, index: index + 1, total: codes.length });
      say(code, "");
      const result = await reachServer(() => kind.makeAudio(itemId, code));
      if (!result) say(code, NOT_THROUGH_MESSAGE);
      else if (!result.ok) say(code, result.error);
      else {
        const saved = result.audio;
        setAudio((current) => ({ ...current, [code]: saved }));
        closePlayer(code);
      }
    }
    setBusy(null);
  }

  async function removeAudio(code: string) {
    setDeleting(null);
    setBusy({ kind: "audio", code, index: 1, total: 1 });
    say(code, "");
    const result = await reachServer(() => kind.deleteAudio(itemId, code));
    if (!result) say(code, NOT_THROUGH_MESSAGE);
    else if (!result.ok) say(code, result.error);
    if (result) {
      setAudio((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
      closePlayer(code);
    }
    setBusy(null);
  }

  async function play(code: string) {
    if (players[code]) return closePlayer(code);
    setOpening(code);
    say(code, "");
    const result = await reachServer(() => kind.link(itemId, code));
    if (!result) say(code, NOT_THROUGH_MESSAGE);
    else if (!result.ok) say(code, result.error);
    else {
      const url = result.url;
      setPlayers((current) => ({ ...current, [code]: url }));
    }
    setOpening(null);
  }

  const working = busy !== null;
  const locked = dirty || unavailable !== null;
  const disabledReason = unavailable ?? (dirty ? `Save the ${kind.noun} first` : undefined);
  const translationsHref = kind.translations(itemId);
  const translated = translatedLanguages(languages);
  const checkedCount = translated.filter((language) => stateOf(language.code) === "checked").length;
  const readyCount = languages.filter((language) => audioOf(language.code) === "ready").length;
  const run = busy && busy.total > 1 ? busy : null;
  const runName = run ? (languages.find((language) => language.code === run.code)?.name ?? run.code) : "";

  if (unavailable && initial.length === 0 && initialAudio.length === 0) {
    return (
      <section aria-labelledby="languages-title" className={`${cardClass} mb-4 p-3`}>
        <h2 id="languages-title" className="text-sm font-semibold text-ink">
          Languages
        </h2>
        <p className="mt-1 text-xs text-slate-600">{unavailable}</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="languages-title" className={`${cardClass} mb-4 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="languages-title" className="text-sm font-semibold text-ink">
            Languages
          </h2>
          <p className="text-sm text-slate-700">
            {translated.length > 0 && `Text: ${checkedCount} of ${translated.length} checked · `}Audio: {readyCount} of {languages.length} ready
          </p>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={`languages-list-${itemId}`}
            className={buttonClass("ghost", "sm")}
          >
            {open ? "Hide languages" : `Show all ${languages.length} languages`}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => start(needed)}
            disabled={locked || working || needed.length === 0}
            title={disabledReason ?? (needed.length === 0 ? "Every translation is up to date" : undefined)}
            className={buttonClass("secondary", "sm")}
          >
            {busy?.kind === "translate" ? (run ? `Translating ${run.index} of ${run.total}…` : "Translating…") : "Translate all"}
          </button>
          <button
            type="button"
            onClick={() => makeAudio(audioNeeded)}
            disabled={locked || working || audioNeeded.length === 0}
            title={disabledReason ?? (audioNeeded.length === 0 ? "No audio can be made or updated right now" : undefined)}
            className={buttonClass("secondary", "sm")}
          >
            {busy?.kind === "audio" ? (run ? `Generating ${run.index} of ${run.total}…` : "Generating…") : "Generate all audio"}
          </button>
          <Link href={translationsHref} className={buttonClass("secondary", "sm")}>
            Open translations
          </Link>
        </div>
      </div>
      <p aria-live="polite" className="text-xs text-slate-600 empty:hidden">
        {run &&
          (run.kind === "translate"
            ? `Translating ${runName} (${run.index} of ${run.total})… each can take up to a minute.`
            : `Working on the ${runName} audio (${run.index} of ${run.total})… ${kind.audioWait}.`)}
      </p>
      {unavailable ? (
        <p className="mt-1 text-xs text-slate-600">{unavailable}</p>
      ) : (
        dirty && <p className="mt-1 text-xs text-slate-600">Translations and audio are made from the saved {kind.noun}. Save your changes first.</p>
      )}
      <ul id={`languages-list-${itemId}`} hidden={!open} className="mt-2 divide-y divide-slate-100">
        {languages.map((language) => {
          const code = language.code;
          const source = isSource(code);
          const state = stateOf(code);
          const sound = audioOf(code);
          const saved = audio[code];
          const message = messages[code];
          const isBusy = busy?.code === code;
          return (
            <li key={code} className="grid gap-x-4 gap-y-1 py-2 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
              {source ? (
                <span className="inline-flex min-h-6 items-center text-sm font-medium text-ink">{language.name}</span>
              ) : (
                <Link
                  href={`${translationsHref}?lang=${code}`}
                  className="inline-flex min-h-6 items-center gap-1 text-sm text-primary underline underline-offset-2 hover:text-ink"
                >
                  {language.name} <span lang={code}>{language.nativeName}</span>
                </Link>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="w-12 text-xs text-slate-600">Text</span>
                {source ? (
                  <span className="text-xs text-slate-600">The {kind.noun} itself</span>
                ) : (
                  <>
                    <TranslationBadge state={state} />
                    {(state === "missing" || state === "outdated") && (
                      <button
                        type="button"
                        onClick={() => start([code])}
                        disabled={locked || working}
                        title={disabledReason}
                        className={buttonClass("ghost", "sm")}
                      >
                        {isBusy && busy?.kind === "translate" ? "Translating…" : state === "outdated" ? "Translate again" : "Translate"}
                        <span className="sr-only"> into {language.name}</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="w-12 text-xs text-slate-600">Audio</span>
                <AudioBadge state={sound} />
                {saved && <span className="text-xs tabular-nums text-slate-600">{formatClock(saved.durationMs)}</span>}
                {(sound === "missing" || sound === "outdated") && canMakeAudio(code) && (
                  <button
                    type="button"
                    onClick={() => makeAudio([code])}
                    disabled={locked || working}
                    title={disabledReason}
                    className={buttonClass("ghost", "sm")}
                  >
                    {isBusy && busy?.kind === "audio" ? "Generating…" : sound === "outdated" ? "Generate again" : "Generate audio"}
                    <span className="sr-only"> for {language.name}</span>
                  </button>
                )}
                {saved && (
                  <>
                    <button
                      type="button"
                      onClick={() => play(code)}
                      disabled={opening !== null || (isBusy && working)}
                      aria-expanded={Boolean(players[code])}
                      className={buttonClass("ghost", "sm")}
                    >
                      {opening === code ? "Opening…" : players[code] ? "Close player" : "Play"}
                      <span className="sr-only"> {language.name} audio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(code)}
                      disabled={working}
                      className={buttonClass("ghost", "sm")}
                    >
                      Delete<span className="sr-only"> {language.name} audio</span>
                    </button>
                  </>
                )}
              </div>

              {sound === "waiting" && !message && !isBusy && (
                <p className="text-xs text-slate-600 md:col-start-3">Mark the {language.name} translation as checked to make its audio.</p>
              )}
              {sound === "outdated" && !canMakeAudio(code) && !message && !isBusy && (
                <p className="text-xs text-slate-600 md:col-start-3">
                  The translation changed. Check it again to make new audio.
                </p>
              )}
              {players[code] && (
                <audio controls autoPlay src={players[code]} aria-label={`${language.name} audio`} className="w-full max-w-md md:col-start-3">
                  Your browser can&apos;t play this audio.
                </audio>
              )}
              {deleting === code && (
                <div
                  role="alertdialog"
                  aria-labelledby={`delete-audio-${code}`}
                  className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25 md:col-span-3"
                >
                  <p id={`delete-audio-${code}`} className="font-medium">
                    Delete the {language.name} audio?
                  </p>
                  <p className="mt-0.5">You can generate it again later; that uses the voice service again.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => removeAudio(code)} className={buttonClass("danger", "sm")}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setDeleting(null)} className={buttonClass("secondary", "sm")}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <p aria-live="polite" className="text-xs empty:hidden md:col-span-3">
                {isBusy && !run ? (
                  <span className="text-slate-600">
                    {busy?.kind === "translate"
                      ? `Translating ${language.name}… this can take up to a minute.`
                      : `Working on the ${language.name} audio… ${kind.audioWait}.`}
                  </span>
                ) : message ? (
                  <span className="text-danger-strong">{message}</span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      {confirming && (
        <div role="alertdialog" aria-labelledby="replace-title" className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          <p id="replace-title" className="font-medium">
            Replace the out-of-date {listNames(languages, confirming.filter((code) => rows[code]))} translation?
          </p>
          <p className="mt-0.5">Any edits made to it will be lost. Its new translation starts as a draft.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => translate(confirming)} className={buttonClass("primary", "sm")}>
              Translate
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={buttonClass("secondary", "sm")}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function listNames(languages: LanguageName[], codes: string[]) {
  const names = codes.map((code) => languages.find((language) => language.code === code)?.name ?? code);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

function byLanguage<T extends { language: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((row) => [row.language, row]));
}

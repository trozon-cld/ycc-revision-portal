"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { formatClock } from "@/lib/format";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { SOURCE_LANGUAGE, TRANSLATED_LANGUAGES, VOICE_LANGUAGES } from "@/lib/voice/languages";
import { audioSourceVersion, audioState, translationState } from "@/lib/voice/status";
import type { AudioSummary } from "@/lib/voice/page-audio";
import type { TranslationSummary } from "@/lib/voice/page-translations";
import { deletePageAudio, generatePageAudio, pageAudioLink } from "../audio-actions";
import { translatePageLanguage } from "../translation-actions";
import { AudioBadge, TranslationBadge } from "../translation-badge";

type Job = { kind: "translate" | "audio"; code: string };

// The page editor's Languages strip: each language's translation and audio, made one at a time from the
// saved page (English audio) or a checked translation, with a player to listen and the way to Translations.
export function LanguagesStrip({
  pageId,
  pageVersion,
  dirty,
  initial,
  initialAudio,
}: {
  pageId: string;
  pageVersion: number;
  dirty: boolean;
  initial: TranslationSummary[];
  initialAudio: AudioSummary[];
}) {
  const [rows, setRows] = useState<Record<string, TranslationSummary>>(() => Object.fromEntries(initial.map((row) => [row.language, row])));
  const [audio, setAudio] = useState<Record<string, AudioSummary>>(() => Object.fromEntries(initialAudio.map((row) => [row.language, row])));
  const [busy, setBusy] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);

  const isSource = (code: string) => code === SOURCE_LANGUAGE;
  const stateOf = (code: string) => translationState(pageVersion, rows[code] ?? null);
  const audioOf = (code: string) => audioState(isSource(code), pageVersion, rows[code] ?? null, audio[code] ?? null);
  const canMakeAudio = (code: string) => audioSourceVersion(isSource(code), pageVersion, rows[code] ?? null) !== null;
  const needed = TRANSLATED_LANGUAGES.filter((language) => ["missing", "outdated"].includes(stateOf(language.code))).map((language) => language.code);
  const audioNeeded = VOICE_LANGUAGES.filter(
    (language) => ["missing", "outdated"].includes(audioOf(language.code)) && canMakeAudio(language.code)
  ).map((language) => language.code);

  const say = (code: string, text: string) => setMessages((current) => ({ ...current, [code]: text }));
  const closePlayer = (code: string) =>
    setPlayers((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });

  async function translate(codes: string[]) {
    setConfirming(null);
    for (const code of codes) {
      setBusy({ kind: "translate", code });
      say(code, "");
      const result = await reachServer(() => translatePageLanguage(pageId, code));
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
    for (const code of codes) {
      setBusy({ kind: "audio", code });
      say(code, "");
      const result = await reachServer(() => generatePageAudio(pageId, code));
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
    setBusy({ kind: "audio", code });
    say(code, "");
    const result = await reachServer(() => deletePageAudio(pageId, code));
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
    const result = await reachServer(() => pageAudioLink(pageId, code));
    if (!result) say(code, NOT_THROUGH_MESSAGE);
    else if (!result.ok) say(code, result.error);
    else {
      const url = result.url;
      setPlayers((current) => ({ ...current, [code]: url }));
    }
    setOpening(null);
  }

  const working = busy !== null;
  const disabledReason = dirty ? "Save the page first" : undefined;
  return (
    <section aria-labelledby="languages-title" className={`${cardClass} mb-4 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="languages-title" className="text-sm font-semibold text-ink">
          Languages
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => start(needed)}
            disabled={dirty || working || needed.length === 0}
            title={disabledReason ?? (needed.length === 0 ? "Every translation is up to date" : undefined)}
            className={buttonClass("secondary", "sm")}
          >
            {busy?.kind === "translate" ? "Translating…" : "Translate all"}
          </button>
          <button
            type="button"
            onClick={() => makeAudio(audioNeeded)}
            disabled={dirty || working || audioNeeded.length === 0}
            title={disabledReason ?? (audioNeeded.length === 0 ? "No audio can be made or updated right now" : undefined)}
            className={buttonClass("secondary", "sm")}
          >
            {busy?.kind === "audio" ? "Generating…" : "Generate all audio"}
          </button>
          <Link href={`/admin/handbook/pages/${pageId}/translations`} className={buttonClass("secondary", "sm")}>
            Open translations
          </Link>
        </div>
      </div>
      {dirty && <p className="mt-1 text-xs text-slate-600">Translations and audio are made from the saved page. Save your changes first.</p>}
      <ul className="mt-2 divide-y divide-slate-100">
        {VOICE_LANGUAGES.map((language) => {
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
                  href={`/admin/handbook/pages/${pageId}/translations?lang=${code}`}
                  className="inline-flex min-h-6 items-center gap-1 text-sm text-primary underline underline-offset-2 hover:text-ink"
                >
                  {language.name} <span lang={code}>{language.nativeName}</span>
                </Link>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="w-12 text-xs text-slate-600">Text</span>
                {source ? (
                  <span className="text-xs text-slate-600">The page itself</span>
                ) : (
                  <>
                    <TranslationBadge state={state} />
                    {(state === "missing" || state === "outdated") && (
                      <button
                        type="button"
                        onClick={() => start([code])}
                        disabled={dirty || working}
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
                    disabled={dirty || working}
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
                {isBusy ? (
                  <span className="text-slate-600">
                    {busy?.kind === "translate"
                      ? `Translating ${language.name}… this can take up to a minute.`
                      : `Working on the ${language.name} audio… a long page can take a minute or more.`}
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
            Replace the out-of-date {listNames(confirming.filter((code) => rows[code]))} translation?
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

function listNames(codes: string[]) {
  const names = codes.map((code) => TRANSLATED_LANGUAGES.find((language) => language.code === code)?.name ?? code);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

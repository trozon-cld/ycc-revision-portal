"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useDeviceChoice } from "@/components/use-browser-value";
import { Icon } from "@/components/icons";
import { formatClock, formatDuration } from "@/lib/format";

// Listen (V5): the Handbook reads the page on screen aloud in the candidate's language. The Listen button is the
// player (Listen → Pause → Resume); a thin line under the reader bar shows progress. One page at a time:
// it stops at the end of the page, when the page changes, and when the screen locks or the tab is hidden.

export type ListenSetup = {
  languageName: string;
  // Pages with up-to-date audio in that language: item id → length in ms.
  durations: Record<string, number>;
  src: (pageId: string) => string;
  accountHref: string;
};

// What's on screen: a text page, a question page (V6) or no page (a cover).
export type ListenTarget = { kind: "page"; id: string } | { kind: "question" } | { kind: "none" };

export const READING_SPEEDS = ["slower", "normal", "faster"] as const;
export type ReadingSpeed = (typeof READING_SPEEDS)[number];
export const READING_SPEED_LABELS: Record<ReadingSpeed, string> = { slower: "Slower", normal: "Normal", faster: "Faster" };
const RATES: Record<ReadingSpeed, number> = { slower: 0.85, normal: 1, faster: 1.2 };
const SPEED_KEY = "ycc-listen-speed";
const NOTICE_MS = 8000;
const BACK_SECONDS = 10;

export function useReadingSpeed(): [ReadingSpeed, (speed: ReadingSpeed) => void] {
  return useDeviceChoice(SPEED_KEY, READING_SPEEDS, "normal");
}

type Status = "idle" | "loading" | "playing" | "paused";
type Notice = { text: string; account: boolean };

// What the reader bar shows for Listen.
export type ListenBar = {
  label: string;
  icon: "listen" | "pause";
  busy: boolean;
  onToggle: () => void;
  // Laptops and desktops while audio is on: the time and Back 10 seconds, in place of the page status.
  extras: ReactNode;
  // The progress line and short messages, drawn along the bottom of the bar.
  below: ReactNode;
};

function keyOf(target: ListenTarget) {
  return target.kind === "page" ? target.id : target.kind;
}

export function useListen(
  setup: ListenSetup | undefined,
  target: ListenTarget,
  speed: ReadingSpeed,
  withExtras: boolean,
  showLabels: boolean,
  extraButtonClass: string
): { bar: ListenBar; audio: ReactNode } | null {
  const audioRef = useRef<HTMLAudioElement>(null);
  const key = keyOf(target);
  const [state, setState] = useState<{ key: string; status: Status }>({ key, status: "idle" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  // A new page: back to Listen, nothing playing (the audio element is emptied below).
  if (state.key !== key) {
    setState({ key, status: "idle" });
    setNotice(null);
  }
  const rate = RATES[speed];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, [key]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && audioRef.current?.pause();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  if (!setup) return null;

  const show = (text: string, account = false) => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ text, account });
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (target.kind === "question") return show("Listen isn't available for question pages yet.");
    if (target.kind === "none") return show("Open a page to listen.");
    if (state.status === "playing" || state.status === "loading") return audio.pause();
    if (!(target.id in setup.durations)) return show(`${setup.languageName} audio isn't ready for this page yet.`, true);
    setNotice(null);
    if (state.status === "idle") {
      const src = setup.src(target.id);
      if (audio.getAttribute("src") !== src) audio.setAttribute("src", src);
      else audio.currentTime = 0;
      setState((current) => ({ ...current, status: "loading" }));
    }
    audio.playbackRate = rate;
    audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show("The audio couldn't be played. Please try again.");
      setState((current) => ({ ...current, status: "idle" }));
    });
  };

  const expected = target.kind === "page" ? (setup.durations[target.id] ?? 0) / 1000 : 0;
  const on = state.status !== "idle";
  // While loading the button keeps its word (phones' bar must not grow); screen readers hear it's busy.
  const label = state.status === "playing" ? "Pause" : state.status === "paused" ? "Resume" : "Listen";

  const audio = (
    <audio
      ref={audioRef}
      preload="none"
      onPlaying={() => setState((current) => ({ ...current, status: "playing" }))}
      onPause={(event) => {
        if (!event.currentTarget.ended && event.currentTarget.getAttribute("src")) setState((current) => ({ ...current, status: "paused" }));
      }}
      onEnded={() => setState((current) => ({ ...current, status: "idle" }))}
      onError={(event) => {
        if (!event.currentTarget.getAttribute("src")) return;
        event.currentTarget.removeAttribute("src");
        show("The audio couldn't be loaded. Please try again.");
        setState((current) => ({ ...current, status: "idle" }));
      }}
    />
  );

  const below = (
    <>
      {on && <ListenProgress audioRef={audioRef} expected={expected} />}
      <div role="status" className="pointer-events-none absolute inset-x-0 top-full z-30 flex justify-center px-4 pt-2">
        {notice && (
          <p className="pointer-events-auto max-w-xl rounded-xl border-2 border-primary bg-card px-4 py-3 text-base text-ink shadow-lg">
            {notice.text}
            {notice.account && (
              <>
                {" "}
                You can change your listening language in{" "}
                <Link href={setup.accountHref} className="font-semibold text-primary underline underline-offset-2">
                  Account
                </Link>
                .
              </>
            )}
          </p>
        )}
      </div>
    </>
  );

  const extras =
    withExtras && on ? (
      <>
        <ListenClock audioRef={audioRef} expected={expected} />
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (audio) audio.currentTime = Math.max(0, audio.currentTime - BACK_SECONDS);
          }}
          className={extraButtonClass}
        >
          <Icon name="listen-back" />
          <span className={showLabels ? undefined : "sr-only"}>Back</span>
          <span className="sr-only"> {BACK_SECONDS} seconds</span>
        </button>
      </>
    ) : null;

  return {
    bar: { label, icon: state.status === "playing" ? "pause" : "listen", busy: state.status === "loading", onToggle: toggle, extras, below },
    audio,
  };
}

// The audio's place and length, followed from its own events so only these small parts redraw while it plays.
function useAudioClock(audioRef: RefObject<HTMLAudioElement | null>, expected: number) {
  const [clock, setClock] = useState({ time: 0, duration: 0 });
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setClock({ time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("seeked", update);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", update);
      audio.removeEventListener("seeked", update);
    };
  }, [audioRef]);
  const duration = clock.duration || expected;
  return { time: Math.min(clock.time, duration || clock.time), duration };
}

function ListenProgress({ audioRef, expected }: { audioRef: RefObject<HTMLAudioElement | null>; expected: number }) {
  const { time, duration } = useAudioClock(audioRef, expected);
  const whole = Math.round(duration);
  if (whole <= 0) return null;
  const done = Math.min(Math.round(time), whole);
  return (
    <div
      role="progressbar"
      aria-label="Listening"
      aria-valuemin={0}
      aria-valuemax={whole}
      aria-valuenow={done}
      aria-valuetext={`${formatDuration(done)} of ${formatDuration(whole)}`}
      className="absolute inset-x-0 bottom-0 h-1.5 bg-line-soft"
    >
      <div className="hc-fill h-full bg-primary" style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
    </div>
  );
}

function ListenClock({ audioRef, expected }: { audioRef: RefObject<HTMLAudioElement | null>; expected: number }) {
  const { time, duration } = useAudioClock(audioRef, expected);
  return (
    <span className="whitespace-nowrap text-base font-semibold tabular-nums text-ink" aria-hidden="true">
      {formatClock(time * 1000)} / {formatClock(duration * 1000)}
    </span>
  );
}

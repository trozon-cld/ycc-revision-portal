"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useDeviceChoice } from "@/components/use-browser-value";
import { Icon } from "@/components/icons";
import { SOFT_SHADOW } from "@/components/candidate/buttons";
import { formatClock, formatDuration } from "@/lib/format";

// Listen (V5, question pages V6b): the Handbook reads pages aloud in the candidate's language. The bar's Listen reads
// every page in view that has audio (left, then right) and stops; on spreads each page also has its own Listen in its footer. Only the
// button that started the audio works while it plays (Pause); when paused or finished every button works again.
// Audio stops when the view changes, and pauses when the screen locks or the tab is hidden.

export type ListenSetup = {
  languageName: string;
  // Pages with up-to-date audio in that language: item id → length in ms.
  durations: Record<string, number>;
  src: (pageId: string) => string;
  accountHref: string;
};

// The pages in view, in reading order (a page split over two sheets is listed once, with its first number in view).
// `supported`: false for a question type that doesn't have Listen yet; `answered`: a question page checked or revealed.
export type ListenItem = { id: string; question: boolean; supported: boolean; answered: boolean; number: number };

export const READING_SPEEDS = ["slower", "normal", "faster"] as const;
export type ReadingSpeed = (typeof READING_SPEEDS)[number];
export const READING_SPEED_LABELS: Record<ReadingSpeed, string> = { slower: "Slower", normal: "Normal", faster: "Faster" };
const RATES: Record<ReadingSpeed, number> = { slower: 0.85, normal: 1, faster: 1.2 };
const SPEED_KEY = "ycc-listen-speed";
const NOTICE_MS = 8000;
const BACK_SECONDS = 10;
const BAR = "bar";

export function useReadingSpeed(): [ReadingSpeed, (speed: ReadingSpeed) => void] {
  return useDeviceChoice(SPEED_KEY, READING_SPEEDS, "normal");
}

type Status = "idle" | "loading" | "playing" | "paused";
type Notice = { text: string; account: boolean };
// `source`: what started it (the bar, or one page's footer button); `queue`: the pages it reads, in order;
// `answered`: question pages already checked when it started (Listen can read them again on purpose).
type Session = { key: string; status: Status; source: string | null; queue: string[]; index: number; answered: string[] };

// One Listen button's look and action (the bar's, or a page's footer button).
export type ListenControl = { label: string; icon: "listen" | "pause"; busy: boolean; disabled: boolean; onPress: () => void };

export type ListenBar = ListenControl & {
  // Laptops and desktops while audio is on: the page, time and Back 10 seconds, in place of the page status.
  extras: ReactNode;
  // Short messages, shown just under the bar.
  below: ReactNode;
};

export type ListenPlayer = {
  bar: ListenBar;
  // A page's footer button (spreads), whether that page is being read, and its progress line along the page top.
  page: (id: string) => ListenControl & { reading: boolean; progress: ReactNode };
  audio: ReactNode;
};

const IDLE = { status: "idle" as Status, source: null, queue: [] as string[], index: 0, answered: [] as string[] };

export function useListen(
  setup: ListenSetup | undefined,
  view: ListenItem[],
  speed: ReadingSpeed,
  withExtras: boolean,
  showLabels: boolean,
  extraButtonClass: string
): ListenPlayer | null {
  // The audio element itself, kept in state (a callback ref), so nothing reads a ref while drawing.
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const key = view.map((item) => item.id).join(",");
  const [session, setSession] = useState<Session>({ key, ...IDLE });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announce, setAnnounce] = useState("");
  // A new view: nothing playing, every button back to Listen (the audio element is emptied below).
  if (session.key !== key) {
    setSession({ key, ...IDLE });
    setNotice(null);
  }
  // Check answer or Reveal answer on a question page stops its reading (or drops it from what's still to come).
  if (session.status !== "idle") {
    // Try again puts a question back to answering: from then on, checking it stops it again.
    const reopened = session.answered.filter((id) => view.some((item) => item.id === id && !item.answered));
    if (reopened.length) setSession((current) => ({ ...current, answered: current.answered.filter((id) => !reopened.includes(id)) }));
    const fresh = new Set(view.filter((item) => item.answered && !session.answered.includes(item.id)).map((item) => item.id));
    const ahead = session.queue.slice(session.index);
    if (ahead.some((id) => fresh.has(id))) {
      if (fresh.has(ahead[0])) setSession((current) => ({ ...current, ...IDLE }));
      else setSession((current) => ({ ...current, queue: current.queue.filter((id, index) => index <= current.index || !fresh.has(id)) }));
    }
  }
  const rate = RATES[speed];

  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, [key, audioEl]);
  // Stopped without ending (an answer was checked): the sound stops too.
  useEffect(() => {
    const audio = audioEl;
    if (session.status === "idle" && audio && !audio.paused) audio.pause();
  }, [session.status, audioEl]);
  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }, [rate, audioEl]);
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && audioEl?.pause();
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [audioEl]);
  // A message goes after a few seconds (a new one starts the time again).
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!setup) return null;

  const show = (text: string, account = false) => setNotice({ text, account });
  const numberOf = (id: string) => view.find((item) => item.id === id)?.number ?? 0;

  const playAt = (audio: HTMLAudioElement, id: string) => {
    const src = setup.src(id);
    if (audio.getAttribute("src") !== src) audio.setAttribute("src", src);
    else audio.currentTime = 0;
    audio.playbackRate = rate;
    audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show("The audio couldn't be played. Please try again.");
      setSession((current) => ({ ...current, ...IDLE }));
    });
  };

  // Starts afresh: the bar reads every playable page in view; a footer button reads its own page.
  const start = (source: string, items: ListenItem[]) => {
    const audio = audioEl;
    if (!audio) return;
    if (items.length === 0) return show("Open a page to listen.");
    const playable = items.filter((item) => item.supported && item.id in setup.durations);
    const later = items.filter((item) => !item.supported);
    const missing = items.filter((item) => item.supported && !(item.id in setup.durations));
    if (playable.length === 0) {
      if (missing.length === 0) return show("Listen isn't available for this question type yet.");
      return show(
        missing.length > 1 ? `${setup.languageName} audio isn't ready for these pages yet.` : `${setup.languageName} audio isn't ready for this page yet.`,
        true
      );
    }
    const skipped = [
      ...missing.map((item) => `page ${item.number} (no ${setup.languageName} audio yet)`),
      ...later.map((item) => `page ${item.number} (Listen comes later for this question type)`),
    ];
    if (skipped.length) show(`Listen skips ${skipped.join(" and ")}.`);
    else setNotice(null);
    const answered = items.filter((item) => item.answered).map((item) => item.id);
    setSession((current) => ({ ...current, status: "loading", source, queue: playable.map((item) => item.id), index: 0, answered }));
    setAnnounce(playable.length > 1 || view.length > 1 ? `Reading page ${playable[0].number} aloud.` : "");
    playAt(audio, playable[0].id);
  };

  // Pause or resume the session this button started; otherwise start its own reading.
  const press = (source: string, items: ListenItem[]) => {
    const audio = audioEl;
    if (!audio) return;
    if (session.source === source && (session.status === "playing" || session.status === "loading")) return audio.pause();
    if (session.source === source && session.status === "paused") {
      audio.play().catch(() => show("The audio couldn't be played. Please try again."));
      return;
    }
    start(source, items);
  };

  const busyElsewhere = (source: string) => (session.status === "playing" || session.status === "loading") && session.source !== source;
  const control = (source: string, items: ListenItem[]): ListenControl => {
    const mine = session.source === source;
    return {
      label: mine && session.status === "playing" ? "Pause" : mine && session.status === "paused" ? "Resume" : "Listen",
      icon: mine && session.status === "playing" ? "pause" : "listen",
      busy: mine && session.status === "loading",
      disabled: busyElsewhere(source),
      onPress: () => press(source, items),
    };
  };

  const on = session.status !== "idle";
  const reading = on ? session.queue[session.index] : null;
  const expected = reading ? (setup.durations[reading] ?? 0) / 1000 : 0;

  const audio = (
    <audio
      ref={setAudioEl}
      preload="none"
      onPlaying={() => setSession((current) => (current.status === "idle" ? current : { ...current, status: "playing" }))}
      onPause={(event) => {
        if (!event.currentTarget.ended && event.currentTarget.getAttribute("src")) {
          setSession((current) => (current.status === "idle" ? current : { ...current, status: "paused" }));
        }
      }}
      onEnded={(event) => {
        const next = session.queue[session.index + 1];
        if (!next) return setSession((current) => ({ ...current, ...IDLE }));
        setSession((current) => ({ ...current, status: "loading", index: current.index + 1 }));
        setAnnounce(`Reading page ${numberOf(next)} aloud.`);
        playAt(event.currentTarget, next);
      }}
      onError={(event) => {
        if (!event.currentTarget.getAttribute("src")) return;
        event.currentTarget.removeAttribute("src");
        show("The audio couldn't be loaded. Please try again.");
        setSession((current) => ({ ...current, ...IDLE }));
      }}
    />
  );

  const below = (
    <>
      <p className="sr-only" aria-live="polite">
        {on ? announce : ""}
      </p>
      <div role="status" className="pointer-events-none absolute inset-x-0 top-full z-30 flex justify-center px-4 pt-2">
        {notice && (
          <p className={`pointer-events-auto max-w-xl rounded-xl border-2 border-warn bg-warn-bg px-4 py-3 text-base text-warn-strong ${SOFT_SHADOW}`}>
            {notice.text}
            {notice.account && (
              <>
                {" "}
                You can change your listening language in{" "}
                <Link href={setup.accountHref} className="font-semibold underline underline-offset-2">
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
    withExtras && on && reading ? (
      <>
        <ListenClock key={reading} audio={audioEl} expected={expected} page={numberOf(reading)} />
        <button
          type="button"
          onClick={() => {
            const audio = audioEl;
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
    bar: { ...control(BAR, view), extras, below },
    page: (id) => {
      const item = view.find((entry) => entry.id === id);
      const isReading = reading === id;
      return {
        ...control(id, item ? [item] : []),
        reading: isReading,
        progress: isReading ? <ListenProgress key={id} audio={audioEl} expected={expected} /> : null,
      };
    },
    audio,
  };
}

// The audio's place and length, followed from its own events so only these small parts redraw while it plays.
function useAudioClock(audio: HTMLAudioElement | null, expected: number) {
  const [clock, setClock] = useState({ time: 0, duration: 0 });
  useEffect(() => {
    if (!audio) return;
    const update = () => setClock({ time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    const events = ["timeupdate", "loadedmetadata", "durationchange", "seeked", "emptied"];
    events.forEach((name) => audio.addEventListener(name, update));
    return () => events.forEach((name) => audio.removeEventListener(name, update));
  }, [audio]);
  const duration = clock.duration || expected;
  return { time: Math.min(clock.time, duration || clock.time), duration };
}

function ListenProgress({ audio, expected }: { audio: HTMLAudioElement | null; expected: number }) {
  const { time, duration } = useAudioClock(audio, expected);
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
      className="absolute inset-x-0 top-0 h-1.5 bg-line-soft"
    >
      <div className="hc-fill h-full bg-primary" style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
    </div>
  );
}

function ListenClock({ audio, expected, page }: { audio: HTMLAudioElement | null; expected: number; page: number }) {
  const { time, duration } = useAudioClock(audio, expected);
  return (
    <span className="whitespace-nowrap text-base font-semibold tabular-nums text-ink" aria-hidden="true">
      Page {page} · {formatClock(time * 1000)} / {formatClock(duration * 1000)}
    </span>
  );
}

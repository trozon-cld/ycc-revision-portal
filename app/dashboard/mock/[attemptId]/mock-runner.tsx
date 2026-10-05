"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TextSize } from "@/lib/content/book";
import type { MockRun, MockSaveReply } from "@/lib/mock/types";
import { QuestionView } from "@/components/learning/questions/question-view";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { FlagToggle } from "@/components/candidate/flag-toggle";
import { FocusedShell } from "@/components/learning/focused-shell";
import { saveTextSize } from "@/app/dashboard/prepare/actions";
import { submitMockTest } from "../actions";
import { MockClock } from "./mock-clock";
import { useMockSaver } from "./use-mock-saver";

// Read out to screen readers once, as the time passes these marks (seconds left).
const ANNOUNCE = [
  { at: 600, text: "10 minutes left." },
  { at: 300, text: "5 minutes left." },
  { at: 60, text: "1 minute left." },
];
// When time is up, unsaved answers get this long to reach the server before the test is ended.
const LAST_SAVE_MS = 8000;

// An empty choice (e.g. every pick taken back) counts as no answer.
const isBlank = (response: unknown) =>
  response === null ||
  response === undefined ||
  (Array.isArray(response) && response.length === 0) ||
  (typeof response === "object" && !Array.isArray(response) && Object.keys(response as object).length === 0);

// The mock test: one question at a time, no marking, answers saved as they change; the clock is the server's.
export function MockRunner({ run, initialTextSize }: { run: MockRun; initialTextSize: TextSize }) {
  const router = useRouter();
  const [position, setPosition] = useState(run.position);
  const [responses, setResponses] = useState<unknown[]>(run.responses);
  const [flags, setFlags] = useState<boolean[]>(run.flags);
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  const [secondsLeft, setSecondsLeft] = useState(run.secondsLeft);
  const [announcement, setAnnouncement] = useState("");
  const [timeUp, setTimeUp] = useState(run.secondsLeft <= 0);
  const deadline = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const saver = useMockSaver(run.attemptId, (reply: MockSaveReply) => {
    if (reply.ok) {
      // The server's clock wins when the two drift apart.
      const local = deadline.current === null ? reply.secondsLeft : Math.ceil((deadline.current - performance.now()) / 1000);
      if (Math.abs(local - reply.secondsLeft) > 1) deadline.current = performance.now() + reply.secondsLeft * 1000;
    } else if (reply.reason === "ended") router.refresh();
  });

  // The countdown, from the seconds the server sent.
  useEffect(() => {
    deadline.current = performance.now() + run.secondsLeft * 1000;
    let last = run.secondsLeft;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil(((deadline.current ?? 0) - performance.now()) / 1000));
      if (left === last) return;
      const passed = ANNOUNCE.find((mark) => last > mark.at && left <= mark.at);
      if (passed) setAnnouncement(passed.text);
      last = left;
      setSecondsLeft(left);
      if (left === 0) setTimeUp(true);
    }, 250);
    return () => clearInterval(tick);
  }, [run.secondsLeft]);

  // Time is up: answers can't change; what's waiting is sent, then the test ends.
  useEffect(() => {
    if (!timeUp) return;
    let stopped = false;
    const lastSave = Promise.race([saver.flushAll(), new Promise((resolve) => setTimeout(resolve, LAST_SAVE_MS))]);
    lastSave
      .then(() => submitMockTest(run.attemptId))
      .catch(() => {})
      .finally(() => {
        if (!stopped) router.refresh();
      });
    return () => {
      stopped = true;
    };
    // Runs once, when time runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [position]);

  function goTo(next: number) {
    moved.current = true;
    setPosition(next);
    saver.moveTo(next);
  }

  function answer(response: unknown) {
    if (timeUp) return;
    const value = isBlank(response) ? null : response;
    setResponses((current) => current.map((old, index) => (index === position ? value : old)));
    saver.change({ position, response: value });
  }

  function toggleFlag() {
    const flagged = !flags[position];
    setFlags((current) => current.map((old, index) => (index === position ? flagged : old)));
    saver.change({ position, flagged });
  }

  function changeSize(size: TextSize) {
    setTextSize(size);
    saveTextSize(size).catch(() => {});
  }

  const question = run.questions[position];
  const answered = responses.filter((response) => !isBlank(response)).length;
  const isFirst = position === 0;
  const isLast = position + 1 >= run.total;

  return (
    <FocusedShell
      label="Mock test tools"
      status={`Question ${position + 1} of ${run.total}`}
      shortStatus={`${position + 1} of ${run.total}`}
      progress={{ done: answered, total: run.total }}
      textSize={textSize}
      onTextSizeChange={changeSize}
      timer={(place) => <MockClock seconds={secondsLeft} place={place} />}
      accountInSettings
      scrollRef={scrollRef}
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-12 sm:pt-8">
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">
          Question {position + 1} of {run.total}
        </h1>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {timeUp ? (
          <p role="status" className="rounded-xl border-2 border-red-700 bg-red-50 p-5 text-lg font-semibold text-red-800">
            Time is up. Your test is being submitted.
          </p>
        ) : (
          <>
            <div className="rounded-xl border-2 border-ink/15 bg-white px-4 py-5 text-ink sm:px-6" style={{ fontSize: textSize }}>
              {question ? (
                <QuestionView
                  key={`${run.attemptId}:${position}`}
                  question={question}
                  label={`Question ${position + 1}`}
                  media={run.media}
                  seed={`${run.attemptId}:${question.id}`}
                  initialResponse={responses[position] ?? null}
                  onResponseChange={answer}
                />
              ) : (
                <p className="text-lg text-ink">This question is no longer available. It won’t count towards your score.</p>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
              <button type="button" onClick={() => goTo(position + 1)} disabled={isLast} className={`${PRIMARY_BUTTON} w-full sm:order-3 sm:w-auto sm:justify-self-end`}>
                {isLast ? "Last question" : "Next"}
                {!isLast && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </button>
              <div className="sm:order-2">
                <FlagToggle flagged={flags[position]} onClick={toggleFlag} />
              </div>
              <button type="button" onClick={() => goTo(position - 1)} disabled={isFirst} className={`${SECONDARY_BUTTON} w-full sm:order-1 sm:w-auto sm:justify-self-start`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                Previous
              </button>
            </div>

            <p className={`mt-4 text-base ${saver.status === "retrying" ? "font-semibold text-amber-950" : "text-ink/80"}`}>
              {saver.status === "saved" ? "Your answers are saved." : saver.status === "saving" ? "Saving…" : "Not saved yet. Trying again…"}
            </p>
            <p aria-live="polite" className="sr-only">
              {saver.status === "retrying" ? "Your answers haven’t been saved yet. Trying again." : ""}
            </p>
          </>
        )}
      </div>
    </FocusedShell>
  );
}

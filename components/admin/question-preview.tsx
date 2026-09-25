"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES, type ResolvedMedia, type TextSize } from "@/lib/content/book";
import { checkAnswer } from "@/lib/questions/check";
import { toClientQuestion } from "@/lib/questions/public";
import type { QuestionData, QuestionMode } from "@/lib/questions/types";
import { QuestionView } from "@/components/learning/questions/question-view";
import { DEVICES, type PreviewDevice } from "./book-preview";
import { buttonClass } from "./styles";

const MODES: { key: QuestionMode; label: string }[] = [
  { key: "learn", label: "Handbook" },
  { key: "practice", label: "Practice" },
  { key: "exam", label: "Mock test" },
];

// Admin tool: the real candidate question frame at a real device size, in any of the three modes.
export function QuestionPreview({
  question,
  media,
  shuffles,
}: {
  question: QuestionData & { id: string };
  media: ResolvedMedia;
  // True when Practice and Mock show the options in a shuffled order.
  shuffles: boolean;
}) {
  const [device, setDevice] = useState<PreviewDevice>("phone");
  const [textSize, setTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const [mode, setMode] = useState<QuestionMode>("learn");
  const [shuffleRound, setShuffleRound] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () =>
      setAvailable({
        width: wrapper.clientWidth,
        height: Math.max(320, window.innerHeight - wrapper.getBoundingClientRect().top - 24),
      });
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const frame = DEVICES[device];
  const scale = available.width ? Math.min(1, available.width / frame.width, available.height / frame.height) : 1;
  const sizeIndex = TEXT_SIZES.indexOf(textSize);
  const client = toClientQuestion(question, mode);
  // Any edit or mode change starts the preview afresh.
  const resetKey = `${mode}:${shuffleRound}:${JSON.stringify(question)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Toggle label="Screen size" value={device} options={(Object.keys(DEVICES) as PreviewDevice[]).map((key) => [key, DEVICES[key].label])} onChange={setDevice} />
        <div role="group" aria-label="Text size" className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTextSize(TEXT_SIZES[Math.max(0, sizeIndex - 1)])}
            disabled={sizeIndex === 0}
            aria-label="Smaller text"
            className={buttonClass("secondary", "sm")}
          >
            A−
          </button>
          <span className="w-14 text-center text-sm text-slate-700">{textSize} px</span>
          <button
            type="button"
            onClick={() => setTextSize(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, sizeIndex + 1)])}
            disabled={sizeIndex === TEXT_SIZES.length - 1}
            aria-label="Larger text"
            className={buttonClass("secondary", "sm")}
          >
            A+
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Toggle label="Show as" value={mode} options={MODES.map((item) => [item.key, item.label])} onChange={setMode} />
        {mode !== "learn" && shuffles && (
          <button type="button" onClick={() => setShuffleRound((round) => round + 1)} className={buttonClass("ghost", "sm")}>
            Shuffle again
          </button>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {mode === "learn" && "As in the Handbook: options in your order, with Check answer, Reveal and the explanation."}
        {mode === "practice" && `As in Practice: ${shuffles ? "options shuffled, " : ""}feedback after Check answer, no explanation.`}
        {mode === "exam" && `As in a Mock test: ${shuffles ? "options shuffled, " : ""}no feedback.`}
        {" "}
        {frame.width} × {frame.height}
        {scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
      </p>

      <div ref={wrapperRef} className="w-full">
        <div
          className="overflow-hidden rounded-lg border border-slate-300 bg-white"
          style={{ width: frame.width * scale, height: frame.height * scale }}
        >
          <div
            data-testid="question-preview-frame"
            className="overflow-y-auto"
            style={{ width: frame.width, height: frame.height, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            <div className="mx-auto max-w-[44em] px-[1.25em] py-[1.5em] text-ink" style={{ fontSize: textSize }}>
              <QuestionView
                key={resetKey}
                question={client}
                label={mode === "exam" ? "1 of 36" : "Question"}
                media={media}
                seed={`preview-${shuffleRound}`}
                onCheck={async (response) => checkAnswer(question, response)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`h-9 rounded px-3 text-sm font-medium sm:h-8 ${value === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

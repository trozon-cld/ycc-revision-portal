// Shared question shapes. Pure types only, safe to import in the browser and on the server.

export const QUESTION_TYPE_KEYS = ["single_text", "single_picture", "multi_pick", "hotspot", "area_choice", "match_pictures"] as const;
export type QuestionType = (typeof QUESTION_TYPE_KEYS)[number];

// learn: Handbook (Reveal, feedback, explanation). practice: feedback. exam: Mock, no feedback.
export const QUESTION_MODES = ["learn", "practice", "exam"] as const;
export type QuestionMode = (typeof QUESTION_MODES)[number];

export type QuestionStatus = "draft" | "published";

// Picture layout, as for picture blocks: null size = full width, null align = centred.
export type StemPictureSize = "small" | "medium" | "large";
export type StemPictureAlign = "left" | "right";

// `content` must never reveal the answer: it is sent to the browser in every mode.
export type QuestionData<C = unknown, A = unknown> = {
  type: QuestionType;
  stemText: string;
  stemMediaId: string | null;
  stemMediaSize: StemPictureSize | null;
  stemMediaAlign: StemPictureAlign | null;
  content: C;
  answer: A;
  explanation: string | null;
};

export type StoredQuestion<C = unknown, A = unknown> = QuestionData<C, A> & {
  id: string;
  refNo: number;
  chapterId: string;
  status: QuestionStatus;
  inPractice: boolean;
  inMock: boolean;
  version: number;
};

export type CheckResult = { answered: boolean; correct: boolean };

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && (QUESTION_TYPE_KEYS as readonly string[]).includes(value);
}

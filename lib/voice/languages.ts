// Languages for translated text and audio, kept in the database (voice_languages, voice_phrases; L1). English is
// the source (the page itself); others are translated from it. Server code loads them via language-store.ts.
export type LanguageStatus = "draft" | "live" | "hidden";

export type VoiceLanguage = {
  code: string;
  name: string;
  // The language's own name, in its own script.
  nativeName: string;
  status: LanguageStatus;
  // Extra instruction for the translator (e.g. "Use Gurmukhi script.").
  translatorNote: string | null;
  // How a Key point / Remember box starts when read aloud.
  boxLabels: { "key-point": string; remember: string };
  // How a question page's question and each option start when read aloud ("Option A"); `choose` is the
  // Multiple answers instruction and `chooseArea` the Choose the area one, {n} being how many; `tapArea` Tap the area's;
  // `matchBoxes` and `boxesAre` Match pictures' (the box labels follow).
  questionLabels: { question: string; option: string; choose: string; chooseArea: string; tapArea: string; matchBoxes: string; boxesAre: string };
};

// What the browser needs to name a language.
export type LanguageName = Pick<VoiceLanguage, "code" | "name" | "nativeName">;

export const SOURCE_LANGUAGE = "en";

// The fixed spoken phrases every language needs (voice_phrases.phrase); {n} is a number in `choose` and `choose_area`.
export const PHRASE_KEYS = ["key_point", "remember", "question", "option", "choose", "choose_area", "tap_area", "match_boxes", "boxes_are"] as const;
export type PhraseKey = (typeof PHRASE_KEYS)[number];
export const COUNTED_PHRASES: readonly PhraseKey[] = ["choose", "choose_area"];

// A language from its database row and phrases, or null when a phrase is missing.
export function toVoiceLanguage(
  row: { code: string; name: string; native_name: string; status: LanguageStatus; translator_note: string | null },
  phrases: Partial<Record<string, string>>
): VoiceLanguage | null {
  const p = (key: PhraseKey) => phrases[key]?.trim() ?? "";
  if (PHRASE_KEYS.some((key) => !p(key))) return null;
  return {
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    status: row.status,
    translatorNote: row.translator_note,
    boxLabels: { "key-point": p("key_point"), remember: p("remember") },
    questionLabels: {
      question: p("question"),
      option: p("option"),
      choose: p("choose"),
      chooseArea: p("choose_area"),
      tapArea: p("tap_area"),
      matchBoxes: p("match_boxes"),
      boxesAre: p("boxes_are"),
    },
  };
}

export function languageNames(languages: readonly VoiceLanguage[]): LanguageName[] {
  return languages.map(({ code, name, nativeName }) => ({ code, name, nativeName }));
}

// Languages that need a translation first (all but the source).
export function translatedLanguages<T extends { code: string }>(languages: readonly T[]): T[] {
  return languages.filter((language) => language.code !== SOURCE_LANGUAGE);
}

// Languages for translated text and audio. English is the source (the page itself); others are translated
// from it. Adding a language is one entry here. Box and question labels should be checked by a reader of that language.
export type VoiceLanguage = {
  code: string;
  name: string;
  // The language's own name, in its own script.
  nativeName: string;
  // How a Key point / Remember box starts when read aloud.
  boxLabels: { "key-point": string; remember: string };
  // How a question page's question and each option start when read aloud ("Option A"); `choose` is the
  // Multiple answers instruction and `chooseArea` the Choose the area one, {n} being how many; `tapArea` Tap the area's.
  questionLabels: { question: string; option: string; choose: string; chooseArea: string; tapArea: string };
};

export const SOURCE_LANGUAGE = "en";

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = [
  { code: "en", name: "English", nativeName: "English", boxLabels: { "key-point": "Key point", remember: "Remember" }, questionLabels: { question: "Question", option: "Option", choose: "Choose {n} answers", chooseArea: "Choose one of the {n} outlined areas on the picture", tapArea: "Look at the picture and tap the place that answers the question" } },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", boxLabels: { "key-point": "मुख्य बात", remember: "याद रखें" }, questionLabels: { question: "प्रश्न", option: "विकल्प", choose: "{n} उत्तर चुनें", chooseArea: "चित्र पर बने {n} चिह्नित हिस्सों में से एक चुनें", tapArea: "चित्र को देखें और उस जगह पर टैप करें जो प्रश्न का उत्तर है" } },
  // Gurmukhi script (decided 16 Oct); Shahmukhi would be a separate entry.
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", boxLabels: { "key-point": "ਮੁੱਖ ਗੱਲ", remember: "ਯਾਦ ਰੱਖੋ" }, questionLabels: { question: "ਸਵਾਲ", option: "ਵਿਕਲਪ", choose: "{n} ਜਵਾਬ ਚੁਣੋ", chooseArea: "ਤਸਵੀਰ 'ਤੇ ਬਣੇ {n} ਨਿਸ਼ਾਨ ਲੱਗੇ ਹਿੱਸਿਆਂ ਵਿੱਚੋਂ ਇੱਕ ਚੁਣੋ", tapArea: "ਤਸਵੀਰ ਨੂੰ ਦੇਖੋ ਅਤੇ ਉਸ ਥਾਂ 'ਤੇ ਟੈਪ ਕਰੋ ਜੋ ਸਵਾਲ ਦਾ ਜਵਾਬ ਹੈ" } },
];

// Languages that need a translation first (all but the source).
export const TRANSLATED_LANGUAGES = VOICE_LANGUAGES.filter((language) => language.code !== SOURCE_LANGUAGE);

export function voiceLanguage(code: unknown): VoiceLanguage | null {
  return VOICE_LANGUAGES.find((language) => language.code === code) ?? null;
}

export function isTranslatedLanguage(code: unknown): boolean {
  return code !== SOURCE_LANGUAGE && voiceLanguage(code) !== null;
}

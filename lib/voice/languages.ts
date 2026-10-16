// Languages for translated text and audio. English is the source (the page itself); others are translated
// from it. Adding a language is one entry here. Box labels should be checked by a reader of that language.
export type VoiceLanguage = {
  code: string;
  name: string;
  // The language's own name, in its own script.
  nativeName: string;
  // How a Key point / Remember box starts when read aloud.
  boxLabels: { "key-point": string; remember: string };
};

export const SOURCE_LANGUAGE = "en";

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = [
  { code: "en", name: "English", nativeName: "English", boxLabels: { "key-point": "Key point", remember: "Remember" } },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", boxLabels: { "key-point": "मुख्य बात", remember: "याद रखें" } },
  // Gurmukhi script (decided 16 Oct); Shahmukhi would be a separate entry.
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", boxLabels: { "key-point": "ਮੁੱਖ ਗੱਲ", remember: "ਯਾਦ ਰੱਖੋ" } },
];

// Languages that need a translation first (all but the source).
export const TRANSLATED_LANGUAGES = VOICE_LANGUAGES.filter((language) => language.code !== SOURCE_LANGUAGE);

export function voiceLanguage(code: unknown): VoiceLanguage | null {
  return VOICE_LANGUAGES.find((language) => language.code === code) ?? null;
}

export function isTranslatedLanguage(code: unknown): boolean {
  return code !== SOURCE_LANGUAGE && voiceLanguage(code) !== null;
}

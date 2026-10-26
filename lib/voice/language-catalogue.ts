import { SOURCE_LANGUAGE } from "./languages";

// The languages staff can add for Listen (user's list, 23 Oct), in this order. Adding one is one line here.
// English is the source and is always there, so it isn't listed.
export type CatalogueLanguage = {
  code: string;
  name: string;
  // Its own name, as shown in lists (capital first letter).
  nativeName: string;
  // Extra instruction for the translator (sent with every translation into this language).
  translatorNote?: string;
  // Google Cloud Translation's code when it differs from ours (e.g. European Portuguese).
  googleTranslate?: string;
  // Google Text-to-Speech region whose voices read this language (its WaveNet voice, else Standard).
  googleVoice: string;
};

export const LANGUAGE_CATALOGUE: readonly CatalogueLanguage[] = [
  // Google has no Welsh voice (23 Oct): translation works; audio is refused with a clear message.
  { code: "cy", name: "Welsh", nativeName: "Cymraeg", googleVoice: "cy-GB" },
  { code: "de", name: "German (Germany)", nativeName: "Deutsch (Deutschland)", googleVoice: "de-DE" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių", googleVoice: "lt-LT" },
  { code: "pl", name: "Polish", nativeName: "Polski", googleVoice: "pl-PL" },
  { code: "pt", name: "Portuguese", nativeName: "Português", googleTranslate: "pt-PT", googleVoice: "pt-PT" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", translatorNote: "Use Gurmukhi script.", googleVoice: "pa-IN" },
  { code: "ro", name: "Romanian", nativeName: "Română", googleVoice: "ro-RO" },
  { code: "ru", name: "Russian", nativeName: "Русский", googleVoice: "ru-RU" },
  { code: "bg", name: "Bulgarian", nativeName: "Български", googleVoice: "bg-BG" },
  { code: "cs", name: "Czech", nativeName: "Čeština", googleVoice: "cs-CZ" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", googleVoice: "hu-HU" },
  { code: "fr", name: "French", nativeName: "Français", googleVoice: "fr-FR" },
  { code: "es", name: "Spanish", nativeName: "Español", googleVoice: "es-ES" },
];

// The code Google Cloud Translation uses for one of our languages (ours unless the list says otherwise;
// Punjabi "pa" is Gurmukhi there).
export function googleTranslateCode(code: string): string {
  return LANGUAGE_CATALOGUE.find((language) => language.code === code)?.googleTranslate ?? code;
}

// The Google Text-to-Speech region for one of our languages: British English for English; a language not in the
// list (e.g. one added before it) uses its own code, and Google matches any region of it.
export function googleVoiceRegion(code: string): string {
  if (code === SOURCE_LANGUAGE) return "en-GB";
  return LANGUAGE_CATALOGUE.find((language) => language.code === code)?.googleVoice ?? code;
}

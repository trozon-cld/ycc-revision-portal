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
};

export const LANGUAGE_CATALOGUE: readonly CatalogueLanguage[] = [
  // Not in Google's list of Gemini voices: translation works; try the audio before relying on it.
  { code: "cy", name: "Welsh", nativeName: "Cymraeg" },
  { code: "de", name: "German (Germany)", nativeName: "Deutsch (Deutschland)" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "pt", name: "Portuguese", nativeName: "Português", googleTranslate: "pt-PT" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", translatorNote: "Use Gurmukhi script." },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
];

// The code Google Cloud Translation uses for one of our languages (ours unless the list says otherwise;
// Punjabi "pa" is Gurmukhi there).
export function googleTranslateCode(code: string): string {
  return LANGUAGE_CATALOGUE.find((language) => language.code === code)?.googleTranslate ?? code;
}

// The languages staff can add for Listen: every language Google's Gemini voice supports that people in England
// speak, most-spoken first. Speakers: people aged 3+ with it as their main language, Census 2021 England (ONS TS024).
export type CatalogueLanguage = {
  code: string;
  name: string;
  nativeName: string;
  // null: not counted separately in the census.
  speakers: number | null;
  rtl?: true;
  // Extra instruction for the translator (sent with every translation into this language).
  translatorNote?: string;
};

// People in England aged 3 and over, Census 2021 (TS024): the base for the percentages.
export const CENSUS_RESIDENTS = 54_686_087;

export const LANGUAGE_CATALOGUE: readonly CatalogueLanguage[] = [
  { code: "pl", name: "Polish", nativeName: "Polski", speakers: 590_983 },
  { code: "ro", name: "Romanian", nativeName: "Română", speakers: 465_933 },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", speakers: 288_659, translatorNote: "Use Gurmukhi script." },
  { code: "ur", name: "Urdu", nativeName: "اردو", speakers: 267_610, rtl: true },
  { code: "pt", name: "Portuguese", nativeName: "Português", speakers: 221_076 },
  { code: "es", name: "Spanish", nativeName: "Español", speakers: 211_997 },
  { code: "ar", name: "Arabic", nativeName: "العربية", speakers: 195_483, rtl: true },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", speakers: 194_822 },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", speakers: 188_205 },
  { code: "it", name: "Italian", nativeName: "Italiano", speakers: 157_643 },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", speakers: 123_728 },
  { code: "fr", name: "French", nativeName: "Français", speakers: 118_630 },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių", speakers: 117_876 },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", speakers: 110_651 },
  { code: "bg", name: "Bulgarian", nativeName: "Български", speakers: 108_942 },
  { code: "ru", name: "Russian", nativeName: "Русский", speakers: 89_910 },
  { code: "fa", name: "Persian (Farsi)", nativeName: "فارسی", speakers: 86_277, rtl: true },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", speakers: 85_204 },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", speakers: 75_261 },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", speakers: 73_292 },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", speakers: 62_990 },
  { code: "fil", name: "Filipino (Tagalog)", nativeName: "Filipino", speakers: 59_127 },
  { code: "sq", name: "Albanian", nativeName: "Shqip", speakers: 51_885 },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", speakers: 50_622 },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina", speakers: 48_508 },
  { code: "ps", name: "Pashto", nativeName: "پښتو", speakers: 48_163, rtl: true },
  { code: "de", name: "German", nativeName: "Deutsch", speakers: 45_208 },
  { code: "lv", name: "Latvian", nativeName: "Latviešu", speakers: 37_871 },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", speakers: 30_691 },
  { code: "cmn", name: "Chinese (Mandarin)", nativeName: "普通话", speakers: 29_831, translatorNote: "Use Simplified Chinese characters." },
  { code: "cs", name: "Czech", nativeName: "Čeština", speakers: 28_752 },
  { code: "ja", name: "Japanese", nativeName: "日本語", speakers: 22_205 },
  { code: "th", name: "Thai", nativeName: "ไทย", speakers: 22_078 },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", speakers: 18_511 },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", speakers: 18_099 },
  // The census counts Bosnian, Croatian, Serbian and Montenegrin together (17,798); Gemini voices Croatian and Serbian.
  { code: "hr", name: "Croatian", nativeName: "Hrvatski", speakers: 17_798 },
  { code: "sr", name: "Serbian", nativeName: "Српски", speakers: 17_798 },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", speakers: 13_991 },
  { code: "si", name: "Sinhala", nativeName: "සිංහල", speakers: 12_716 },
  { code: "sv", name: "Swedish", nativeName: "Svenska", speakers: 12_263 },
  { code: "ko", name: "Korean", nativeName: "한국어", speakers: 11_894 },
  { code: "mr", name: "Marathi", nativeName: "मराठी", speakers: 10_865 },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", speakers: 10_654 },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", speakers: 10_044 },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", speakers: 7_762 },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans", speakers: 7_304 },
  { code: "he", name: "Hebrew", nativeName: "עברית", speakers: 6_618, rtl: true },
  { code: "da", name: "Danish", nativeName: "Dansk", speakers: 5_918 },
  { code: "fi", name: "Finnish", nativeName: "Suomi", speakers: 4_659 },
  { code: "et", name: "Estonian", nativeName: "Eesti", speakers: 2_572 },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina", speakers: 2_293 },
  // Not counted separately in the census, A–Z.
  { code: "hy", name: "Armenian", nativeName: "Հայերեն", speakers: null },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca", speakers: null },
  { code: "eu", name: "Basque", nativeName: "Euskara", speakers: null },
  { code: "be", name: "Belarusian", nativeName: "Беларуская", speakers: null },
  { code: "my", name: "Burmese", nativeName: "မြန်မာ", speakers: null },
  { code: "ca", name: "Catalan", nativeName: "Català", speakers: null },
  { code: "ceb", name: "Cebuano", nativeName: "Cebuano", speakers: null },
  { code: "gl", name: "Galician", nativeName: "Galego", speakers: null },
  { code: "ka", name: "Georgian", nativeName: "ქართული", speakers: null },
  { code: "ht", name: "Haitian Creole", nativeName: "Kreyòl ayisyen", speakers: null },
  { code: "is", name: "Icelandic", nativeName: "Íslenska", speakers: null },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", speakers: null },
  { code: "jv", name: "Javanese", nativeName: "Basa Jawa", speakers: null },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", speakers: null },
  { code: "kok", name: "Konkani", nativeName: "कोंकणी", speakers: null },
  { code: "lo", name: "Lao", nativeName: "ລາວ", speakers: null },
  { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch", speakers: null },
  { code: "mk", name: "Macedonian", nativeName: "Македонски", speakers: null },
  { code: "mai", name: "Maithili", nativeName: "मैथिली", speakers: null },
  { code: "mg", name: "Malagasy", nativeName: "Malagasy", speakers: null },
  { code: "mn", name: "Mongolian", nativeName: "Монгол", speakers: null },
  { code: "nb", name: "Norwegian", nativeName: "Norsk", speakers: null },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", speakers: null },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", speakers: null, rtl: true },
];


// Share of England's residents aged 3+ with this as their main language, for the Add language list.
export function speakerShare(language: CatalogueLanguage): string {
  if (language.speakers === null) return "not counted separately";
  const percent = (language.speakers / CENSUS_RESIDENTS) * 100;
  return percent < 0.01 ? "under 0.01%" : `${percent.toFixed(2)}%`;
}

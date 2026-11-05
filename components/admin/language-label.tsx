import type { LanguageName } from "@/lib/voice/languages";

// "Polish (Polski)"; just "English" when both names are the same. The native name is marked with its language.
export function LanguageLabel({ language }: { language: LanguageName }) {
  if (language.nativeName === language.name) return <>{language.name}</>;
  return (
    <>
      {language.name} <span lang={language.code}>({language.nativeName})</span>
    </>
  );
}

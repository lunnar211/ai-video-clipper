/**
 * Caption translation language list (curated, honest).
 *
 * Translation runs through the existing LLM chain, so in principle it
 * can attempt any language — but copy must never promise "100+
 * languages". This list is the set the UI offers: widely spoken
 * languages the chain handles reliably in practice. Quality varies by
 * language and is not guaranteed; the UI says so.
 */

export type SupportedLanguage = { code: string; name: string };

export const TRANSLATION_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
  { code: "ne", name: "Nepali" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "ar", name: "Arabic" },
  { code: "bn", name: "Bengali" },
  { code: "ur", name: "Urdu" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "mr", name: "Marathi" },
  { code: "pa", name: "Punjabi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "sw", name: "Swahili" },
];

export function languageName(code: string): string {
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

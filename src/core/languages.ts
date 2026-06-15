/**
 * India-specific language support. The tutor teaches + grades in the chosen language (LLM-native,
 * free via NIM), and the client uses `speech` codes for mic (speech-to-text) and read-aloud (TTS).
 * English is the instant default; others are fully supported by the model.
 */
export interface Lang {
  code: string; // our short code
  name: string; // English name (used in LLM instructions)
  native: string; // shown in the UI selector
  speech: string; // BCP-47 code for browser Speech APIs (mic + TTS)
}

export const LANGUAGES: Record<string, Lang> = {
  en: { code: 'en', name: 'English', native: 'English', speech: 'en-IN' },
  hi: { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  pa: { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  ta: { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  bn: { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
};

export function lang(code?: string): Lang {
  return LANGUAGES[(code || 'en').toLowerCase()] ?? LANGUAGES.en;
}

/** A line to append to any LLM prompt so it answers in the learner's language (maths stays standard). */
export function languageInstruction(code?: string): string {
  const l = lang(code);
  if (l.code === 'en') return '';
  return `\n\nIMPORTANT: Write your ENTIRE reply in ${l.name} (${l.native}). Keep mathematical notation/symbols standard (e.g. $2^3$, HCF). Translate naturally — do not mix in English sentences.`;
}

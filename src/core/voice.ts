import axios from 'axios';
import { lang } from './languages.js';

/**
 * Server-side voice + translation providers, each as a fallback CHAIN so no single vendor is a
 * single point of failure or a runaway cost. Sarvam is a smaller company (cost/rate-limit risk), so
 * Deepgram and (when a key exists) ElevenLabs back it up; the browser is the final free fallback.
 *
 * Keys (all optional — a provider is simply skipped if its key is absent):
 *   SARVAM_API_KEY      — translate + TTS + STT (Indic specialist)   [verified working]
 *   DEEPGRAM_API_KEY    — STT (strong multilingual) + Aura TTS (English)
 *   ELEVENLABS_API_KEY  — TTS (multilingual). NOTE: free tier = 10k chars/mo; kept as a FALLBACK only
 *                         (not English primary) so its monthly quota cliff can't flip the voice mid-session.
 */
const SARVAM = process.env.SARVAM_API_KEY;
const DEEPGRAM = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS = process.env.ELEVENLABS_API_KEY;

const sarvamHeaders = { 'api-subscription-key': SARVAM || '', 'Content-Type': 'application/json' };

// ---------- Translation ----------

/** Sarvam translate (en → target). Returns null on failure so the caller falls back. */
export async function sarvamTranslate(text: string, langCode: string): Promise<string | null> {
  if (!SARVAM) return null;
  try {
    const res = await axios.post(
      'https://api.sarvam.ai/translate',
      { input: text, source_language_code: 'en-IN', target_language_code: lang(langCode).speech, model: 'mayura:v1' },
      { headers: sarvamHeaders, timeout: 12_000 }
    );
    const out = res.data?.translated_text;
    return out && String(out).trim() ? String(out) : null;
  } catch {
    return null;
  }
}

// ---------- Text-to-speech (read-aloud) ----------

export interface TtsResult {
  audioBase64: string;
  mime: string;
  provider: string;
}

async function sarvamTTS(text: string, langCode: string): Promise<TtsResult | null> {
  if (!SARVAM) return null;
  try {
    const res = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      // pace < 1 reads a touch slower so commas/periods land and sentences are easier to follow.
      { text: text.slice(0, 1500), target_language_code: lang(langCode).speech, speaker: 'anushka', model: 'bulbul:v2', pace: 0.9 },
      { headers: sarvamHeaders, timeout: 20_000 }
    );
    const a = res.data?.audios?.[0];
    return a ? { audioBase64: a, mime: 'audio/wav', provider: 'sarvam' } : null;
  } catch {
    return null;
  }
}

async function elevenTTS(text: string): Promise<TtsResult | null> {
  if (!ELEVENLABS) return null;
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text: text.slice(0, 1500), model_id: 'eleven_multilingual_v2' },
      { headers: { 'xi-api-key': ELEVENLABS, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 20_000 }
    );
    return { audioBase64: Buffer.from(res.data).toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs' };
  } catch {
    return null;
  }
}

async function deepgramTTS(text: string): Promise<TtsResult | null> {
  if (!DEEPGRAM) return null;
  try {
    const res = await axios.post(
      'https://api.deepgram.com/v1/speak?model=aura-asteria-en',
      { text: text.slice(0, 1500) },
      { headers: { Authorization: `Token ${DEEPGRAM}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 20_000 }
    );
    return { audioBase64: Buffer.from(res.data).toString('base64'), mime: 'audio/mpeg', provider: 'deepgram' };
  } catch {
    return null;
  }
}

export type TtsProvider = 'elevenlabs' | 'sarvam' | 'deepgram';

/**
 * TTS chain, ordered by language for a CONSISTENT, reliable voice (no mid-session vendor swaps):
 *   - ENGLISH → Deepgram Aura (reliable quota, consistent "Asteria") → ElevenLabs → Sarvam.
 *     (ElevenLabs free tier is only ~10k chars/mo, so as PRIMARY it exhausts mid-session and the voice
 *      audibly flips to Deepgram — that's the "voice changed between turns" bug. It's a fallback now, not
 *      primary. Sarvam's Indic voice reading English runs fast/garbles, so it stays last.)
 *   - INDIC   → Sarvam (the Indic specialist) → ElevenLabs (multilingual).
 * `force` pins a single provider (the testing toggle); if it yields nothing we fall back to the
 * language default so the learner still hears the reply. Returns null → client uses browser TTS.
 */
export async function synthesize(
  text: string,
  langCode: string,
  force?: TtsProvider,
  strict = false
): Promise<TtsResult | null> {
  const isEnglish = langCode === 'en';
  const byName: Record<TtsProvider, () => Promise<TtsResult | null>> = {
    elevenlabs: () => elevenTTS(text),
    deepgram: () => deepgramTTS(text),
    sarvam: () => sarvamTTS(text, langCode),
  };
  if (force && byName[force]) {
    const forced = await byName[force]();
    if (forced) return forced;
    // strict: the caller PINNED this provider for voice CONSISTENCY across a multi-chunk reply — do
    // NOT silently swap to another vendor's voice mid-utterance (that made consecutive items sound
    // like different narrators). Return null so the client re-reads just this chunk with the browser.
    if (strict) return null;
    // non-strict (e.g. the testing toggle): forced provider failed — fall through to the default chain.
  }
  const chain: Array<() => Promise<TtsResult | null>> = isEnglish
    ? [byName.deepgram, byName.elevenlabs, byName.sarvam]
    : [byName.sarvam, byName.elevenlabs];
  for (const attempt of chain) {
    const r = await attempt();
    if (r) return r;
  }
  return null;
}

// ---------- Speech-to-text (mic) ----------

export interface SttResult {
  transcript: string;
  provider: string;
}

async function deepgramSTT(audio: Buffer, mime: string, langCode: string): Promise<SttResult | null> {
  if (!DEEPGRAM) return null;
  try {
    const dgLang = langCode === 'en' ? 'en-IN' : lang(langCode).speech;
    const res = await axios.post(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${encodeURIComponent(dgLang)}`,
      audio,
      { headers: { Authorization: `Token ${DEEPGRAM}`, 'Content-Type': mime }, timeout: 25_000 }
    );
    const t = res.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return t && t.trim() ? { transcript: t, provider: 'deepgram' } : null;
  } catch {
    return null;
  }
}

async function sarvamSTT(audio: Buffer, mime: string, langCode: string): Promise<SttResult | null> {
  if (!SARVAM) return null;
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    const ext = mime.includes('wav') ? 'wav' : mime.includes('mp') ? 'mp3' : 'webm';
    form.append('file', audio, { filename: `audio.${ext}`, contentType: mime });
    form.append('model', 'saarika:v2.5');
    form.append('language_code', lang(langCode).speech);
    const res = await axios.post('https://api.sarvam.ai/speech-to-text', form, {
      headers: { 'api-subscription-key': SARVAM, ...form.getHeaders() },
      timeout: 25_000,
    });
    const t = res.data?.transcript;
    return t && t.trim() ? { transcript: t, provider: 'sarvam' } : null;
  } catch {
    return null;
  }
}

/** STT chain. For Indian languages, Sarvam (Indic-specialist) leads; for English, Deepgram leads. */
export async function transcribe(audio: Buffer, mime: string, langCode: string): Promise<SttResult | null> {
  const order =
    langCode === 'en'
      ? [() => deepgramSTT(audio, mime, langCode), () => sarvamSTT(audio, mime, langCode)]
      : [() => sarvamSTT(audio, mime, langCode), () => deepgramSTT(audio, mime, langCode)];
  for (const attempt of order) {
    const r = await attempt();
    if (r) return r;
  }
  return null;
}

export const voiceProviders = {
  translate: !!SARVAM,
  tts: !!(SARVAM || ELEVENLABS || DEEPGRAM),
  stt: !!(DEEPGRAM || SARVAM),
};

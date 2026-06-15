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
 *   ELEVENLABS_API_KEY  — TTS/STT (multilingual)  [no key yet — slot is dormant until added]
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

/** TTS chain: Sarvam (Indic) → ElevenLabs (if key) → Deepgram Aura (English only) → null (client uses browser TTS). */
export async function synthesize(text: string, langCode: string): Promise<TtsResult | null> {
  const isEnglish = langCode === 'en';

  // 1) Sarvam — best for Indian languages (and fine for English).
  if (SARVAM) {
    try {
      const res = await axios.post(
        'https://api.sarvam.ai/text-to-speech',
        { text: text.slice(0, 1500), target_language_code: lang(langCode).speech, speaker: 'anushka', model: 'bulbul:v2' },
        { headers: sarvamHeaders, timeout: 20_000 }
      );
      const a = res.data?.audios?.[0];
      if (a) return { audioBase64: a, mime: 'audio/wav', provider: 'sarvam' };
    } catch {
      /* fall through */
    }
  }

  // 2) ElevenLabs — multilingual (dormant until a key is added).
  if (ELEVENLABS) {
    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
      const res = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        { text: text.slice(0, 1500), model_id: 'eleven_multilingual_v2' },
        { headers: { 'xi-api-key': ELEVENLABS, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 20_000 }
      );
      return { audioBase64: Buffer.from(res.data).toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs' };
    } catch {
      /* fall through */
    }
  }

  // 3) Deepgram Aura — English only, decent fallback for en.
  if (DEEPGRAM && isEnglish) {
    try {
      const res = await axios.post(
        'https://api.deepgram.com/v1/speak?model=aura-asteria-en',
        { text: text.slice(0, 1500) },
        { headers: { Authorization: `Token ${DEEPGRAM}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 20_000 }
      );
      return { audioBase64: Buffer.from(res.data).toString('base64'), mime: 'audio/mpeg', provider: 'deepgram' };
    } catch {
      /* fall through */
    }
  }

  return null; // client falls back to the browser's built-in TTS
}

// ---------- Speech-to-text (mic) ----------

export interface SttResult {
  transcript: string;
  provider: string;
}

/** STT chain: Deepgram (strong multilingual) → Sarvam (Indic) → null (client falls back to browser STT). */
export async function transcribe(audio: Buffer, mime: string, langCode: string): Promise<SttResult | null> {
  // 1) Deepgram — reliable multilingual ASR.
  if (DEEPGRAM) {
    try {
      const dgLang = langCode === 'en' ? 'en-IN' : lang(langCode).speech; // Deepgram accepts BCP-47
      const res = await axios.post(
        `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${encodeURIComponent(dgLang)}`,
        audio,
        { headers: { Authorization: `Token ${DEEPGRAM}`, 'Content-Type': mime }, timeout: 25_000 }
      );
      const t = res.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (t && t.trim()) return { transcript: t, provider: 'deepgram' };
    } catch {
      /* fall through */
    }
  }

  // 2) Sarvam Saaras — Indic ASR (multipart form).
  if (SARVAM) {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', audio, { filename: 'audio.webm', contentType: mime });
      form.append('model', 'saarika:v2');
      form.append('language_code', lang(langCode).speech);
      const res = await axios.post('https://api.sarvam.ai/speech-to-text', form, {
        headers: { 'api-subscription-key': SARVAM, ...form.getHeaders() },
        timeout: 25_000,
      });
      const t = res.data?.transcript;
      if (t && t.trim()) return { transcript: t, provider: 'sarvam' };
    } catch {
      /* fall through */
    }
  }

  return null;
}

export const voiceProviders = {
  translate: !!SARVAM,
  tts: !!(SARVAM || ELEVENLABS || DEEPGRAM),
  stt: !!(DEEPGRAM || SARVAM),
};

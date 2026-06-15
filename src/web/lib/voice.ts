/**
 * Browser voice: speech-to-text (mic) + text-to-speech (read aloud), both language-aware.
 * Uses the free Web Speech APIs — no keys. Falls back gracefully where unsupported.
 * (Socratic uses Deepgram server-side; the browser APIs are the free path and cover hi/pa/ta/bn-IN.)
 */

type Rec = any;

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Start dictation in `speechLang` (BCP-47). Calls onResult with the transcript; returns a stop() fn. */
export function listen(
  speechLang: string,
  onResult: (text: string) => void,
  onEnd?: () => void
): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    onEnd?.();
    return () => {};
  }
  const rec: Rec = new Ctor();
  rec.lang = speechLang;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    onResult((finalText + interim).trim());
  };
  rec.onerror = () => {};
  rec.onend = () => onEnd?.();
  try {
    rec.start();
  } catch {
    onEnd?.();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  };
}

let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  if (!voicesCache.length) voicesCache = window.speechSynthesis.getVoices();
  return voicesCache;
}
if (ttsSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesCache = window.speechSynthesis.getVoices();
  };
}

/** Read `text` aloud in `speechLang`. Strips markdown/LaTeX so it sounds natural. */
export function speak(text: string, speechLang: string) {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/[#_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = speechLang;
  const v = loadVoices().find((vo) => vo.lang === speechLang) || loadVoices().find((vo) => vo.lang.startsWith(speechLang.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ---- Server-backed voice (Sarvam/ElevenLabs/Deepgram), with browser fallback ----

let currentAudio: HTMLAudioElement | null = null;

/** Read aloud via the server TTS chain (good Indic voices); fall back to the browser if it returns nothing. */
export async function speakSmart(text: string, langCode: string, speechLang: string, apiBase: string) {
  stopSpeaking();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  try {
    const res = await fetch(`${apiBase}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: langCode }),
    });
    const d = await res.json();
    if (d?.audioBase64) {
      currentAudio = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.audioBase64}`);
      await currentAudio.play();
      return;
    }
  } catch {
    /* fall through to browser */
  }
  speak(text, speechLang); // browser fallback
}

/**
 * Record one utterance from the mic and transcribe via the server STT chain (Deepgram/Sarvam),
 * falling back to the browser. Returns a stop() that finalises + transcribes. onText gets the result.
 */
export async function recordAndTranscribe(
  langCode: string,
  speechLang: string,
  apiBase: string,
  onText: (text: string) => void,
  onEnd: () => void
): Promise<() => void> {
  // Prefer real audio capture → server STT (accurate for Indian languages).
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const b64 = await blobToBase64(blob);
          const res = await fetch(`${apiBase}/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mime: blob.type, lang: langCode }),
          });
          const d = await res.json();
          if (d?.transcript) onText(d.transcript);
        } catch {
          /* ignore */
        } finally {
          onEnd();
        }
      };
      rec.start();
      return () => rec.state !== 'inactive' && rec.stop();
    } catch {
      /* fall through to browser STT */
    }
  }
  // Browser fallback.
  const stop = listen(speechLang, onText, onEnd);
  return stop;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

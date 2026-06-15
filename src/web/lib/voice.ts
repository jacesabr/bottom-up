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

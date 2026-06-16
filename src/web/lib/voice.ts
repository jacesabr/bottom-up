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

// How each capital letter should be spelled so a TTS voice says the LETTER name clearly.
// (A bare "A"/"B" from Sarvam is too ambiguous to hear; "Ay"/"Bee" come through.) "A" and "I"
// are deliberately excluded here — they're English words, handled separately and only in maths
// context. Lowercase maths vars (x, y) are pronounced fine, so we never touch them.
// Lowercase on purpose: the voice pronounces lowercase "ay/bee/see" clearly as the letter, but
// reads the capitalised forms like names ("y/v"). This text is spoken only, never displayed.
const CAP_LETTER: Record<string, string> = {
  B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch', J: 'jay',
  K: 'kay', L: 'ell', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'arr',
  S: 'ess', T: 'tee', U: 'yoo', V: 'vee', W: 'double-yoo', X: 'eks', Y: 'why', Z: 'zed',
};
const CAP_NAMES = Object.values(CAP_LETTER).concat('ay').join('|');
const A_OP = 'times|plus|minus|over|equals|cross|squared|cubed';
const A_LEAD = 'times|plus|minus|over|equals|cross|set|sets|point|points|vertex|vertices|angle|matrix|line|triangle|side|region';

function phoneticiseCapitalLetters(t: string): string {
  // 1) Standalone capitals that are NOT English words (B–H, J–Z) → always spell out.
  t = t.replace(/(^|[^A-Za-z'])([B-HJ-Z])(?![A-Za-z'])/g, (_m, pre, L) => pre + (CAP_LETTER[L] || L));
  // 2) "A" only in clear maths surroundings, so the article "A relation" stays "A".
  //    a) "A," / "A times" / "A Bee" / "A and Bee"
  t = t.replace(
    new RegExp(`(^|[^A-Za-z'])A(?=,|\\s+(?:${A_OP})\\b|\\s+(?:and\\s+)?(?:${CAP_NAMES})\\b)`, 'g'),
    '$1ay'
  );
  //    b) "set A" / "point A" / "times A" / "equals A"
  t = t.replace(new RegExp(`\\b(?:${A_LEAD})\\s+A(?![A-Za-z'])`, 'g'), (m) => m.slice(0, -1) + 'ay');
  return t;
}

/**
 * Turn markdown + LaTeX into words a voice can read naturally — no stray "dollar", "slash",
 * "asterisk", or backslash-commands. Punctuation (. , ? ! ; :) is preserved so the engine
 * still pauses at clause and sentence boundaries.
 */
export function stripForSpeech(text: string): string {
  let t = text;

  // 0) Genuine multiplication is written tight (2*3, 2*x, a*b, f(x)*g(x)) — convert it to "times"
  //    BEFORE the emphasis step, so those asterisks can't be mistaken for italic markers (which
  //    would eat the maths between two products). Emphasis "*"s are space-/edge-flanked, so this
  //    operand-adjacent rule never touches them.
  t = t.replace(/([0-9a-zA-Z)\]])\*([0-9a-zA-Z(\[])/g, '$1 times $2');

  // 1) Markdown emphasis (only true emphasis asterisks remain now).
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/__(.+?)__/g, '$1');
  t = t.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1$2'); // *italic* but not bullet "* "

  // 2) Unwrap math delimiters, keeping the inner expression: $$..$$, \[..\], \(..\), $..$
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ');
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, ' $1 ');
  t = t.replace(/\$([^$]*)\$/g, ' $1 ');

  // 3) Fractions → "a over b" (loop a few times for light nesting).
  for (let i = 0; i < 3; i++) {
    t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ');
  }

  // 4) Roots.
  t = t.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, ' $1 root of $2 ');
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, ' square root of $1 ');

  // 5) Powers and subscripts.
  t = t.replace(/\^\s*\{?\s*2\s*\}?(?![0-9a-zA-Z])/g, ' squared ');
  t = t.replace(/\^\s*\{?\s*3\s*\}?(?![0-9a-zA-Z])/g, ' cubed ');
  t = t.replace(/\^\s*\{([^{}]*)\}/g, ' to the power $1 ');
  t = t.replace(/\^\s*([0-9a-zA-Z]+)/g, ' to the power $1 ');
  t = t.replace(/_\s*\{([^{}]*)\}/g, ' sub $1 ');
  t = t.replace(/_\s*([0-9a-zA-Z]+)/g, ' sub $1 ');

  // 6) Named operators / Greek / symbols → words.
  const sym: [RegExp, string][] = [
    [/\\times/g, ' times '],
    [/\\div/g, ' divided by '],
    [/\\cdot/g, ' times '],
    [/\\pm/g, ' plus or minus '],
    [/\\leq|\\le\b/g, ' is less than or equal to '],
    [/\\geq|\\ge\b/g, ' is greater than or equal to '],
    [/\\neq|\\ne\b/g, ' is not equal to '],
    [/\\approx/g, ' approximately '],
    [/\\pi/g, ' pi '],
    [/\\theta/g, ' theta '],
    [/\\alpha/g, ' alpha '],
    [/\\beta/g, ' beta '],
    [/\\lambda/g, ' lambda '],
    [/\\Delta|\\delta/g, ' delta '],
    [/\\infty/g, ' infinity '],
    [/\\sum/g, ' sum of '],
    [/\\int/g, ' integral of '],
    [/\\rightarrow|\\to\b/g, ' goes to '],
    [/\\degree|\\circ/g, ' degrees '],
  ];
  for (const [re, rep] of sym) t = t.replace(re, rep);

  // 7) Inline arithmetic operators between operands (multiplication handled up front in step 0).
  t = t.replace(/([0-9a-zA-Z)\]])\s*\/\s*([0-9a-zA-Z(\[])/g, '$1 over $2'); // a/b → a over b
  t = t.replace(/([0-9a-zA-Z)\]])\s*\+\s*([0-9a-zA-Z(\[])/g, '$1 plus $2'); // x + 2 → x plus 2
  t = t.replace(/([0-9a-zA-Z)\]])\s*=\s*([0-9a-zA-Z(\[-])/g, '$1 equals $2'); // x=2 → x equals 2

  // 8) Drop any remaining LaTeX commands and leftover braces/backslashes/dollars.
  t = t.replace(/\\[a-zA-Z]+/g, ' ');
  t = t.replace(/[{}\\$]/g, ' ');

  // 9) Other markdown noise (headings, blockquotes, inline code, list bullets).
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/[`#>|]/g, ' ');

  // 10) Parentheses/brackets — read math naturally instead of saying "open paren".
  //   (x, y) ordered pairs/coordinates → "x, y, in parentheses"
  t = t.replace(/[([]\s*([^()\[\],]{1,24},[^()\[\]]{1,24}?)\s*[)\]]/g, ' $1, in parentheses, ');
  //   other short asides like (x + 2) → keep the content, just pause around it
  t = t.replace(/[([]\s*([^()\[\]]{1,48}?)\s*[)\]]/g, ', $1, ');
  //   any leftover/nested brackets → a comma pause
  t = t.replace(/\s*[()\[\]]\s*/g, ', ');
  // Leftover emphasis/operator chars (failed *bold*, stray =) → silence — NEVER "times".
  t = t.replace(/[*=]/g, ' ');

  // 10b) Spell isolated CAPITAL letters phonetically. Sarvam's voice renders a bare "A"/"B" so
  //      ambiguously that even a recogniser can't hear it; "Ay"/"Bee"/"See" come through clearly.
  //      Lowercase maths vars (x, y) are pronounced fine, so we leave those alone.
  t = phoneticiseCapitalLetters(t);

  // 11) Tidy whitespace and collapse any doubled/space-before punctuation so pauses land right.
  t = t
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,\s*([.,;:!?])/g, '$1')
    .replace(/(^|[.!?]\s*),\s*/g, '$1')
    .trim();
  return t;
}

function pickVoice(speechLang: string): SpeechSynthesisVoice | undefined {
  return (
    loadVoices().find((vo) => vo.lang === speechLang) ||
    loadVoices().find((vo) => vo.lang.startsWith(speechLang.slice(0, 2)))
  );
}

/**
 * Read `text` aloud in `speechLang`. Strips markdown/LaTeX, then speaks it one short chunk at a
 * time, CHAINED via onend (each chunk starts the next). Chaining — rather than queuing every
 * utterance up front or nudging pause()/resume() — avoids both Chrome's ~15s cutoff and its habit
 * of silently dropping a queued utterance (which sounded like "a line was skipped").
 */
export function speak(text: string, speechLang: string) {
  if (!ttsSupported()) return;
  stopSpeaking(); // bumps speakGen + cancels anything in flight
  const myGen = speakGen;
  const clean = stripForSpeech(text);
  if (!clean) return;
  const v = pickVoice(speechLang);
  const chunks = chunkForSpeech(clean, 160);
  let i = 0;
  const next = () => {
    if (myGen !== speakGen || i >= chunks.length) return;
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    u.lang = speechLang;
    if (v) u.voice = v;
    u.rate = 0.9; // a touch slower so sentence structure is easier to follow
    u.onend = () => {
      if (myGen === speakGen) next();
    };
    u.onerror = () => {
      if (myGen === speakGen) next();
    };
    window.speechSynthesis.speak(u);
  };
  next();
}

/** Speak ONE already-clean chunk and resolve when done — used to recover a failed server chunk
 *  without disturbing the in-flight server sequence (no gen bump, no global cancel). */
function browserSpeakOne(text: string, speechLang: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || gen !== speakGen || !text.trim()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    const v = pickVoice(speechLang);
    if (v) u.voice = v;
    u.rate = 0.9;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  speakGen++; // supersede any in-flight chunked server-TTS playback / chained browser speech
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ---- Server-backed voice (Sarvam/ElevenLabs/Deepgram), with browser fallback ----

let currentAudio: HTMLAudioElement | null = null;
let speakGen = 0; // bumped on every stop/new utterance so stale chunk loops bail out

/** Break clean text into speakable chunks under maxLen, splitting on sentence boundaries. */
function chunkForSpeech(text: string, maxLen = 450): string[] {
  const sentences = text.split(/(?<=[.!?।])\s+/); // include Devanagari danda ।
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > maxLen) {
      chunks.push(cur.trim());
      cur = '';
    }
    if (s.length > maxLen) {
      // A single very long sentence — hard-split on the last space under the limit.
      let rest = s;
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut);
      }
      cur = rest.trim();
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Resolves true if the clip played to the end, false if it errored/failed to play. */
function playToEnd(audio: HTMLAudioElement): Promise<boolean> {
  return new Promise((resolve) => {
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

/**
 * Read aloud via the server TTS chain (good Indic voices). The text is cleaned of markdown/LaTeX
 * FIRST (so it never says "dollar" / "asterisk" / "backslash"), then split into sentence-sized
 * chunks that are synthesised and played in order — so long replies aren't cut off. Falls back to
 * the browser voice if the server returns nothing.
 */
export async function speakSmart(text: string, langCode: string, speechLang: string, apiBase: string) {
  stopSpeaking();
  const myGen = speakGen; // stopSpeaking already bumped it; capture the live generation
  const clean = stripForSpeech(text);
  if (!clean) return;
  const chunks = chunkForSpeech(clean);

  for (let i = 0; i < chunks.length; i++) {
    if (myGen !== speakGen) return; // superseded by a newer utterance / stop
    let ok = false;
    try {
      const res = await fetch(`${apiBase}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i], lang: langCode }),
      });
      const d = await res.json();
      if (myGen !== speakGen) return;
      if (d?.audioBase64) {
        const audio = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.audioBase64}`);
        currentAudio = audio;
        const played = await playToEnd(audio);
        if (myGen !== speakGen) return;
        if (played) {
          ok = true;
        } else {
          // Clip failed to decode/play — re-read THIS chunk with the browser so no line is skipped.
          await browserSpeakOne(chunks[i], speechLang, myGen);
          ok = true;
        }
      }
    } catch {
      /* fall through to browser */
    }
    if (!ok) {
      // Server returned no audio — read the remaining (already-clean) text with the browser voice.
      if (myGen === speakGen) speak(chunks.slice(i).join(' '), speechLang);
      return;
    }
  }
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

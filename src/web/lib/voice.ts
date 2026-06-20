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
    [/×/g, ' times '], // Unicode multiplication sign (U+00D7) — models often emit it literally
    [/÷/g, ' divided by '], // Unicode division sign
    [/·/g, ' times '], // middle dot used as multiply
    [/−/g, ' minus '], // Unicode minus sign (U+2212)
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
  t = t.replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1 times '); // "2x2" / "2 x 2" — x between numbers → times
  // "a x b" / "3 x n" / "n x 2": a SPACE-flanked literal x with at least one LETTER operand → times.
  // Operands are kept atomic (a whole number or a single letter) and spaces are required on BOTH
  // sides, so prose like "the x value", "x and y", or "box x ray" is never mistaken for a product.
  t = t.replace(/(^|[^A-Za-z])([A-Za-z]|\d+)\s+[xX]\s+(\d+|[A-Za-z])(?![A-Za-z])/g, '$1$2 times $3');
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

  // 10c) Structural pauses the voice should HONOUR (done before whitespace is collapsed in step 11):
  //   - paragraph breaks (blank line) → a full sentence stop, so the chunker splits and the voice rests.
  //   - spaced dashes (—, –, --, ----) → a sentence stop too. These are written to "give space", but
  //     a comma is barely honoured by the neural voices; a period makes the chunker split there so the
  //     voice takes a real breath. (Tight hyphens like "top-right" have no surrounding space → untouched.)
  t = t.replace(/\n[ \t]*\n+/g, '. ');
  t = t.replace(/\s*(—|–)\s*/g, '. '); // em/en dash — never part of a word, always a pause
  t = t.replace(/\s+--+\s+/g, '. '); // spaced hyphen-runs ("----") — but not tight hyphens like "top-right"

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
    u.rate = 1.0; // natural speed
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
    u.rate = 1.0;
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

// ---- Server-backed voice (Sarvam/Deepgram), with browser fallback ----

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

export type SpeakSegment = {
  text: string;
  lang: string;       // TTS language code sent to the server
  speechLang: string; // BCP-47 code for browser fallback
  onStart?: () => void; // called just before this segment begins playing
  pauseAfterMs?: number; // extra silence after this segment (default 200) — a beat to let a glow land
  audioUrl?: string; // pre-recorded clip to play INSTEAD of live TTS (fixed strings like the language invites)
};

/**
 * Speak an ordered list of segments, calling each segment's onStart() immediately before it plays.
 * Calls stopSpeaking() once at the top (interrupts any current speech). Bails silently if a newer
 * speech call supersedes this one (same speakGen guard used by speakSmart).
 */
export async function speakSequence(segments: SpeakSegment[], apiBase: string, provider?: string) {
  stopSpeaking();
  const myGen = speakGen;

  // Voice CONSISTENCY: pin ONE provider per language for the whole sequence. Each /tts call would
  // otherwise independently run the server's fallback chain, and under the concurrent prefetch below
  // a transient rate-limit on the primary vendor makes some chunks fall through to a DIFFERENT
  // vendor's voice — which is why "every pop-out item used a different voice". We learn the provider
  // from the first chunk of a language, then force it (strict) for that language's remaining chunks so
  // the voice can't change mid-flow. Different LANGUAGES still get their own best voice (by design).
  const pinnedByLang: Record<string, string | undefined> = {};
  const synth = (text: string, segLang: string): Promise<{ b64: string; mime?: string } | null> => {
    const pin = provider || pinnedByLang[segLang];
    return fetch(`${apiBase}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: segLang, provider: pin, strict: !!pin }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.provider && !provider && !pinnedByLang[segLang]) pinnedByLang[segLang] = d.provider;
        return d?.audioBase64 ? { b64: d.audioBase64 as string, mime: d.mime as string | undefined } : null;
      })
      .catch(() => null);
  };

  // Chunk each LIVE segment. Segments with a pre-recorded `audioUrl` play that fixed clip instead —
  // fixed strings (the language invites) never re-synthesise, so they never vary in voice run-to-run.
  const prepared = segments.map((seg) => ({
    seg,
    chunks: seg.audioUrl ? [] : chunkForSpeech(stripForSpeech(seg.text), 240),
  }));

  // Seed the per-language pin from the FIRST live chunk (awaited) so the concurrent prefetch that
  // follows reuses one voice per language instead of racing the fallback chain. An explicit
  // `provider` (the testing toggle) is already a pin, so seeding is skipped then.
  const seeded = new Map<string, Promise<{ b64: string; mime?: string } | null>>();
  if (!provider) {
    const fi = prepared.findIndex((p) => p.chunks.length > 0);
    if (fi >= 0) {
      seeded.set(`${fi}:0`, Promise.resolve(await synth(prepared[fi].chunks[0], prepared[fi].seg.lang)));
      if (myGen !== speakGen) return;
    }
  }

  // Prefetch all remaining live chunks concurrently (the voice is pinned now), reusing the seed.
  const withAudio = prepared.map((p, pIdx) => ({
    seg: p.seg,
    chunks: p.chunks,
    audio: p.chunks.map((c, cIdx) => seeded.get(`${pIdx}:${cIdx}`) ?? synth(c, p.seg.lang)),
  }));

  for (const { seg, chunks, audio } of withAudio) {
    if (myGen !== speakGen) return;
    seg.onStart?.();

    // Pre-recorded clip: play the fixed file; if it can't load, fall back to live TTS of the text.
    if (seg.audioUrl) {
      const a = new Audio(seg.audioUrl);
      currentAudio = a;
      const played = await playToEnd(a);
      if (myGen !== speakGen) return;
      if (!played) {
        const d = await synth(seg.text, seg.lang);
        if (myGen !== speakGen) return;
        if (d) {
          const fa = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.b64}`);
          currentAudio = fa;
          if (!(await playToEnd(fa))) await browserSpeakOne(stripForSpeech(seg.text), seg.speechLang, myGen);
        } else {
          await browserSpeakOne(stripForSpeech(seg.text), seg.speechLang, myGen);
        }
        if (myGen !== speakGen) return;
      }
      if (myGen === speakGen) await new Promise((r) => setTimeout(r, seg.pauseAfterMs ?? 200));
      continue;
    }

    if (chunks.length === 0) continue;
    for (let i = 0; i < chunks.length; i++) {
      if (myGen !== speakGen) return;
      let ok = false;
      const d = await audio[i];
      if (myGen !== speakGen) return;
      if (d) {
        const a = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.b64}`);
        currentAudio = a;
        const played = await playToEnd(a);
        if (myGen !== speakGen) return;
        if (played) ok = true;
        else { await browserSpeakOne(chunks[i], seg.speechLang, myGen); ok = true; }
      }
      if (!ok) {
        // Server produced nothing for THIS chunk (e.g. the pinned voice transiently rate-limited).
        // Read just this chunk with the browser and keep going, so one miss never drops the rest of
        // the explanation or swaps the whole tail onto a different cloud voice.
        await browserSpeakOne(chunks[i], seg.speechLang, myGen);
        if (myGen !== speakGen) return;
      }
      if (myGen === speakGen && i < chunks.length - 1)
        await new Promise((r) => setTimeout(r, 140));
    }
    if (myGen === speakGen) await new Promise((r) => setTimeout(r, seg.pauseAfterMs ?? 200)); // gap between segments
  }
}

/**
 * Read `text` aloud as ONE continuous clip and fire visual "cues" (e.g. a UI glow) OVERLAID on the
 * playback at the moment each cue's `marker` is spoken — instead of chopping the audio into a clip per
 * marker (which broke the prosody and left an audible gap at every feature). Each cue's time is estimated
 * by its character position in the spoken text × the clip's duration, so the voice never stops while the
 * glows light up in sync. Long text falls back to a few large chunks (so prefetch/Chrome limits still
 * hold) and cues are scheduled within whichever chunk contains them. Browser TTS is the fallback.
 */
export async function speakWithCues(
  text: string,
  cues: { marker: string; fire: () => void }[],
  langCode: string,
  speechLang: string,
  apiBase: string,
  provider?: string
) {
  if (!ttsSupported() && !apiBase) return;
  stopSpeaking();
  const myGen = speakGen;
  const clean = stripForSpeech(text);
  if (!clean) return;
  // Keep it to as few chunks as possible so the prosody stays unbroken (the welcome is short → 1 clip).
  const chunks = chunkForSpeech(clean, 600);
  const spoken = chunks.join(' ');
  const placed = cues
    .map((c) => ({ fire: c.fire, idx: spoken.toLowerCase().indexOf(c.marker.trim().toLowerCase()) }))
    .filter((c) => c.idx >= 0);
  let pinned = provider;
  let charDone = 0;
  for (const chunk of chunks) {
    if (myGen !== speakGen) return;
    const cStart = charDone;
    const cEnd = charDone + chunk.length;
    const here = placed.filter((c) => c.idx >= cStart && c.idx < cEnd);
    let audio: HTMLAudioElement | null = null;
    try {
      const res = await fetch(`${apiBase}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, lang: langCode, provider: pinned, strict: !!pinned }),
      });
      const d = await res.json();
      if (myGen !== speakGen) return;
      if (!pinned && d?.provider) pinned = d.provider;
      if (d?.audioBase64) audio = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.audioBase64}`);
    } catch {
      /* fall through to browser */
    }
    if (audio) {
      currentAudio = audio;
      const timers: ReturnType<typeof setTimeout>[] = [];
      await new Promise<void>((resolve) => {
        const schedule = () => {
          const dur = isFinite(audio!.duration) && audio!.duration > 0 ? audio!.duration : chunk.length / 15;
          for (const c of here) {
            const local = chunk.length ? (c.idx - cStart) / chunk.length : 0;
            timers.push(setTimeout(() => { if (myGen === speakGen) c.fire(); }, Math.max(0, local * dur * 1000)));
          }
        };
        if (audio!.readyState >= 1) schedule();
        else audio!.addEventListener('loadedmetadata', schedule, { once: true });
        audio!.onended = () => resolve();
        audio!.onerror = () => resolve();
        audio!.play().catch(() => resolve());
      });
      timers.forEach(clearTimeout);
      if (myGen !== speakGen) return;
    } else {
      // No server clip — fire this chunk's cues up front and read it with the browser voice.
      for (const c of here) if (myGen === speakGen) c.fire();
      await browserSpeakOne(chunk, speechLang, myGen);
      if (myGen !== speakGen) return;
    }
    charDone += chunk.length + 1; // +1 for the space chunks were join()'d with
  }
}

/**
 * Read aloud via the server TTS chain (good Indic voices). The text is cleaned of markdown/LaTeX
 * FIRST (so it never says "dollar" / "asterisk" / "backslash"), then split into sentence-sized
 * chunks that are synthesised and played in order — so long replies aren't cut off. Falls back to
 * the browser voice if the server returns nothing.
 */
export async function speakSmart(text: string, langCode: string, speechLang: string, apiBase: string, provider?: string) {
  stopSpeaking();
  const myGen = speakGen; // stopSpeaking already bumped it; capture the live generation
  const clean = stripForSpeech(text);
  if (!clean) return;
  // Smaller, ~1–2 sentence chunks: a native voice (Deepgram) reads them cleanly and a
  // dropped chunk can never lose a whole paragraph. Sentence boundaries also give natural pauses.
  const chunks = chunkForSpeech(clean, 240);
  // Pin the provider after the first chunk so every chunk of this reply is the SAME voice (the server
  // would otherwise re-run its fallback chain per chunk and could swap vendors mid-reply).
  let pinned = provider || undefined;

  for (let i = 0; i < chunks.length; i++) {
    if (myGen !== speakGen) return; // superseded by a newer utterance / stop
    let ok = false;
    try {
      const res = await fetch(`${apiBase}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i], lang: langCode, provider: pinned, strict: !!pinned }),
      });
      const d = await res.json();
      if (myGen !== speakGen) return;
      if (!pinned && d?.provider) pinned = d.provider; // lock the voice for the remaining chunks
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
      if (pinned) {
        // A provider is pinned (the voice is otherwise working) but this chunk came back empty — read
        // just this chunk with the browser and continue, so one transient miss neither drops the rest
        // of the reply nor swaps its voice to a different cloud vendor.
        await browserSpeakOne(chunks[i], speechLang, myGen);
        if (myGen !== speakGen) return;
      } else {
        // No cloud voice produced anything at all — read the remaining clean text with the browser.
        if (myGen === speakGen) speak(chunks.slice(i).join(' '), speechLang);
        return;
      }
    }
    // A short rest between chunks so sentences/paragraphs don't run together.
    if (myGen === speakGen && i < chunks.length - 1) await new Promise((r) => setTimeout(r, 140));
  }
}

// Short spoken invitations, each IN its own language, telling the learner how to switch to it.
// Played ONCE per chapter, right before the "say start" gate (see NodeView).
export const LANG_INVITES: Record<string, { lang: string; text: string }> = {
  hi: { lang: 'hi', text: 'हिंदी में सीखने के लिए, ऊपर बीच में दिए गए भाषा बॉक्स पर टैप करें।' },
  pa: { lang: 'pa', text: 'ਪੰਜਾਬੀ ਵਿੱਚ ਸਿੱਖਣ ਲਈ, ਉੱਪਰ ਵਿਚਕਾਰਲੇ ਭਾਸ਼ਾ ਬਾਕਸ ਉੱਤੇ ਟੈਪ ਕਰੋ।' },
  ta: { lang: 'ta', text: 'தமிழில் கற்க, மேலே நடுவில் உள்ள மொழிப் பெட்டியைத் தட்டவும்.' },
  bn: { lang: 'bn', text: 'বাংলায় শিখতে, উপরে মাঝখানের ভাষা বাক্সে ট্যাপ করুন।' },
};

/**
 * After the opening message is read, play a one-time invitation in each Sarvam language (except the
 * one already in use) telling the learner to tap the language box to switch. Chains after the current
 * speech (does NOT bump speakGen), and bails the moment anything new is spoken or stopSpeaking runs.
 */
export async function speakLanguageInvites(apiBase: string, currentLang: string, provider?: string) {
  const myGen = speakGen;
  for (const code of ['hi', 'pa', 'ta', 'bn']) {
    if (code === currentLang) continue;
    if (myGen !== speakGen) return;
    const inv = LANG_INVITES[code];
    try {
      const res = await fetch(`${apiBase}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inv.text, lang: inv.lang, provider }),
      });
      const d = await res.json();
      if (myGen !== speakGen) return;
      if (d?.audioBase64) {
        const audio = new Audio(`data:${d.mime || 'audio/wav'};base64,${d.audioBase64}`);
        currentAudio = audio;
        const played = await playToEnd(audio);
        if (myGen !== speakGen) return;
        if (played) await new Promise((r) => setTimeout(r, 200)); // brief gap between languages
      }
    } catch {
      /* skip a language that fails to synthesise */
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

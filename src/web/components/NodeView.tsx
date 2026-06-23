import { useEffect, useRef, useState } from 'react';
import { MathText } from '../lib/MathText';
import { FormattedExplanation } from '../lib/Explanation';
import Scratchpad, { type ScratchpadHandle } from './Scratchpad';
import EquationComposer from './EquationComposer';
import NodeDetails from './NodeDetails';
import ThinkingIndicator from './ThinkingIndicator';
import RouterPopup, { type RoutePicks } from './RouterPopup';
import { speakSmart, speakSequence, speakWithCues, LANG_INVITES, type SpeakSegment, recordAndTranscribe, stopSpeaking } from '../lib/voice';
import '../styles/NodeView.css';

interface LangOpt {
  code: string;
  name: string;
  native: string;
  speech: string;
}

interface Msg {
  role: 'tutor' | 'learner';
  text?: string;
  image?: string;
  figure?: { url: string; caption: string } | null;
  kind?: 'aside' | 'recap'; // aside = forward-reference heads-up; recap = "previously in this conversation" — neither is a chat bubble
  aside?: { terms: string[]; why: string; later: string } | null; // payload for an 'aside' card (a previewed-but-untaught term)
  streaming?: boolean; // tutor turn still streaming in — don't read it aloud until it finalizes
}
interface Check {
  index: number;
  text: string;
  demonstrated: boolean;
}

// Shown once at the start of a chapter (the "say/type start" gate), before any teaching.
const INTRO_PROMPT =
  'Before we begin: you can learn in English, Hindi, Punjabi, Tamil or Bengali. ' +
  'Set your preferred language using the box at the top of the page. ' +
  'When you are ready, type "start" below — or tap the microphone and say "start".';
// Speech-only: split so the lang-select glows during the language sentence and the mic glows during the start sentence.
const INTRO_LANG_SPEECH =
  'Before we begin: you can learn in English, Hindi, Punjabi, Tamil or Bengali. ' +
  'Set your preferred language using the box at the top of the page.';
const INTRO_MIC_SPEECH = 'When you are ready, type "start" below — or tap the microphone and say "start".';

// Shown in the chat when a request fails (server returns systemError, an HTTP error, or the network
// drops). We never fabricate a tutor reply — we say plainly the app is down and it's been logged.
const SERVICE_DOWN_TEXT =
  "⚠️ Sorry — I can't reach the tutor right now, so I can't reply properly. This has been logged automatically and the admin has been notified. Please wait a little and try again.";

// UI elements we glow one-at-a-time as the tutor's welcome mentions them aloud.
type HiTarget = 'lang' | 'mic' | 'details' | 'scratchpad' | 'attach' | 'helpme' | 'readaloud' | 'qr';

// Bold tokens in the welcome message → the tool each one points at. Matched as **token** in the text.
const WELCOME_TOOLS: { token: string; target: HiTarget }[] = [
  { token: 'Details', target: 'details' },
  { token: 'scratchpad', target: 'scratchpad' },
  { token: '📷 scan', target: 'qr' },
  { token: 'Attach', target: 'attach' },
  { token: 'Help me', target: 'helpme' },
  { token: '🎤 speak', target: 'mic' },
  { token: 'read aloud', target: 'readaloud' },
];

// The welcome message is the only one that walks through the tools (it bolds **Details** and **scratchpad**).
const isWelcomeMessage = (text?: string) =>
  !!text && text.includes('**Details**') && text.includes('**scratchpad**');

function slotLabel(slot?: string, answerType?: string): string {
  if (slot === 'sketch1' || slot === 'sketch2' || answerType === 'sketch') return 'draw it';
  if (slot === 'explain' || answerType === 'written') return 'explain in words';
  if (slot === 'mcq' || answerType === 'mcq') return 'multiple choice';
  if (slot === 'equation' || answerType === 'symbolic') return 'solve it';
  return 'check';
}

export default function NodeView({
  learnerId,
  conceptId,
  onBack,
  apiBase,
}: {
  learnerId: string;
  conceptId: string;
  onBack: () => void;
  apiBase: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [checklist, setChecklist] = useState<Check[]>([]);
  const [readyForGate, setReadyForGate] = useState(false);
  const [busy, setBusy] = useState(true);
  const [input, setInput] = useState('');
  const [awaitingStart, setAwaitingStart] = useState(false); // chapter-intro "say/type start" gate is open
  // Which UI element to glow as it's mentioned aloud, plus the bold word in the chat to glow with it.
  const [highlight, setHighlight] = useState<{ target: HiTarget; word: string } | null>(null);
  const [glowPadKeyword, setGlowPadKeyword] = useState(false); // scratchpad glow from tutor message keywords
  const [showEq, setShowEq] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showCloseup, setShowCloseup] = useState(false); // the lesson-complete "close-up" material popout bubble

  const [gate, setGate] = useState<any>(null);
  const glowPad = gate?.answerType === 'sketch' || glowPadKeyword || highlight?.target === 'scratchpad';
  const [gateAnswer, setGateAnswer] = useState('');
  const [gateFeedback, setGateFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  // After a CORRECT check we never auto-advance — the student reads the feedback for as long as they like,
  // then taps "Move on →" (or "Finish →" on the last check). null = this check not yet cleared (show Submit).
  const [gateCleared, setGateCleared] = useState<{ allPassed: boolean; message?: string } | null>(null);
  // The "close-up of the material" recap shown between the dialogue and the checks (concept title + plain
  // words + the material to re-read). Fetched lazily once the lesson is ready for its checks.
  const [recap, setRecap] = useState<{ title: string; brief: string; explanation: string } | null>(null);

  const [langs, setLangs] = useState<LangOpt[]>([]);
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
  const [listening, setListening] = useState(false);
  const [autoRead, setAutoRead] = useState<boolean>(() => localStorage.getItem('autoRead') !== '0'); // default ON
  // Voice provider override (testing): '' = auto by language (English→Deepgram, Indic→Sarvam).
  const [ttsProvider, setTtsProvider] = useState<string>(() => localStorage.getItem('ttsProvider') || '');
  const [showLangPrompt, setShowLangPrompt] = useState(false);
  const stopListenRef = useRef<(() => void) | null>(null);
  // Where a dictation result should land: the chat reply box, or the active check's answer box. Set
  // when the mic is started so the transcript callback (which closes over stale state) routes correctly.
  const micTarget = useRef<'chat' | 'gate'>('chat');
  const spokenCount = useRef(0);
  const heldOpening = useRef<string | null>(null); // chapter-intro gate: teaching message held until "start"

  const scroller = useRef<HTMLDivElement>(null);
  const padRef = useRef<ScratchpadHandle>(null);
  const base = `${apiBase}/learner/${learnerId}/node/${conceptId}`;
  // NIM speed-router popup: probe + pick the session's tutor model on node entry ('start') and after a
  // tutor failure ('failure'). Holds the lesson until it resolves. retryRef re-runs the failed action.
  const [routePopup, setRoutePopup] = useState<{ mode: 'start' | 'failure'; failedModel?: string } | null>({ mode: 'start' });
  const retryRef = useRef<(() => void) | null>(null);
  const routeFails = useRef(0);
  // Set true in the popup's onDone when the popup we're closing was a mid-lesson FAILURE recovery — so the
  // node-open effect, which re-runs when routePopup clears, skips re-opening the node (which would wipe the
  // live conversation). Recovery is resumed by retryRef instead. Consumed (reset) on the next effect run.
  const skipOpenOnce = useRef(false);
  // This session's probed model picks live in the BROWSER (the source of truth): cached in localStorage and
  // sent on every turn as `models`, so any api instance can serve the turn without a shared server store.
  // The router popup refreshes them at node entry and after a failure; the server re-validates before use.
  const PICKS_KEY = `nimPicks:${learnerId}`;
  const picksRef = useRef<RoutePicks | null>(null);
  const picksLoaded = useRef(false);
  if (!picksLoaded.current) {
    picksLoaded.current = true;
    try { picksRef.current = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null'); } catch { picksRef.current = null; }
  }
  const withModels = (body: Record<string, unknown>) => (picksRef.current ? { ...body, models: picksRef.current } : body);
  const speechCode = langs.find((l) => l.code === lang)?.speech || 'en-IN';

  useEffect(() => {
    fetch(`${apiBase}/languages`)
      .then((r) => r.json())
      .then((d) => setLangs(d.languages || []))
      .catch(() => setLangs([]));
  }, [apiBase]);

  const changeLang = (code: string) => {
    setLang(code);
    localStorage.setItem('lang', code);
  };

  // langOverride avoids the stale-closure bug: when chosen from the popup, the lang state hasn't
  // updated yet this render, so we pass the picked code explicitly.
  const startRecording = async (langOverride?: string) => {
    const lc = langOverride || lang;
    const sc = langs.find((l) => l.code === lc)?.speech || 'en-IN';
    setListening(true);
    stopListenRef.current = await recordAndTranscribe(
      lc,
      sc,
      apiBase,
      (text) => (micTarget.current === 'gate' ? setGateAnswer(text) : setInput(text)),
      () => setListening(false)
    );
  };

  const toggleMic = (target: 'chat' | 'gate' = 'chat') => {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    micTarget.current = target;
    // First-ever mic use → ask which language to speak/learn in (saved for all future calls).
    if (!localStorage.getItem('micLangAsked')) {
      setShowLangPrompt(true);
      return;
    }
    startRecording();
  };

  // Open the node: probe-gated `/start` → opening/continue turn (replays prior history; held behind the
  // chapter-intro "say start" gate on the first fresh node of a chapter). Called when the start popup is
  // dismissed, on language change, and as the retry after a `/start` failure. A mid-lesson tutor failure
  // does NOT call this — retryRef re-runs the failed action — so a recovery never wipes the conversation.
  const openNode = async (signal?: { cancelled: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withModels({ lang })),
      }).catch(() => null);
      if (signal?.cancelled) return;
      if (!res || !res.ok) {
        if (routeFails.current++ < 3) { retryRef.current = () => openNode(); setRoutePopup({ mode: 'failure' }); return; }
        setMessages([{ role: 'tutor', text: SERVICE_DOWN_TEXT }]);
        setAwaitingStart(false);
        return;
      }
      const data = await res.json().catch(() => ({} as any));
      if (signal?.cancelled) return;
      if (data.systemError) {
        if (routeFails.current++ < 3) { retryRef.current = () => openNode(); setRoutePopup({ mode: 'failure', failedModel: data.failedModel }); return; }
        setMessages([{ role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
        setAwaitingStart(false);
        return;
      }
      routeFails.current = 0; // healthy start — reset the failure counter
      // On a return, show a concise "Previously in this conversation" recap card (matches the IE app)
      // rather than replaying the whole transcript. (Fallback to the old replay only if an as-yet-
      // un-redeployed server still sends `history` instead of `resume` — harmless during the deploy window.)
      const recap: Msg | null = data.resume ? { role: 'tutor', kind: 'recap', text: data.resume } : null;
      const history: Msg[] =
        !recap && data.history
          ? (data.history as { role: 'tutor' | 'learner'; text: string }[]).map((h) => ({ role: h.role, text: h.text }))
          : [];
      const hasPrior = !!recap || history.length > 0;
      // Chapter-intro gate: the first fresh node opened in a chapter (this session) holds the teaching
      // message behind a language + "say/type start" gate. The flag is only committed once they start,
      // so changing language mid-gate (which re-opens the node) keeps the gate up.
      const gateKey = 'chapGate:' + conceptId.split(':').slice(0, -1).join(':');
      if (!hasPrior && !sessionStorage.getItem(gateKey)) {
        heldOpening.current = data.message;
        setMessages([{ role: 'tutor', text: INTRO_PROMPT }]);
        spokenCount.current = 1; // the gate effect voices this — keep the message effect off it
        setAwaitingStart(true);
      } else {
        // Re-entry recap first (if any), then the opening — so the opening has a visible antecedent.
        setMessages([...(recap ? [recap] : history), { role: 'tutor', text: data.message }]);
        // Don't auto-read the recap card or a replayed transcript — only the new opening line.
        spokenCount.current = recap ? 0 : history.length;
        setAwaitingStart(false);
      }
      setChecklist(data.checklist ?? []);
      setReadyForGate(!!data.readyForGate);
    } finally {
      if (!signal?.cancelled) setBusy(false);
    }
  };

  // Node entry: open the node on mount and whenever the node or language changes — but HOLD on mount until
  // the initial "finding your fastest tutor" popup is dismissed (its onDone clears routePopup, re-running
  // this effect, which then opens). A FAILURE popup also clears routePopup here, but skipOpenOnce (set in
  // onDone) makes us skip the re-open so the live conversation survives — retryRef resumes instead.
  useEffect(() => {
    if (routePopup) return; // hold while any router popup (start or failure) is on screen
    if (skipOpenOnce.current) { skipOpenOnce.current = false; return; } // failure recovery — don't re-open
    const signal = { cancelled: false };
    void openNode(signal);
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, lang, routePopup]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Once the lesson is ready for its checks, fetch the concept material for the recap "close-up" card so the
  // hand-off from dialogue to checks is a deliberate review step, not an abrupt jump. Fetched once.
  useEffect(() => {
    if (!readyForGate || gate || done || recap) return;
    let cancelled = false;
    fetch(`${base}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.concept)
          setRecap({ title: d.concept.title ?? '', brief: d.concept.brief ?? '', explanation: d.concept.explanation ?? '' });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [readyForGate, gate, done, recap, base]);

  // Leaving the node (unmount): cut any read-aloud that's still playing so it doesn't follow us out.
  useEffect(() => () => stopSpeaking(), []);

  // Esc closes the "close-up of the material" popout bubble.
  useEffect(() => {
    if (!showCloseup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCloseup(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCloseup]);

  // Glow the scratchpad for 4 s when the tutor mentions sketch / scratchpad / help me mid-lesson.
  // The welcome message is excluded — its tool mentions are glowed in sync with the read-aloud below.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'tutor' || !last.text || isWelcomeMessage(last.text)) return;
    const t = last.text.toLowerCase();
    if (t.includes('scratchpad') || t.includes('sketch') || t.includes('help me')) {
      setGlowPadKeyword(true);
      const timer = setTimeout(() => setGlowPadKeyword(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // Split the welcome message into segments so the tool it mentions glows (word + button) exactly as
  // it's spoken: a clearing lead-in, then one segment per tool (first mention only), each holding a beat.
  // Welcome read-aloud cues: each tool's bold mention → a glow that fires the moment its word is spoken,
  // OVERLAID on one continuous clip (no per-tool segments/gaps — see speakWithCues). `marker` is the
  // spoken word (emoji stripped) so it can be located in the synthesized text to time the glow.
  const buildWelcomeCues = (text: string) =>
    WELCOME_TOOLS
      .map((t) => ({ idx: text.indexOf('**' + t.token + '**'), target: t.target, token: t.token }))
      .filter((c) => c.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .map((c) => ({
        marker: c.token.replace(/[^\x20-\x7E]/g, '').trim(), // drop the leading emoji → the spoken word
        fire: () => setHighlight({ target: c.target, word: c.token }),
      }));

  // Global read-aloud: when on, speak each NEW tutor message via the server voice chain. The welcome
  // message is read as a glow-synced sequence; everything else is read straight through.
  useEffect(() => {
    if (!autoRead) {
      spokenCount.current = messages.length;
      return;
    }
    let i = spokenCount.current;
    for (; i < messages.length; i++) {
      const m = messages[i];
      // A still-streaming tutor turn isn't final yet — stop here (don't advance the watermark past it),
      // so it gets read ONCE when it finalizes, not partial-then-again.
      if (m.role === 'tutor' && m.streaming) break;
      if (m.role !== 'tutor' || !m.text || m.kind === 'recap') continue; // recap card is read silently
      if (isWelcomeMessage(m.text)) {
        setHighlight(null);
        void speakWithCues(m.text, buildWelcomeCues(m.text), lang, speechCode, apiBase, ttsProvider || undefined).then(() => setHighlight(null));
      } else {
        speakSmart(m.text, lang, speechCode, apiBase, ttsProvider || undefined);
      }
    }
    spokenCount.current = i;
  }, [messages, autoRead, speechCode, ttsProvider]);

  // Chapter-intro gate: play the language invites (each in its own language, lang-select glows),
  // then the "set language" sentence (still lang-select), then the mic sentence (mic glows).
  // Re-fires when language or voice settings change while the gate is still up.
  useEffect(() => {
    if (!awaitingStart || !autoRead) return;
    // The language menu is a set of FIXED strings, each in its own language. We play PRE-RECORDED
    // clips for them (one consistent voice per language, no per-run TTS variance), with a graceful
    // fall back to live TTS inside speakSequence if a clip is missing. Once the learner picks a
    // language, the lesson itself continues live in that single chosen language/voice.
    const langInviteSegments: SpeakSegment[] = (['hi', 'pa', 'ta', 'bn'] as const)
      .filter((code) => code !== lang)
      .map((code) => ({
        text: LANG_INVITES[code].text,
        lang: LANG_INVITES[code].lang,
        speechLang: LANG_INVITES[code].lang + '-IN',
        audioUrl: `/audio/invites/${code}.wav`,
        onStart: () => setHighlight({ target: 'lang', word: '' }),
      }));
    const segments: SpeakSegment[] = [
      ...langInviteSegments,
      { text: INTRO_LANG_SPEECH, lang, speechLang: speechCode, onStart: () => setHighlight({ target: 'lang', word: '' }) },
      { text: INTRO_MIC_SPEECH, lang, speechLang: speechCode, onStart: () => setHighlight({ target: 'mic', word: '' }) },
    ];
    void speakSequence(segments, apiBase, ttsProvider || undefined);
    return () => { stopSpeaking(); setHighlight(null); };
  }, [awaitingStart, autoRead, lang, speechCode, ttsProvider]);

  // Chapter-intro gate: "start" reveals the held teaching message; anything else gently re-prompts.
  const beginLesson = (saidText: string) => {
    setAwaitingStart(false);
    stopSpeaking(); // cut the language options if they're still playing
    sessionStorage.setItem('chapGate:' + conceptId.split(':').slice(0, -1).join(':'), '1');
    const opening = heldOpening.current ?? '';
    heldOpening.current = null;
    setMessages((m) => [...m, { role: 'learner', text: saidText }, { role: 'tutor', text: opening }]);
  };

  const send = async (retryText?: string) => {
    const text = (retryText ?? input).trim();
    if (!text || busy) return;
    stopSpeaking(); // a reply means they're moving on — cut any read-aloud still playing
    setHighlight(null);
    if (awaitingStart) {
      setInput('');
      if (/start/i.test(text)) beginLesson(text);
      else
        setMessages((m) => [
          ...m,
          { role: 'learner', text },
          { role: 'tutor', text: 'Whenever you are ready, just type "start" — or tap the glowing mic and say it.' },
        ]);
      return;
    }
    if (!retryText) { setInput(''); setShowEq(false); setMessages((m) => [...m, { role: 'learner', text }]); }
    setBusy(true);

    // Update the in-flight streaming tutor bubble (creating it on the first delta); keep `streaming`
    // true so read-aloud waits for the final text.
    const setStreamingText = (t: string) =>
      setMessages((m) => {
        const c = [...m];
        for (let i = c.length - 1; i >= 0; i--) {
          if (c[i].role === 'tutor' && c[i].streaming) {
            c[i] = { ...c[i], text: t };
            return c;
          }
        }
        return [...c, { role: 'tutor', text: t, streaming: true }];
      });
    // Replace the streaming bubble with the authoritative final turn (or append one if nothing streamed).
    const finalizeTutor = (t: string, figure?: { url: string; caption: string } | null) =>
      setMessages((m) => {
        const c = [...m];
        for (let i = c.length - 1; i >= 0; i--) {
          if (c[i].role === 'tutor' && c[i].streaming) {
            c[i] = { role: 'tutor', text: t, figure: figure ?? null };
            return c;
          }
        }
        return [...c, { role: 'tutor', text: t, figure: figure ?? null }];
      });
    // Forward-reference heads-up: if the turn named a previewed-but-untaught term, drop a quiet aside card
    // right after the tutor bubble (a separate, non-bubble note — see the 'aside' render branch below).
    const pushAside = (d: { aside?: { terms: string[]; why: string; later: string } | null } | null | undefined) => {
      const a = d?.aside;
      if (a && Array.isArray(a.terms) && a.terms.length) {
        setMessages((c) => [...c, { role: 'tutor', kind: 'aside', aside: a }]);
      }
    };
    const applyProgress = (data: any) => {
      // Don't overwrite progress on a failed/unavailable turn (no real checklist came back).
      if (data && data.message && !data.systemError) {
        setChecklist(data.checklist ?? []);
        setReadyForGate(!!data.readyForGate);
      }
    };

    try {
      const res = await fetch(`${base}/reply-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withModels({ message: text, lang })),
      });
      if (!res.ok || !res.body) throw new Error('stream unavailable');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalData: any = null;
      let gotDelta = false;
      let lastStreamText = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let event = 'message';
          let dataStr = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (event === 'delta') {
            gotDelta = true;
            lastStreamText = payload.message ?? '';
            setStreamingText(lastStreamText);
          } else if (event === 'done') {
            finalData = payload;
          } else if (event === 'error') {
            throw new Error('server error');
          }
        }
      }
      if (finalData) {
        if (finalData.systemError) {
          // tutor model died mid-session → drop the failed bubble, pop the router to re-probe + retry
          setMessages((m) => { const c = [...m]; for (let i = c.length - 1; i >= 0; i--) { if (c[i].role === 'tutor' && c[i].streaming) { c.splice(i, 1); break; } } return c; });
          retryRef.current = () => send(text);
          if (routeFails.current++ < 3) setRoutePopup({ mode: 'failure', failedModel: finalData.failedModel });
          else finalizeTutor(SERVICE_DOWN_TEXT);
          return;
        }
        routeFails.current = 0;
        finalizeTutor(finalData.message || SERVICE_DOWN_TEXT, finalData.figure);
        pushAside(finalData);
        applyProgress(finalData);
      } else if (gotDelta) {
        // Stream cut after content arrived — the turn was already produced server-side, so don't
        // re-send (that would duplicate it). Keep what streamed in.
        finalizeTutor(lastStreamText || SERVICE_DOWN_TEXT);
      } else {
        throw new Error('no stream output'); // nothing came through → fall back to /reply below
      }
    } catch {
      // Streaming unavailable (older server, proxy buffering, immediate network fail) — fall back to
      // the plain /reply turn. Only reached when no usable content streamed, so no duplicate turn.
      try {
        const res = await fetch(`${base}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withModels({ message: text, lang })),
        });
        const data = await res.json().catch(() => ({} as any));
        const text2 = data.message || (res.ok ? null : SERVICE_DOWN_TEXT);
        finalizeTutor(text2 ?? SERVICE_DOWN_TEXT, data.figure);
        if (res.ok) { pushAside(data); applyProgress(data); }
      } catch {
        finalizeTutor(SERVICE_DOWN_TEXT);
      }
    } finally {
      setBusy(false);
    }
  };

  const sketchHelp = async (img: string) => {
    if (busy) return;
    stopSpeaking();
    setHighlight(null);
    setMessages((m) => [...m, { role: 'learner', image: img, text: 'Here is my working — can you help?' }]);
    setBusy(true);
    try {
      const res = await fetch(`${base}/help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withModels({ image: img, lang })),
      });
      const data = await res.json().catch(() => ({} as any));
      if (data.systemError) {
        // vision model died → re-probe via the router popup and retry the hint.
        retryRef.current = () => sketchHelp(img);
        if (routeFails.current++ < 3) setRoutePopup({ mode: 'failure', failedModel: data.failedModel });
        else setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
        return;
      }
      routeFails.current = 0;
      setMessages((m) => [...m, { role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
    } catch {
      setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
    } finally {
      setBusy(false);
    }
  };

  const sketchSend = async (img: string) => {
    if (busy) return;
    // On a sketch CHECK, "Send" submits the drawing as the answer (same as the check's Submit button) —
    // otherwise the Send button does nothing useful while a check is open.
    if (gate && gate.answerType === 'sketch') {
      await submitGate(img);
      return;
    }
    // Teaching: route the drawing through the VISION path so the tutor actually SEES it. The chat /reply
    // turn is text-only, so posting just a text note made the tutor reply "I can't see your scratchpad".
    stopSpeaking();
    setHighlight(null);
    setMessages((m) => [...m, { role: 'learner', image: img, text: 'Here is my working.' }]);
    setBusy(true);
    try {
      const res = await fetch(`${base}/help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withModels({ image: img, lang })),
      });
      const data = await res.json().catch(() => ({} as any));
      if (data.systemError) {
        retryRef.current = () => sketchSend(img);
        if (routeFails.current++ < 3) setRoutePopup({ mode: 'failure', failedModel: data.failedModel });
        else setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
        return;
      }
      routeFails.current = 0;
      setMessages((m) => [...m, { role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
    } catch {
      setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
    } finally {
      setBusy(false);
    }
  };

  // Last check cleared → the student taps "Finish": append the closing tutor message and mark the node done.
  const finishNode = () => {
    if (gateCleared?.message) setMessages((m) => [...m, { role: 'tutor', text: gateCleared.message! }]);
    setGate(null);
    setGateCleared(null);
    setDone(true);
  };

  const poseNextGate = async () => {
    setBusy(true);
    setGateFeedback(null);
    setGateCleared(null);
    setGateAnswer('');
    try {
      const res = await fetch(`${base}/gate`, { method: 'POST' });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setGateFeedback({ ok: false, text: data.message || SERVICE_DOWN_TEXT });
      } else if (data.allPassed) {
        setDone(true);
        setGate(null);
      } else {
        setGate(data);
      }
    } catch {
      setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
    } finally {
      setBusy(false);
    }
  };

  const submitGate = async (overrideImg?: string) => {
    if (busy || !gate) return;
    let answer = gateAnswer.trim();
    if (gate.answerType === 'sketch') {
      const img = overrideImg ?? padRef.current?.exportJpeg();
      if (!img) return;
      answer = img;
    } else if (!answer) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${base}/gate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withModels({ gateId: gate.gateId, answer, lang })),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok && !data.feedback && !data.message) {
        setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
        return;
      }
      if (data.systemError) {
        // grader (vision→text or text) model died → re-probe via the router popup and retry the same gate.
        retryRef.current = () => submitGate();
        if (routeFails.current++ < 3) setRoutePopup({ mode: 'failure', failedModel: data.failedModel });
        else setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
        return;
      }
      routeFails.current = 0;
      setGateFeedback({ ok: !!data.correct, text: data.feedback || data.message || SERVICE_DOWN_TEXT });
      if (data.correct) {
        // Cleared this check. Do NOT auto-advance — let the student read the feedback for as long as they
        // like, then tap "Move on →" (next check) or "Finish →" (last check). poseNextGate/finishNode reset.
        setGateCleared({ allPassed: !!data.allPassed, message: data.message });
      }
      // incorrect → keep the same gate, feedback shown, allow retry
    } catch {
      setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
    } finally {
      setBusy(false);
    }
  };

  const shown = checklist.filter((c) => c.demonstrated).length;

  // The "Listening… speak now" overlay, shared by the chat reply box and the check answer box (they're
  // mutually exclusive, so only one host ever mounts it). It fills its positioned host (.reply-box /
  // .gate-card, both position:relative) via .recording-overlay { position:absolute; inset:0 }.
  const recordingOverlay = listening ? (
    <div className="recording-overlay" onClick={() => toggleMic()} role="button" tabIndex={0}>
      <div className="recording-card" onClick={(e) => e.stopPropagation()}>
        <div className="recording-pulse">
          <span className="recording-ring" />
          <span className="recording-mic">🎤</span>
        </div>
        <div className="recording-copy">
          <div className="recording-title">Listening… speak now</div>
          <p className="recording-sub">
            Your voice is turning into text. Tap below when you're done — your words
            will appear in the box so you can read them before you submit.
          </p>
          <button className="recording-stop" onClick={() => toggleMic()}>⏹ Tap to stop &amp; see my text</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="tutor-shell">
      {routePopup && (
        <RouterPopup
          apiBase={apiBase}
          learnerId={learnerId}
          mode={routePopup.mode}
          failedModel={routePopup.failedModel}
          onDone={(picks) => {
            if (picks) {
              picksRef.current = { ...picksRef.current, ...picks };
              try { localStorage.setItem(PICKS_KEY, JSON.stringify(picksRef.current)); } catch { /* private mode */ }
            }
            // A failure popup's dismissal must NOT re-open the node (that wipes the conversation) — the
            // retry resumes exactly where we left off. A start popup's dismissal DOES open the node (no
            // retry set), via the node-entry effect that re-runs when routePopup clears.
            if (routePopup?.mode === 'failure') skipOpenOnce.current = true;
            const r = retryRef.current; retryRef.current = null; setRoutePopup(null); if (r) r();
          }}
        />
      )}
      <div className="tutor-topbar">
        <button className="back-btn" onClick={onBack}>← Chapter</button>
        <div className="checklist-strip" title="Key ideas shown">
          {checklist.map((c) => (
            <span key={c.index} className={c.demonstrated ? 'chip done' : 'chip'} title={c.text} />
          ))}
          <span className="checklist-count">{shown}/{checklist.length} ideas</span>
        </div>
        {langs.length > 0 && (
          <select
            className={`lang-select${highlight?.target === 'lang' ? ' glow' : ''}`}
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            title="Teach, speak & type in this language"
          >
            {langs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        )}
        <button className={`details-btn${highlight?.target === 'details' ? ' glow' : ''}`} onClick={() => setShowDetails(true)}>ⓘ Details</button>
      </div>

      <div className="tutor-grid">
        {/* Chat pane */}
        <section className="chat-pane">
          <div className="chat-scroll" ref={scroller}>
            {messages.map((m, i) =>
              m.kind === 'recap' ? (
                <div key={i} className="recap-card">
                  <div className="recap-label">Previously in this conversation</div>
                  <div className="recap-body">{m.text && <MathText>{m.text}</MathText>}</div>
                </div>
              ) : m.kind === 'aside' ? (
                <div key={i} className="aside-card">
                  <div className="aside-emoji">🌱</div>
                  <div className="aside-body">
                    <div className="aside-lead">hey champ — quick heads up, no stress:</div>
                    {m.aside?.terms?.length ? (
                      <div className="aside-terms">
                        {m.aside.terms.map((t, k) => (
                          <span key={k} className="aside-chip"><MathText>{t}</MathText></span>
                        ))}
                      </div>
                    ) : null}
                    <div className="aside-text">
                      {m.aside?.why && <MathText>{m.aside.why}</MathText>}{' '}
                      {m.aside?.later && (
                        <strong><MathText>{m.aside.later}</MathText></strong>
                      )}{' '}
                      you've got this. 💪
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} className={`bubble ${m.role}`}>
                  <div className="bubble-label">{m.role === 'tutor' ? 'Tutor' : 'You'}</div>
                  <div className="bubble-text">
                    {m.image && <img className="bubble-img" src={m.image} alt="handwritten working" />}
                    {m.text && (
                      <MathText glowWord={isWelcomeMessage(m.text) ? highlight?.word || undefined : undefined}>
                        {m.text}
                      </MathText>
                    )}
                    {m.figure && (
                      <figure className="tutor-figure">
                        <img src={`${apiBase}/${m.figure.url}`} alt={m.figure.caption} loading="lazy" />
                        <figcaption>📖 {m.figure.caption}</figcaption>
                      </figure>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && !messages[messages.length - 1]?.streaming && <ThinkingIndicator />}

            {done && (
              <div className="node-done">
                ✓ Concept passed.{' '}
                <button className="link-btn" onClick={onBack}>Back to the chapter map →</button>
              </div>
            )}

            {!done && readyForGate && !gate && (
              <div className="lesson-recap">
                <div className="recap-badge">✓ Lesson complete — {shown}/{checklist.length} key ideas shown</div>
                {recap?.title && <h3 className="recap-title">{recap.title}</h3>}
                {recap?.brief && <p className="recap-brief">{recap.brief}</p>}
                {recap?.explanation && (
                  <button className="recap-closeup-btn" onClick={() => setShowCloseup(true)}>
                    <span className="recap-closeup-icon" aria-hidden="true">📖</span>
                    <span className="recap-closeup-text">
                      <span className="recap-closeup-label">A close-up of the material</span>
                      <span className="recap-closeup-hint">The whole idea, broken into steps — tap to open it up</span>
                    </span>
                    <span className="recap-closeup-arrow" aria-hidden="true">⤢</span>
                  </button>
                )}
                <p className="recap-lead">
                  Open the close-up above for the full breakdown — and scroll up through our chat if you'd like.
                  When you're ready, take your checks. There's no rush, and you can take them one at a time.
                </p>
                <button className="btn-primary" onClick={poseNextGate}>Continue to the checks →</button>
              </div>
            )}

            {gate && (
              <div className="gate-card">
                {recordingOverlay}
                <div className="gate-progress">
                  Check {gate.index} of {gate.total} · <span className="gate-slot">{slotLabel(gate.slot, gate.answerType)}</span>
                </div>
                <div className="gate-q"><MathText>{gate.prompt}</MathText></div>

                {gate.answerType === 'mcq' && gate.options && (
                  <div className="gate-opts">
                    {gate.options.map((o: string, i: number) => (
                      <label key={i} className={gateAnswer === o ? 'gate-opt sel' : 'gate-opt'}>
                        <input type="radio" name="g" value={o} checked={gateAnswer === o} disabled={!!gateCleared} onChange={(e) => setGateAnswer(e.target.value)} />
                        <MathText>{o}</MathText>
                      </label>
                    ))}
                  </div>
                )}

                {gate.answerType === 'symbolic' && (
                  <input
                    className="gate-input"
                    placeholder="Type your answer, e.g. 2^3 * 3^2 * 5"
                    value={gateAnswer}
                    disabled={!!gateCleared}
                    onChange={(e) => setGateAnswer(e.target.value)}
                  />
                )}

                {gate.answerType === 'written' && (
                  <>
                    <textarea
                      className="gate-textarea"
                      placeholder="Write your explanation in full…"
                      value={gateAnswer}
                      disabled={!!gateCleared}
                      onChange={(e) => setGateAnswer(e.target.value)}
                    />
                    {!gateCleared && (
                      <div className="gate-dictate">
                        <button
                          className={`notation-btn mic${listening ? ' listening' : ''}`}
                          onClick={() => toggleMic('gate')}
                          disabled={busy}
                          title={listening ? 'Tap to stop and turn your speech into text' : `Speak your answer instead of typing (${langs.find((l) => l.code === lang)?.native || 'English'})`}
                        >
                          {listening ? '⏹ Tap to stop' : '🎤 Speak your answer'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {gate.answerType === 'sketch' && (
                  <div className="gate-sketch-note">✏️ Draw your answer on the scratchpad (right), then submit — the tutor will look at it.</div>
                )}

                {gateFeedback && (
                  <div className={gateFeedback.ok ? 'gate-fb ok' : 'gate-fb no'}>
                    <MathText>{gateFeedback.text}</MathText>
                  </div>
                )}

                {gateCleared ? (
                  <button className="btn-primary sm move-on" onClick={gateCleared.allPassed ? finishNode : poseNextGate}>
                    {gateCleared.allPassed ? 'Finish →' : 'Move on →'}
                  </button>
                ) : (
                  <button className="btn-primary sm" onClick={() => submitGate()} disabled={busy}>
                    {gate.answerType === 'sketch' ? 'Submit drawing' : 'Submit'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Reply box */}
          {!gate && !done && (
            <div className="reply-box">
              {recordingOverlay}
              {showEq && (
                <EquationComposer
                  onInsert={(t) => setInput((v) => (v ? `${v} ${t}` : t))}
                  onClose={() => setShowEq(false)}
                />
              )}
              <div className="reply-row">
                <textarea
                  placeholder="Type your reply…  (use ∑ for maths)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={busy}
                />
                <div className="reply-actions">
                  <button
                    className={`notation-btn read${autoRead ? ' on' : ''}${highlight?.target === 'readaloud' ? ' glow' : ''}`}
                    onClick={() => {
                      const next = !autoRead;
                      setAutoRead(next);
                      localStorage.setItem('autoRead', next ? '1' : '0');
                      if (!next) stopSpeaking();
                    }}
                    title="Read every reply aloud automatically"
                  >
                    {autoRead ? '🔊 Read aloud: on' : '🔈 Read aloud: off'}
                  </button>
                  {/* Voice provider — testing toggle. Auto picks the best per language. */}
                  <select
                    className="tts-provider"
                    value={ttsProvider}
                    onChange={(e) => { setTtsProvider(e.target.value); localStorage.setItem('ttsProvider', e.target.value); }}
                    title="Voice engine (testing). Auto = Deepgram for English, Sarvam for Indian languages."
                  >
                    <option value="">Voice: Auto</option>
                    <option value="deepgram">Deepgram</option>
                    <option value="sarvam">Sarvam</option>
                  </select>
                  <button
                    className={`notation-btn mic${listening ? ' listening' : ''}${highlight?.target === 'mic' ? ' glow' : ''}`}
                    onClick={() => toggleMic()}
                    title={listening ? 'Tap to stop and turn your speech into text' : `Speak your answer (${langs.find((l) => l.code === lang)?.native || 'English'})`}
                  >
                    {listening ? '⏹ Tap to stop' : '🎤 Speak'}
                  </button>
                  <button className="notation-btn" onClick={() => setShowEq((s) => !s)} title="Insert equation">∑ Math</button>
                  <button className="btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>Send</button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Scratchpad pane */}
        <section className="pad-pane">
          <Scratchpad
            ref={padRef}
            apiBase={apiBase}
            onAttach={sketchSend}
            onSend={sketchSend}
            onHelp={sketchHelp}
            className={glowPad ? 'glow' : undefined}
            highlight={
              highlight?.target === 'attach'
                ? 'attach'
                : highlight?.target === 'helpme'
                  ? 'helpme'
                  : highlight?.target === 'qr'
                    ? 'qr'
                    : null
            }
          />
        </section>
      </div>

      {showLangPrompt && (
        <div className="lang-prompt-overlay" onClick={() => setShowLangPrompt(false)}>
          <div className="lang-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Which language would you like?</h3>
            <p>You can speak and learn in your language — or stay in English. You can switch anytime.</p>
            <div className="lang-prompt-options">
              {langs.map((l) => (
                <button
                  key={l.code}
                  className={l.code === lang ? 'lang-opt sel' : 'lang-opt'}
                  onClick={() => {
                    changeLang(l.code);
                    localStorage.setItem('micLangAsked', '1');
                    setShowLangPrompt(false);
                    startRecording(l.code);
                  }}
                >
                  {l.native}
                  {l.code !== 'en' && <span className="lang-opt-en"> · {l.name}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showDetails && (
        <NodeDetails learnerId={learnerId} conceptId={conceptId} apiBase={apiBase} onClose={() => setShowDetails(false)} />
      )}

      {showCloseup && recap?.explanation && !gate && !done && (
        <div className="closeup-overlay" onClick={() => setShowCloseup(false)}>
          <div
            className="closeup-bubble"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="A close-up of the material"
          >
            <div className="closeup-head">
              <div className="closeup-head-text">
                <div className="closeup-eyebrow">A close-up of the material</div>
                {recap.title && <div className="closeup-title">{recap.title}</div>}
              </div>
              <button className="closeup-close" onClick={() => setShowCloseup(false)} aria-label="Close">✕</button>
            </div>
            <div className="closeup-body">
              <FormattedExplanation text={recap.explanation} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

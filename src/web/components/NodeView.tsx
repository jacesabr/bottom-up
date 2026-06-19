import { useEffect, useRef, useState } from 'react';
import { MathText } from '../lib/MathText';
import Scratchpad, { type ScratchpadHandle } from './Scratchpad';
import EquationComposer from './EquationComposer';
import NodeDetails from './NodeDetails';
import { speakSmart, speakSequence, LANG_INVITES, type SpeakSegment, recordAndTranscribe, stopSpeaking } from '../lib/voice';
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

  const [gate, setGate] = useState<any>(null);
  const glowPad = gate?.answerType === 'sketch' || glowPadKeyword || highlight?.target === 'scratchpad';
  const [gateAnswer, setGateAnswer] = useState('');
  const [gateFeedback, setGateFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const [langs, setLangs] = useState<LangOpt[]>([]);
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
  const [listening, setListening] = useState(false);
  const [autoRead, setAutoRead] = useState<boolean>(() => localStorage.getItem('autoRead') !== '0'); // default ON
  // Voice provider override (testing): '' = auto by language (English→ElevenLabs, Indic→Sarvam).
  const [ttsProvider, setTtsProvider] = useState<string>(() => localStorage.getItem('ttsProvider') || '');
  const [showLangPrompt, setShowLangPrompt] = useState(false);
  const stopListenRef = useRef<(() => void) | null>(null);
  const spokenCount = useRef(0);
  const heldOpening = useRef<string | null>(null); // chapter-intro gate: teaching message held until "start"

  const scroller = useRef<HTMLDivElement>(null);
  const padRef = useRef<ScratchpadHandle>(null);
  const base = `${apiBase}/learner/${learnerId}/node/${conceptId}`;
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
      (text) => setInput(text),
      () => setListening(false)
    );
  };

  const toggleMic = () => {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    // First-ever mic use → ask which language to speak/learn in (saved for all future calls).
    if (!localStorage.getItem('micLangAsked')) {
      setShowLangPrompt(true);
      return;
    }
    startRecording();
  };

  // Auto-start: AI opens the conversation (no intro screen).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch(`${base}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lang }),
        }).catch(() => null);
        if (cancelled) return;
        if (!res || !res.ok) {
          setMessages([{ role: 'tutor', text: SERVICE_DOWN_TEXT }]);
          setAwaitingStart(false);
          return;
        }
        const data = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (data.systemError) {
          setMessages([{ role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
          setAwaitingStart(false);
          return;
        }
        // Replay any prior conversation for this node, then the opening/continue message last.
        const history: Msg[] = (data.history ?? []).map((h: { role: 'tutor' | 'learner'; text: string }) => ({
          role: h.role,
          text: h.text,
        }));
        // Chapter-intro gate: the first fresh node opened in a chapter (this session) holds the teaching
        // message behind a language + "say/type start" gate. The flag is only committed once they start,
        // so changing language mid-gate (which re-runs this effect) keeps the gate up.
        const gateKey = 'chapGate:' + conceptId.split(':').slice(0, -1).join(':');
        if (history.length === 0 && !sessionStorage.getItem(gateKey)) {
          heldOpening.current = data.message;
          setMessages([{ role: 'tutor', text: INTRO_PROMPT }]);
          spokenCount.current = 1; // the gate effect voices this — keep the message effect off it
          setAwaitingStart(true);
        } else {
          setMessages([...history, { role: 'tutor', text: data.message }]);
          // Don't auto-read the whole replayed transcript — only the new opening line (index = history.length).
          spokenCount.current = history.length;
          setAwaitingStart(false);
        }
        setChecklist(data.checklist ?? []);
        setReadyForGate(!!data.readyForGate);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, lang]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Leaving the node (unmount): cut any read-aloud that's still playing so it doesn't follow us out.
  useEffect(() => () => stopSpeaking(), []);

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
  const buildWelcomeSegments = (text: string): SpeakSegment[] => {
    const segs: SpeakSegment[] = [];
    for (const para of text.split(/\n\n+/)) {
      const found = WELCOME_TOOLS.map((t) => ({ ...t, idx: para.indexOf('**' + t.token + '**') }))
        .filter((t) => t.idx >= 0)
        .sort((a, b) => a.idx - b.idx);
      if (found.length === 0) {
        segs.push({ text: para, lang, speechLang: speechCode, onStart: () => setHighlight(null) });
        continue;
      }
      if (found[0].idx > 0)
        segs.push({ text: para.slice(0, found[0].idx), lang, speechLang: speechCode, onStart: () => setHighlight(null) });
      found.forEach((f, k) => {
        const end = k + 1 < found.length ? found[k + 1].idx : para.length;
        segs.push({
          text: para.slice(f.idx, end),
          lang,
          speechLang: speechCode,
          onStart: () => setHighlight({ target: f.target, word: f.token }),
          pauseAfterMs: 250, // a brief beat so the glow registers — short enough not to feel choppy
        });
      });
    }
    return segs;
  };

  // Global read-aloud: when on, speak each NEW tutor message via the server voice chain. The welcome
  // message is read as a glow-synced sequence; everything else is read straight through.
  useEffect(() => {
    if (!autoRead) {
      spokenCount.current = messages.length;
      return;
    }
    for (let i = spokenCount.current; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== 'tutor' || !m.text) continue;
      if (isWelcomeMessage(m.text)) {
        void speakSequence(buildWelcomeSegments(m.text), apiBase, ttsProvider || undefined).then(() => setHighlight(null));
      } else {
        speakSmart(m.text, lang, speechCode, apiBase, ttsProvider || undefined);
      }
    }
    spokenCount.current = messages.length;
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

  const send = async () => {
    const text = input.trim();
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
    setInput('');
    setShowEq(false);
    setMessages((m) => [...m, { role: 'learner', text }]);
    setBusy(true);
    try {
      const res = await fetch(`${base}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang }),
      });
      const data = await res.json().catch(() => ({} as any));
      const text2 = data.message || (res.ok ? null : SERVICE_DOWN_TEXT);
      setMessages((m) => [...m, { role: 'tutor', text: text2 ?? SERVICE_DOWN_TEXT, figure: data.figure }]);
      // Don't overwrite progress on a failed/unavailable turn (no real checklist came back).
      if (res.ok && !data.systemError) {
        setChecklist(data.checklist ?? []);
        setReadyForGate(!!data.readyForGate);
      }
    } catch {
      setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
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
        body: JSON.stringify({ image: img, lang }),
      });
      const data = await res.json().catch(() => ({} as any));
      setMessages((m) => [...m, { role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
    } catch {
      setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
    } finally {
      setBusy(false);
    }
  };

  const sketchSend = async (img: string) => {
    if (busy) return;
    stopSpeaking();
    setHighlight(null);
    setMessages((m) => [...m, { role: 'learner', image: img }]);
    setBusy(true);
    try {
      const res = await fetch(`${base}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '[I shared my handwritten working on the scratchpad.]', lang }),
      });
      const data = await res.json().catch(() => ({} as any));
      setMessages((m) => [...m, { role: 'tutor', text: data.message || SERVICE_DOWN_TEXT }]);
      if (res.ok && !data.systemError) {
        setChecklist(data.checklist ?? []);
        setReadyForGate(!!data.readyForGate);
      }
    } catch {
      setMessages((m) => [...m, { role: 'tutor', text: SERVICE_DOWN_TEXT }]);
    } finally {
      setBusy(false);
    }
  };

  const poseNextGate = async () => {
    setBusy(true);
    setGateFeedback(null);
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

  const submitGate = async () => {
    if (busy || !gate) return;
    let answer = gateAnswer.trim();
    if (gate.answerType === 'sketch') {
      const img = padRef.current?.exportJpeg();
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
        body: JSON.stringify({ gateId: gate.gateId, answer, lang }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok && !data.feedback && !data.message) {
        setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
        return;
      }
      setGateFeedback({ ok: !!data.correct, text: data.feedback || data.message || SERVICE_DOWN_TEXT });
      // systemError → grader was down; keep the same gate so the student can retry, no false pass.
      if (!data.systemError && data.allPassed) {
        setMessages((m) => [...m, { role: 'tutor', text: data.message }]);
        setDone(true);
        setGate(null);
      } else if (!data.systemError && data.correct) {
        // cleared this gate → advance to the next one after a beat
        setTimeout(poseNextGate, 900);
      }
      // incorrect / unavailable → keep the same gate, feedback shown, allow retry
    } catch {
      setGateFeedback({ ok: false, text: SERVICE_DOWN_TEXT });
    } finally {
      setBusy(false);
    }
  };

  const shown = checklist.filter((c) => c.demonstrated).length;

  return (
    <div className="tutor-shell">
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
          {listening && (
            <div className="recording-overlay" onClick={toggleMic} role="button" tabIndex={0}>
              <div className="recording-card" onClick={(e) => e.stopPropagation()}>
                <div className="recording-pulse">
                  <span className="recording-ring" />
                  <span className="recording-mic">🎤</span>
                </div>
                <div className="recording-title">Listening… speak now</div>
                <p className="recording-sub">
                  Your voice is being turned into text. When you're done, tap the button below —
                  your words will appear in the box so you can read them before you press Send.
                </p>
                <button className="recording-stop" onClick={toggleMic}>⏹ Tap to stop &amp; see my text</button>
              </div>
            </div>
          )}
          <div className="chat-scroll" ref={scroller}>
            {messages.map((m, i) => (
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
            ))}
            {busy && <div className="thinking">thinking…</div>}

            {done && (
              <div className="node-done">
                ✓ Concept passed.{' '}
                <button className="link-btn" onClick={onBack}>Back to the chapter map →</button>
              </div>
            )}

            {!done && readyForGate && !gate && (
              <div className="gate-cta">
                <button className="btn-primary sm" onClick={poseNextGate}>I'm ready →</button>
              </div>
            )}

            {gate && (
              <div className="gate-card">
                <div className="gate-progress">
                  Check {gate.index} of {gate.total} · <span className="gate-slot">{slotLabel(gate.slot, gate.answerType)}</span>
                </div>
                <div className="gate-q"><MathText>{gate.prompt}</MathText></div>

                {gate.answerType === 'mcq' && gate.options && (
                  <div className="gate-opts">
                    {gate.options.map((o: string, i: number) => (
                      <label key={i} className={gateAnswer === o ? 'gate-opt sel' : 'gate-opt'}>
                        <input type="radio" name="g" value={o} checked={gateAnswer === o} onChange={(e) => setGateAnswer(e.target.value)} />
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
                    onChange={(e) => setGateAnswer(e.target.value)}
                  />
                )}

                {gate.answerType === 'written' && (
                  <textarea
                    className="gate-textarea"
                    placeholder="Write your explanation in full…"
                    value={gateAnswer}
                    onChange={(e) => setGateAnswer(e.target.value)}
                  />
                )}

                {gate.answerType === 'sketch' && (
                  <div className="gate-sketch-note">✏️ Draw your answer on the scratchpad (right), then submit — the tutor will look at it.</div>
                )}

                {gateFeedback && (
                  <div className={gateFeedback.ok ? 'gate-fb ok' : 'gate-fb no'}>
                    <MathText>{gateFeedback.text}</MathText>
                  </div>
                )}

                <button className="btn-primary sm" onClick={submitGate} disabled={busy}>
                  {gate.answerType === 'sketch' ? 'Submit drawing' : 'Submit'}
                </button>
              </div>
            )}
          </div>

          {/* Reply box */}
          {!gate && !done && (
            <div className="reply-box">
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
                    title="Voice engine (testing). Auto = ElevenLabs for English, Sarvam for Indian languages."
                  >
                    <option value="">Voice: Auto</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="sarvam">Sarvam</option>
                    <option value="deepgram">Deepgram</option>
                  </select>
                  <button
                    className={`notation-btn mic${listening ? ' listening' : ''}${highlight?.target === 'mic' ? ' glow' : ''}`}
                    onClick={toggleMic}
                    title={listening ? 'Tap to stop and turn your speech into text' : `Speak your answer (${langs.find((l) => l.code === lang)?.native || 'English'})`}
                  >
                    {listening ? '⏹ Tap to stop' : '🎤 Speak'}
                  </button>
                  <button className="notation-btn" onClick={() => setShowEq((s) => !s)} title="Insert equation">∑ Math</button>
                  <button className="btn-primary" onClick={send} disabled={busy || !input.trim()}>Send</button>
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
    </div>
  );
}

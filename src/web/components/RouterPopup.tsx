import { useEffect, useRef, useState } from 'react';
import '../styles/RouterPopup.css';

/**
 * "Finding your fastest tutor" modal. On mount it asks the server to speed-probe the free NIM endpoints
 * for BOTH the text tutor AND the vision (image→text) reader, and shows each race in full (every model,
 * its speed + reasoning quality, winner starred) so the learner SEES what we did and why. It then names
 * the expected reply speed for text and for handwriting — handwriting is image→text→read, so its time is
 * the vision read PLUS the tutor read, added up. Results STAY on screen until the learner taps the button;
 * nothing auto-dismisses. Shown at node entry (mode 'start' → "Start lesson") and after ANY tutor/grader
 * failure (mode 'failure' → re-race, switch, then "Resume lesson" which re-sends the message that failed so
 * the conversation picks up exactly where it left off). The server stores both picks for the session.
 */
interface ProbeRow { model: string; ok: boolean; latencyMs: number; quality: number; score: number }
interface RouteResult { kind: string; ranked: ProbeRow[]; winner: string; error?: boolean }

const short = (m: string) => (m || '').split('/').pop()!.replace(/-instruct.*$/, '').replace(/-a3b.*$/, '');
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function RaceList({ label, hint, r }: { label: string; hint: string; r: RouteResult | null }) {
  return (
    <div className="rp-race">
      <div className="rp-race-h">{label} <span className="rp-race-hint">{hint}</span></div>
      {!r && <div className="rp-spinner"><span /><span /><span /></div>}
      {r?.error && <div className="rp-muted">probe unavailable — using the safe default model.</div>}
      {r && !r.error && (
        <div className="rp-rows">
          <div className="rp-row rp-rowhead"><span className="rp-name">endpoint</span><span className="rp-stat">speed</span><span className="rp-stat">reasoning</span></div>
          {r.ranked.map((p, i) => (
            <div key={p.model} className={`rp-row ${p.model === r.winner && p.ok ? 'rp-win' : ''} ${!p.ok ? 'rp-dead' : ''}`} style={{ animationDelay: `${i * 55}ms` }}>
              <span className="rp-name">{p.model === r.winner && p.ok && <span className="rp-star2">★</span>}{short(p.model)}</span>
              <span className="rp-stat">{p.ok ? secs(p.latencyMs) : '✗ timed out'}</span>
              <span className="rp-stat rp-q">{p.ok ? `${Math.round(p.quality * 100)}%` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface RoutePicks { text?: string; textFallback?: string; vision?: string }

export default function RouterPopup({ apiBase, learnerId, mode, failedModel, onDone }: {
  apiBase: string; learnerId: string; mode: 'start' | 'failure'; failedModel?: string; onDone: (picks?: RoutePicks) => void;
}) {
  const [textR, setTextR] = useState<RouteResult | null>(null);
  const [visR, setVisR] = useState<RouteResult | null>(null);
  const [concluded, setConcluded] = useState(false);
  const [dwell, setDwell] = useState(false); // minimum on-screen time so the process is seen, not flashed past
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const probe = (kind: 'text' | 'vision', set: (r: RouteResult) => void) =>
      fetch(`${apiBase}/learner/${learnerId}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, failedModel }) })
        .then((r) => r.json()).then((d: RouteResult) => { const v = d && Array.isArray(d.ranked) ? d : { kind, ranked: [], winner: '', error: true }; set(v); return v; })
        .catch(() => { const v = { kind, ranked: [], winner: '', error: true }; set(v); return v; });
    const pt = probe('text', setTextR);
    const pv = probe('vision', setVisR);
    // Conclude (enable the button) once the TEXT tutor is chosen — the lesson is text. Give the vision race
    // a few seconds to also show, but never block the button on it. No auto-dismiss: the learner taps to go.
    pt.then(async () => {
      await Promise.race([pv, new Promise((r) => setTimeout(r, 6000))]);
      setConcluded(true);
    });
    // Minimum dwell: even if the probe resolves in <1s, hold the panel ~1.8s so the learner actually sees
    // the race happen (and, on a failure, feels looked-after) rather than it flashing by. No auto-dismiss.
    const dwellTimer = setTimeout(() => setDwell(true), 1800);
    return () => clearTimeout(dwellTimer);
  }, [apiBase, learnerId, failedModel]);

  const okWinner = (r: RouteResult | null) => (r && !r.error ? r.ranked.find((p) => p.model === r.winner && p.ok) ?? null : null);
  const tw = okWinner(textR);
  const vw = okWinner(visR);
  const textMs = tw?.latencyMs ?? 0;
  const visMs = vw?.latencyMs ?? 0;
  const handMs = visMs + textMs; // image→text (vision read) THEN the tutor reads that (text) — the two add up
  const isFailure = mode === 'failure';
  // Gate the button on BOTH the race concluding AND the minimum dwell — so the panel is never flashed past.
  const ready = concluded && dwell;
  // Live, one-line narration of where we are, so the wait feels like a process the learner is part of.
  const stageText = !textR
    ? 'Probing the free NIM endpoints…'
    : !concluded
      ? 'Ranking them by speed × quality…'
      : tw
        ? `Locked in — ${short(textR.winner)} is your tutor`
        : 'Using the safe default tutor';

  // The picks the browser will cache + send on every turn: this session's winner + 2nd-best (text) and the
  // vision winner, taken from the live race (ok endpoints only, best-first). The server re-validates each.
  const buildPicks = (): RoutePicks | undefined => {
    const ok = (r: RouteResult | null) => (r && !r.error ? r.ranked.filter((p) => p.ok).map((p) => p.model) : []);
    const t = ok(textR), v = ok(visR);
    const picks: RoutePicks = {};
    if (t[0]) picks.text = t[0];
    if (t[1]) picks.textFallback = t[1];
    if (v[0]) picks.vision = v[0];
    return Object.keys(picks).length ? picks : undefined;
  };

  return (
    <div className="rp-overlay">
      <div className="rp-modal">
        <div className="rp-head">
          <span className="rp-star">✶</span>
          <span className="rp-title">{isFailure ? 'Reconnecting your tutor' : 'Finding your fastest tutor'}</span>
        </div>
        {isFailure && failedModel && (
          <div className="rp-failed">⚠ <strong>{short(failedModel)}</strong> stopped responding mid-lesson — re-racing every model to switch you to a healthy one.</div>
        )}
        <div className="rp-intro">
          The free NIM endpoints swing in speed through the day, so <strong>every session</strong> we race them
          live and keep the best blend of <strong>speed</strong> and <strong>reasoning quality</strong> (thinking
          off, so replies stay fast and clean). Here's the race:
        </div>

        <div className="rp-races">
          <RaceList label="Text tutor" hint="reads & teaches on every reply" r={textR} />
          <RaceList label="Handwriting reader" hint="reads your scanned or drawn work" r={visR} />
        </div>

        <div className="rp-expect">
          <div className="rp-expect-h">What to expect</div>
          <div className="rp-expect-row"><span>Text replies</span><strong>{tw ? `~${secs(textMs)}` : concluded ? 'default' : '…'}</strong></div>
          <div className="rp-expect-row"><span>Handwriting</span><strong>{vw && tw ? `~${secs(handMs)}` : concluded ? 'default' : '…'}</strong></div>
          {vw && tw && (
            <div className="rp-expect-note">
              Handwriting takes two steps: <em>{short(visR!.winner)}</em> reads your image into text (~{secs(visMs)}),
              then the tutor <em>{short(textR!.winner)}</em> reads that and replies (~{secs(textMs)}) — so the two
              times add up to ~{secs(handMs)}.
            </div>
          )}
        </div>

        <div className="rp-foot">
          {isFailure && ready && tw && (
            <div className="rp-resume-note">
              Switched to <strong>{short(textR!.winner)}</strong>. We'll re-send your last message automatically so
              we pick up exactly where you left off — nothing you typed is lost.
            </div>
          )}
          <div className={`rp-stage${ready ? ' done' : ''}`}>
            <span className="rp-stage-dot" />
            {stageText}
          </div>
          <button className="rp-btn" disabled={!ready} onClick={() => onDone(buildPicks())}>
            {!ready ? (isFailure ? 'Reconnecting…' : 'Finding your tutor…') : isFailure ? 'Resume lesson  →' : 'Start lesson  →'}
          </button>
        </div>
      </div>
    </div>
  );
}

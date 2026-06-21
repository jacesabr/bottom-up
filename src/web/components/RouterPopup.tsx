import { useEffect, useRef, useState } from 'react';
import '../styles/RouterPopup.css';

/**
 * "Finding your fastest tutor" modal. On mount it asks the server to speed-probe the free NIM endpoints
 * for BOTH the text tutor AND the vision (image→text) grader, shows each race with full stats (speed,
 * quality, score) so the learner sees realistically how long text vs image will take, names each winner,
 * then auto-proceeds. Shown at node entry (mode 'start') and after ANY tutor/grader failure (mode
 * 'failure', naming the model that died) — the server stores both picks for the session.
 */
interface ProbeRow { model: string; ok: boolean; latencyMs: number; quality: number; score: number }
interface RouteResult { kind: string; ranked: ProbeRow[]; winner: string; error?: boolean }

const short = (m: string) => (m || '').split('/').pop()!.replace(/-instruct.*$/, '').replace(/-a3b.*$/, '');

function Race({ label, hint, r }: { label: string; hint: string; r: RouteResult | null }) {
  return (
    <div className="rp-race">
      <div className="rp-race-h">{label} <span className="rp-race-hint">{hint}</span></div>
      {!r && <div className="rp-spinner"><span /><span /><span /></div>}
      {r?.error && <div className="rp-muted">probe unavailable — using the default.</div>}
      {r && !r.error && (
        <table className="rp-table">
          <thead><tr><th>endpoint</th><th>speed</th><th>quality</th><th>score</th></tr></thead>
          <tbody>
            {r.ranked.map((p, i) => (
              <tr key={p.model} className={`${p.model === r.winner ? 'rp-win' : ''} ${!p.ok ? 'rp-dead' : ''}`} style={{ animationDelay: `${i * 80}ms` }}>
                <td>{short(p.model)}{p.model === r.winner && <span className="rp-wintag">◀</span>}</td>
                <td>{p.ok ? `${(p.latencyMs / 1000).toFixed(1)}s` : '✗ timeout'}</td>
                <td>{p.ok ? `${Math.round(p.quality * 100)}%` : '—'}</td>
                <td>{p.ok ? p.score.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function RouterPopup({ apiBase, learnerId, mode, failedModel, onDone }: {
  apiBase: string; learnerId: string; mode: 'start' | 'failure'; failedModel?: string; onDone: (winner?: string) => void;
}) {
  const [textR, setTextR] = useState<RouteResult | null>(null);
  const [visR, setVisR] = useState<RouteResult | null>(null);
  const [concluded, setConcluded] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const probe = (kind: 'text' | 'vision', set: (r: RouteResult) => void) =>
      fetch(`${apiBase}/learner/${learnerId}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
        .then((r) => r.json()).then((d: RouteResult) => { const v = d && Array.isArray(d.ranked) ? d : { kind, ranked: [], winner: '', error: true }; set(v); return v; })
        .catch(() => { const v = { kind, ranked: [], winner: '', error: true }; set(v); return v; });
    const pt = probe('text', setTextR);
    const pv = probe('vision', setVisR);
    pt.then(async (t) => {
      // proceed once the text tutor is chosen (the lesson is text); let the vision race show too, but never
      // block the lesson on it for more than a few seconds.
      await Promise.race([pv, new Promise((r) => setTimeout(r, 6000))]);
      setConcluded(true);
      setTimeout(() => onDone(t?.winner), 1600);
    });
  }, [apiBase, learnerId, onDone]);

  return (
    <div className="rp-overlay">
      <div className="rp-modal">
        <div className="rp-head">
          <span className="rp-star">✶</span>
          <span className="rp-title">{mode === 'failure' ? 'Reconnecting your tutor' : 'Finding your fastest tutor'}</span>
        </div>
        {mode === 'failure' && failedModel && (
          <div className="rp-failed">⚠ <strong>{short(failedModel)}</strong> stopped responding — re-racing every endpoint to pick a new one.</div>
        )}
        <div className="rp-sub">live speed × quality race on the free NIM endpoints (thinking off):</div>
        <Race label="Text tutor" hint="reads + teaches each turn" r={textR} />
        <Race label="Vision grader" hint="reads handwritten work (image → text)" r={visR} />
        {concluded && (
          <div className="rp-conclude">
            → text: <strong>{short(textR?.winner || '')}</strong>{visR && !visR.error && visR.winner ? <> · vision: <strong>{short(visR.winner)}</strong></> : ''} — {mode === 'failure' ? 'resuming…' : 'starting your lesson…'}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import '../styles/RouterPopup.css';

/**
 * "Finding your fastest tutor" modal. On mount it asks the server to speed-probe the free NIM endpoints
 * (thinking off), shows the race as a table with the winner highlighted + the reasoning, then auto-proceeds.
 * Used at node entry (mode 'start') and after a tutor failure (mode 'failure', naming the model that died).
 */
interface ProbeRow { model: string; ok: boolean; latencyMs: number; quality: number; score: number; }
interface RouteResult { kind: string; ranked: ProbeRow[]; winner: string; fallback: string }

const short = (m: string) => (m || '').split('/').pop()!.replace(/-instruct.*$/, '').replace(/-a3b.*$/, '');

export default function RouterPopup({ apiBase, learnerId, mode, failedModel, onDone }: {
  apiBase: string; learnerId: string; mode: 'start' | 'failure'; failedModel?: string; onDone: (winner?: string) => void;
}) {
  const [result, setResult] = useState<RouteResult | null>(null);
  const [phase, setPhase] = useState<'probing' | 'done' | 'error'>('probing');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/learner/${learnerId}/route`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text' }),
        });
        const data: RouteResult = await res.json();
        if (!data || !Array.isArray(data.ranked)) throw new Error('bad route');
        setResult(data);
        setPhase('done');
        setTimeout(() => onDone(data.winner), 1700); // auto-proceed once the pick is shown
      } catch {
        setPhase('error');
        setTimeout(() => onDone(), 1200); // fall through to the default model
      }
    })();
  }, [apiBase, learnerId, onDone]);

  const winner = result?.winner;
  return (
    <div className="rp-overlay">
      <div className="rp-modal">
        <div className="rp-head">
          <span className="rp-star">✶</span>
          <span className="rp-title">{mode === 'failure' ? 'Reconnecting your tutor' : 'Finding your fastest tutor'}</span>
        </div>
        {mode === 'failure' && failedModel && (
          <div className="rp-failed">⚠ <strong>{short(failedModel)}</strong> stopped responding — racing the others to pick a new one.</div>
        )}
        <div className="rp-sub">{phase === 'probing' ? 'probing free NIM endpoints · thinking off…' : phase === 'error' ? 'probe unavailable — using the default tutor.' : 'live speed × quality race:'}</div>

        {result && result.ranked.length > 0 && (
          <table className="rp-table">
            <thead><tr><th>endpoint</th><th>speed</th><th>quality</th><th>score</th></tr></thead>
            <tbody>
              {result.ranked.map((r, i) => (
                <tr key={r.model} className={`${r.model === winner ? 'rp-win' : ''} ${!r.ok ? 'rp-dead' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
                  <td>{short(r.model)}{r.model === winner && <span className="rp-wintag">◀ winner</span>}</td>
                  <td>{r.ok ? `${(r.latencyMs / 1000).toFixed(1)}s` : '✗ timeout'}</td>
                  <td>{r.ok ? `${Math.round(r.quality * 100)}%` : '—'}</td>
                  <td>{r.ok ? r.score.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {phase === 'probing' && <div className="rp-spinner"><span /><span /><span /></div>}

        {phase === 'done' && winner && (
          <div className="rp-conclude">
            → <strong>{short(winner)}</strong> — best speed×quality this minute. {mode === 'failure' ? 'Resuming…' : 'Starting your lesson…'}
          </div>
        )}
      </div>
    </div>
  );
}

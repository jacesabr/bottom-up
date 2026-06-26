import { useEffect, useRef, useState } from 'react';
import { MathText } from '../lib/MathText';
import '../styles/GetUnstuck.css';

/**
 * The exam "get unstuck" loop. When a learner gets a paper question wrong and asks for help, we walk the
 * question's COVERING SET — the nodes whose concepts together answer it — one at a time. Each node gets a
 * "quick check" (its gate). Pass it → that block is solid, move on. Miss it → we teach just that block,
 * then re-check. Once every block is solid, the learner takes the exam question again. They can bail back
 * to the question any time via "I'm ready". (Server endpoints under /paper/:id/q/:q/help/* do the work.)
 */

interface CNode { id: string; title: string; }
interface Gate { gateId?: string; slot?: string; prompt?: string; answerType?: string; options?: string[] | null; allPassed?: boolean; }
interface Teach { id: string; title: string; brief: string; explanation: string; keyMoves: string[]; }

export default function GetUnstuck({
  learnerId, paperId, q, apiBase, onClose,
}: { learnerId: string; paperId: string; q: number; apiBase: string; onClose: () => void }) {
  const base = `${apiBase}/learner/${learnerId}/paper/${paperId}/q/${q}`;
  const [phase, setPhase] = useState<'loading' | 'check' | 'teach' | 'done' | 'error'>('loading');
  const [covering, setCovering] = useState<CNode[]>([]);
  const [idx, setIdx] = useState(0);
  const [solid, setSolid] = useState<Set<string>>(new Set());
  const [gate, setGate] = useState<Gate | null>(null);
  const [teach, setTeach] = useState<Teach | null>(null);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const started = useRef(false);
  const shown = useRef<string[]>([]); // gate ids already posed for the current node (so a re-check picks a new one)

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const d = await fetch(`${base}/covering`).then((r) => r.json());
        const cov: CNode[] = d.covering ?? [];
        if (!cov.length) { setErr("No concepts are mapped to this question yet."); setPhase('error'); return; }
        setCovering(cov);
        await poseFor(0, cov, new Set());
      } catch { setErr('Could not start the walkthrough.'); setPhase('error'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pose the quick-check for covering node i; skip nodes with no text-gradable gate left. `sameNode` =
  // re-checking the current node after teaching, so we exclude the gates already shown and pick a new one.
  async function poseFor(i: number, cov = covering, solidSet = solid, sameNode = false) {
    if (i >= cov.length) { setPhase('done'); return; }
    if (!sameNode) shown.current = [];
    setIdx(i); setDraft(''); setFeedback(''); setTeach(null);
    try {
      const g: Gate = await fetch(`${base}/help/${encodeURIComponent(cov[i].id)}/gate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exclude: shown.current }),
      }).then((r) => r.json());
      if (g.allPassed || !g.gateId) {
        const ns = new Set(solidSet); ns.add(cov[i].id); setSolid(ns);
        await poseFor(i + 1, cov, ns); return;
      }
      shown.current = [...shown.current, g.gateId];
      setGate(g); setPhase('check');
    } catch { setErr('Could not load the quick check.'); setPhase('error'); }
  }

  async function submitCheck() {
    if (!gate?.gateId || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`${base}/help/${encodeURIComponent(covering[idx].id)}/gate-answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId: gate.gateId, answer: draft, lang: 'en' }),
      }).then((x) => x.json());
      setFeedback(r.feedback || '');
      if (r.correct) {
        const ns = new Set(solid); ns.add(covering[idx].id); setSolid(ns);
        setTimeout(() => poseFor(idx + 1, covering, ns), 650);
      } else {
        const t: Teach = await fetch(`${base}/help/${encodeURIComponent(covering[idx].id)}/teach`).then((x) => x.json());
        setTeach(t); setPhase('teach');
      }
    } catch { setErr('Could not grade that.'); setPhase('error'); }
    finally { setBusy(false); }
  }

  const total = covering.length;
  const done = solid.size;

  return (
    <div className="unstuck">
      <div className="unstuck-head">
        <div className="unstuck-title">Let's build up to Q{q}</div>
        <button className="unstuck-ready" onClick={onClose}>I'm ready — try the question now →</button>
      </div>
      {total > 0 && (
        <div className="unstuck-progress" title={`${done} of ${total} building blocks solid`}>
          {covering.map((n) => (
            <span key={n.id} className={`blk ${solid.has(n.id) ? 'solid' : idx >= 0 && covering[idx]?.id === n.id ? 'now' : ''}`} title={n.title} />
          ))}
          <span className="unstuck-count">{done}/{total}</span>
        </div>
      )}

      {phase === 'loading' && <div className="unstuck-body dim">Finding the concepts this question is built on…</div>}

      {phase === 'error' && (
        <div className="unstuck-body">
          <p className="unstuck-err">{err}</p>
          <button className="unstuck-btn" onClick={onClose}>Back to the question</button>
        </div>
      )}

      {phase === 'check' && gate && (
        <div className="unstuck-body">
          <div className="unstuck-lead">Quick check — <b>{covering[idx]?.title}</b></div>
          <div className="unstuck-prompt"><MathText>{gate.prompt || ''}</MathText></div>
          {gate.answerType === 'mcq' && gate.options ? (
            <div className="unstuck-opts">
              {gate.options.map((o, i) => (
                <label key={i} className={draft === o ? 'unstuck-opt sel' : 'unstuck-opt'}>
                  <input type="radio" name={`uq${idx}`} value={o} checked={draft === o} onChange={(e) => setDraft(e.target.value)} />
                  <MathText>{o}</MathText>
                </label>
              ))}
            </div>
          ) : (
            <input className="unstuck-input" placeholder="Your answer" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCheck(); }} />
          )}
          {feedback && <div className="unstuck-feedback"><MathText>{feedback}</MathText></div>}
          <button className="unstuck-btn" disabled={busy || !draft.trim()} onClick={submitCheck}>
            {busy ? 'checking…' : 'Check'}
          </button>
        </div>
      )}

      {phase === 'teach' && teach && (
        <div className="unstuck-body">
          <div className="unstuck-lead">Let's nail <b>{teach.title}</b></div>
          {teach.brief && <p className="unstuck-brief"><MathText>{teach.brief}</MathText></p>}
          {teach.keyMoves?.length > 0 && (
            <ul className="unstuck-moves">
              {teach.keyMoves.map((m, i) => <li key={i}><MathText>{m}</MathText></li>)}
            </ul>
          )}
          <button className="unstuck-btn" onClick={() => poseFor(idx, covering, solid, true)}>Got it — check again</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="unstuck-body">
          <div className="unstuck-lead">You've got all the pieces. 🎯</div>
          <p className="dim">Every concept this question is built on is solid now. Take Q{q} again.</p>
          <button className="unstuck-btn primary" onClick={onClose}>Back to Q{q} — try it again →</button>
        </div>
      )}
    </div>
  );
}

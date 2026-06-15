import { useEffect, useState } from 'react';
import { MathText } from '../lib/MathText';
import '../styles/NodeDetails.css';

function slotLabel(slot?: string, answerType?: string): string {
  if (slot === 'sketch1' || slot === 'sketch2' || answerType === 'sketch') return '✏️ draw it';
  if (slot === 'explain' || answerType === 'written') return '✍️ explain in words';
  if (slot === 'mcq' || answerType === 'mcq') return '🔘 multiple choice';
  if (slot === 'equation' || answerType === 'symbolic') return '🧮 solve it';
  return 'check';
}

/**
 * Optional disclosure (the "ⓘ Details" button). Keeps content/progress/pain-points OUT of the
 * teaching flow so they never add friction — the learner opens this only if they want it.
 */
export default function NodeDetails({
  learnerId,
  conceptId,
  apiBase,
  onClose,
}: {
  learnerId: string;
  conceptId: string;
  apiBase: string;
  onClose: () => void;
}) {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/detail`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ error: true }));
  }, [learnerId, conceptId, apiBase]);

  return (
    <div className="details-overlay" onClick={onClose}>
      <aside className="details-panel" onClick={(e) => e.stopPropagation()}>
        <div className="details-head">
          <h3>Details</h3>
          <button className="details-close" onClick={onClose}>✕</button>
        </div>

        {!d && <div className="details-loading">Loading…</div>}
        {d && d.error && <div className="details-loading">Couldn't load details.</div>}

        {d && !d.error && (
          <div className="details-body">
            {d.notes && (
              <section className="d-notes">
                <div className="d-label">Tutor's notes — where you are</div>
                <p className="d-notes-summary">{d.notes.summary}</p>
                {d.notes.stickingPoints.length > 0 && (
                  <ul className="d-sticking">
                    {d.notes.stickingPoints.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <div className="d-nextstep">Next: {d.notes.nextStep}</div>
              </section>
            )}

            {d.sessionSummary && (
              <section>
                <div className="d-label">Session memory — what's been covered so far</div>
                <div className="d-session"><MathText>{d.sessionSummary}</MathText></div>
              </section>
            )}

            {d.corpusGaps && d.corpusGaps.length > 0 && (
              <section>
                <div className="d-label">Content gaps flagged on this concept</div>
                <ul className="d-gaps">
                  {d.corpusGaps.map((g: string, i: number) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="d-label">Concept</div>
              <div className="d-title">{d.concept.title}</div>
              <div className="d-role">{d.concept.role}</div>
              <p className="d-brief"><MathText>{d.concept.brief}</MathText></p>
              <p className="d-explain"><MathText>{d.concept.explanation}</MathText></p>
            </section>

            <section>
              <div className="d-label">What we're learning — covered ✓ / remaining ◻ ({d.checklist.filter((c: any) => c.demonstrated).length}/{d.checklist.length})</div>
              <ul className="d-checklist">
                {d.checklist.map((c: any) => (
                  <li key={c.index} className={c.demonstrated ? 'done' : ''}>
                    <span className="d-check">{c.demonstrated ? '✓' : '◻'}</span>
                    <span>
                      <MathText>{c.text}</MathText>
                      {c.evidence && <span className="d-evidence">“{c.evidence}”</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="d-label">Your progress</div>
              <div className="d-stats">
                <span>Status: <b>{d.progress.status}</b></span>
                <span>Visits: <b>{d.progress.attempts}</b></span>
                <span>Gate fails: <b>{d.progress.fails}</b></span>
                <span>Passes: <b>{d.progress.passes}</b></span>
                {d.progress.firstPass === true && <span className="d-firstpass">first-pass ✓</span>}
              </div>
              {d.gateAttempts.length > 0 && (
                <ul className="d-attempts">
                  {d.gateAttempts.map((a: any) => (
                    <li key={a.attemptNo} className={a.correct ? 'ok' : 'no'}>
                      #{a.attemptNo}: <MathText>{a.answer}</MathText> {a.correct ? '✓' : '✗'}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.gates && d.gates.length > 0 && (
              <section>
                <div className="d-label">The checks ({d.gates.length}) — posed in chat after all ideas are shown</div>
                {d.gates.map((g: any, i: number) => (
                  <div key={i} className="d-gate">
                    <div className="d-gate-type">{slotLabel(g.slot, g.answerType)}</div>
                    <div className="d-gate-q"><MathText>{g.prompt}</MathText></div>
                    {g.options && (
                      <ul className="d-gate-opts">
                        {g.options.map((o: string, j: number) => (
                          <li key={j}><MathText>{o}</MathText></li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            )}

            <section>
              <div className="d-label">Watch-outs (common pain points)</div>
              <ul className="d-misc">
                {d.concept.misconceptions.map((m: string, i: number) => (
                  <li key={i}><MathText>{m}</MathText></li>
                ))}
              </ul>
              {d.painPoints.length > 0 && (
                <div className="d-seen">Seen in your session: {d.painPoints.join(', ')}</div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

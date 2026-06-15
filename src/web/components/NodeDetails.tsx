import { useEffect, useState } from 'react';
import { MathText } from '../lib/MathText';
import '../styles/NodeDetails.css';

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

            <section>
              <div className="d-label">Concept</div>
              <div className="d-title">{d.concept.title}</div>
              <div className="d-role">{d.concept.role}</div>
              <p className="d-brief"><MathText>{d.concept.brief}</MathText></p>
              <p className="d-explain"><MathText>{d.concept.explanation}</MathText></p>
            </section>

            <section>
              <div className="d-label">Key ideas ({d.checklist.filter((c: any) => c.demonstrated).length}/{d.checklist.length} shown)</div>
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

            {d.gate && (
              <section>
                <div className="d-label">Gate check — appears in chat after all ideas are shown</div>
                <p className="d-gate"><MathText>{d.gate.prompt}</MathText></p>
                {d.gate.options && (
                  <ul className="d-gate-opts">
                    {d.gate.options.map((o: string, i: number) => (
                      <li key={i}><MathText>{o}</MathText></li>
                    ))}
                  </ul>
                )}
                {d.gate.srcLabel && <div className="d-gate-src">Source: {d.gate.srcLabel}</div>}
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

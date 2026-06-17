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

type ExplainPart = { num: string; head: string; body: string };

/**
 * Split a PART-structured explanation into ordered parts. Authored explanations follow
 * `PART N — Heading.\n<body>` (see authoring_and_improve.md §C). We split on the marker (em-dash or
 * hyphen, any surrounding whitespace) so it works whether parts are separated by blank lines or
 * run together. Returns null when there are no PART markers — caller falls back to plain text.
 */
function parseParts(text: string): { preamble: string; parts: ExplainPart[] } | null {
  if (!/PART\s+\d+\s*[—–-]/.test(text)) return null;
  const segs = text.split(/(?=PART\s+\d+\s*[—–-])/);
  const preamble = segs[0].trim().startsWith('PART') ? '' : segs.shift()!.trim();
  const parts: ExplainPart[] = [];
  for (const seg of segs) {
    const m = seg.match(/^PART\s+(\d+)\s*[—–-]\s*([\s\S]*)$/);
    if (!m) continue;
    const num = m[1];
    const rest = m[2].trim();
    let head = rest;
    let body = '';
    const nl = rest.indexOf('\n');
    if (nl >= 0) {
      head = rest.slice(0, nl).trim();
      body = rest.slice(nl + 1).trim();
    } else {
      const dot = rest.indexOf('. ');
      if (dot >= 0) {
        head = rest.slice(0, dot + 1).trim();
        body = rest.slice(dot + 2).trim();
      }
    }
    parts.push({ num, head, body });
  }
  return parts.length ? { preamble, parts } : null;
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
            {d.notes && (() => {
              const focus = d.notes.currentFocus ?? '';
              const progress = focus ? d.notes.summary.replace(focus, '').trim() : d.notes.summary;
              const points: { label: string; text: string }[] = [];
              if (progress) points.push({ label: 'Where you are', text: progress });
              if (focus) points.push({ label: 'Working on', text: focus });
              for (const s of d.notes.stickingPoints) points.push({ label: 'Watch out', text: s });
              if (d.notes.nextStep) points.push({ label: 'Next step', text: d.notes.nextStep });
              return (
                <section className="d-notes">
                  <div className="d-label">Tutor's notes — where you are</div>
                  <ol className="d-notes-list">
                    {points.map((p, i) => (
                      <li key={i} className="d-note-point">
                        <div className="d-note-badge">{i + 1}</div>
                        <div className="d-note-text">
                          <span className="d-note-label">{p.label}</span>
                          <MathText>{p.text}</MathText>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })()}

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
              {(() => {
                const parsed = parseParts(d.concept.explanation);
                if (!parsed) {
                  return <p className="d-explain"><MathText>{d.concept.explanation}</MathText></p>;
                }
                return (
                  <div className="d-parts">
                    {parsed.preamble && (
                      <p className="d-explain"><MathText>{parsed.preamble}</MathText></p>
                    )}
                    {parsed.parts.map((p, i) => (
                      <div key={i} className="d-part-wrap">
                        <div className="d-part">
                          <div className="d-part-badge">{p.num}</div>
                          <div className="d-part-content">
                            <div className="d-part-head"><MathText>{p.head}</MathText></div>
                            {p.body && p.body.split('\n\n').map((b, j) => (
                              <p key={j} className="d-part-body"><MathText>{b}</MathText></p>
                            ))}
                          </div>
                        </div>
                        {i < parsed.parts.length - 1 && (
                          <div className="d-part-arrow" aria-hidden="true">↓</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
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

import { useEffect, useState } from 'react';
import { MathText } from '../lib/MathText';
import '../styles/PaperView.css';

/**
 * The final past-paper exam (README steps 5-6). Pick a board paper → answer it question by question
 * → see your score, a per-section breakdown, and the WEAK-CONCEPT REVIEW: the concepts behind every
 * question you missed, each a tap back into that teaching node.
 */

interface SourceLink {
  label: string;
  url: string;
}
interface PaperSummary {
  paperId: string;
  title: string;
  subject: string;
  totalQuestions: number;
  maxMarks: number;
  sources: SourceLink[];
}
interface Question {
  q: number;
  section: string;
  marks: number;
  type: string;
  grader: string;
  handling: string;
  prompt: string;
  options: string[] | null;
}
interface Paper {
  paperId: string;
  title: string;
  subject: string;
  contract: { totalQuestions: number; maxMarks: number };
  sources: SourceLink[];
  questions: Question[];
}
interface AnswerState {
  q: number;
  answer: string | null;
  correct: boolean | null;
  marksAwarded: number;
  marksPossible: number;
}
interface Result {
  title: string;
  scored: number;
  maxMarks: number;
  answered: number;
  total: number;
  finished: boolean;
  sections: Array<{ section: string; got: number; max: number }>;
  weakConcepts: Array<{ conceptId: string; title: string; chapterId: string }>;
}

/** Verifiable provenance: official source links so students can trust where the paper came from. */
function SourceRow({ sources }: { sources: SourceLink[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="source-row">
      <span className="source-label">🔗 Verify source:</span>
      {sources.map((s) => (
        <a key={s.url} className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">
          {s.label} ↗
        </a>
      ))}
    </div>
  );
}

export default function PaperView({
  learnerId,
  exam,
  subject,
  apiBase,
  onBack,
  onRevise,
}: {
  learnerId: string;
  exam: string;
  subject: string;
  apiBase: string;
  onBack: () => void;
  onRevise: (conceptId: string, chapterId: string) => void;
}) {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/papers/${exam}?subject=${encodeURIComponent(subject)}`)
      .then((r) => r.json())
      .then((d) => setPapers(d.papers ?? []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [exam, subject, apiBase]);

  const openPaper = async (paperId: string) => {
    setLoading(true);
    setResult(null);
    const r = await fetch(`${apiBase}/learner/${learnerId}/paper/${paperId}`).then((x) => x.json());
    setPaper(r.paper);
    const a: Record<number, AnswerState> = {};
    const d: Record<number, string> = {};
    for (const x of r.answers ?? []) {
      a[x.q] = x;
      if (x.answer) d[x.q] = x.answer;
    }
    setAnswers(a);
    setDraft(d);
    setLoading(false);
  };

  const submit = async (q: Question) => {
    const answer = (draft[q.q] ?? '').trim();
    if (!answer && q.handling !== 'lab-acknowledge') return;
    setBusy(q.q);
    try {
      const r = await fetch(`${apiBase}/learner/${learnerId}/paper/${paper!.paperId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: q.q, answer: answer || '(acknowledged)' }),
      }).then((x) => x.json());
      setAnswers((s) => ({ ...s, [q.q]: { q: q.q, answer, correct: r.correct, marksAwarded: r.marksAwarded, marksPossible: r.marksPossible } }));
      setFeedback((s) => ({ ...s, [q.q]: r.feedback }));
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    setLoading(true);
    const r = await fetch(`${apiBase}/learner/${learnerId}/paper/${paper!.paperId}/result`).then((x) => x.json());
    setResult(r);
    setLoading(false);
  };

  // ---- Result screen ----
  if (result) {
    const pct = result.maxMarks ? Math.round((result.scored / result.maxMarks) * 100) : 0;
    return (
      <div className="paper-view">
        <button className="back-btn" onClick={() => setResult(null)}>← Back to paper</button>
        <div className="paper-result">
          <h2>{result.title}</h2>
          <div className="score-big">
            {result.scored} <span className="score-of">/ {result.maxMarks}</span>
            <span className="score-pct">{pct}%</span>
          </div>
          <div className="section-bars">
            {result.sections.map((s) => (
              <div key={s.section} className="sec-row">
                <span className="sec-name">{s.section}</span>
                <div className="sec-bar">
                  <div className="sec-fill" style={{ width: `${s.max ? (s.got / s.max) * 100 : 0}%` }} />
                </div>
                <span className="sec-num">{s.got}/{s.max}</span>
              </div>
            ))}
          </div>

          <div className="weak-review">
            <h3>Revise these concepts</h3>
            {result.weakConcepts.length === 0 ? (
              <p className="all-clear">Nothing flagged — every question you answered was on target. 🎉</p>
            ) : (
              <>
                <p className="weak-sub">Each question you missed traces back to one concept. Tap to re-learn it:</p>
                <div className="weak-list">
                  {result.weakConcepts.map((w) => (
                    <button key={w.conceptId} className="weak-chip" onClick={() => onRevise(w.conceptId, w.chapterId)}>
                      <MathText>{w.title}</MathText> <span className="weak-arrow">→</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {paper && <SourceRow sources={paper.sources} />}
        </div>
      </div>
    );
  }

  // ---- Sitting the paper ----
  if (paper) {
    const gradable = paper.questions.filter((q) => q.handling !== 'lab-acknowledge');
    const answeredCount = gradable.filter((q) => answers[q.q]).length;
    let lastSection = '';
    return (
      <div className="paper-view">
        <button className="back-btn" onClick={() => { setPaper(null); setResult(null); }}>← Papers</button>
        <div className="paper-head">
          <h2><MathText>{paper.title}</MathText></h2>
          <div className="paper-progress">{answeredCount}/{gradable.length} answered · {paper.contract.maxMarks} marks</div>
          <SourceRow sources={paper.sources} />
        </div>

        <div className="q-list">
          {paper.questions.map((q) => {
            const a = answers[q.q];
            const showSec = q.section !== lastSection;
            lastSection = q.section;
            return (
              <div key={q.q}>
                {showSec && <div className="sec-header">Section {q.section}</div>}
                <div className={`q-card ${a ? (q.handling === 'lab-acknowledge' ? 'q-ack' : a.marksAwarded >= a.marksPossible ? 'q-right' : a.marksAwarded > 0 ? 'q-partial' : 'q-wrong') : ''}`}>
                  <div className="q-top">
                    <span className="q-num">Q{q.q}</span>
                    <span className="q-marks">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                  </div>
                  <div className="q-prompt"><MathText>{q.prompt}</MathText></div>

                  {q.handling === 'lab-acknowledge' ? (
                    <div className="q-lab">
                      Practical/lab question — can't be performed here.
                      {!a && <button className="btn-sm" onClick={() => submit(q)}>Acknowledge & continue</button>}
                    </div>
                  ) : q.options ? (
                    <div className="q-opts">
                      {q.options.map((o, i) => (
                        <label key={i} className={draft[q.q] === o ? 'q-opt sel' : 'q-opt'}>
                          <input type="radio" name={`q${q.q}`} value={o} checked={draft[q.q] === o} onChange={(e) => setDraft((s) => ({ ...s, [q.q]: e.target.value }))} />
                          <MathText>{o}</MathText>
                        </label>
                      ))}
                    </div>
                  ) : q.type === 'numeric' ? (
                    <input className="q-input" placeholder="Your numerical answer" value={draft[q.q] ?? ''} onChange={(e) => setDraft((s) => ({ ...s, [q.q]: e.target.value }))} />
                  ) : (
                    <textarea className="q-textarea" placeholder="Write your full answer…" value={draft[q.q] ?? ''} onChange={(e) => setDraft((s) => ({ ...s, [q.q]: e.target.value }))} />
                  )}

                  {q.handling !== 'lab-acknowledge' && (
                    <div className="q-actions">
                      <button className="btn-sm" disabled={busy === q.q} onClick={() => submit(q)}>
                        {busy === q.q ? 'checking…' : a ? 'Re-answer' : 'Submit'}
                      </button>
                      {a && (
                        <span className={a.marksAwarded >= a.marksPossible ? 'q-verdict ok' : a.marksAwarded > 0 ? 'q-verdict partial' : 'q-verdict no'}>
                          {a.marksAwarded}/{a.marksPossible} mark{a.marksPossible > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {feedback[q.q] && <div className="q-feedback"><MathText>{feedback[q.q]}</MathText></div>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="paper-foot">
          <button className="btn-primary" onClick={finish}>Finish & see results →</button>
        </div>
      </div>
    );
  }

  // ---- Paper picker ----
  return (
    <div className="paper-view">
      <button className="back-btn" onClick={onBack}>← Chapters</button>
      <div className="paper-pick">
        <h2>Final exam — a real board paper</h2>
        <p className="pick-sub">Once you've worked through the chapters, sit a full past paper end-to-end. We grade it and flag exactly which concepts to revise.</p>
        {loading ? (
          <div className="paper-loading">Loading papers…</div>
        ) : papers.length === 0 ? (
          <div className="paper-loading">No papers available for this exam yet.</div>
        ) : (
          <div className="pick-list">
            {papers.map((p) => (
              <div key={p.paperId} className="pick-card">
                <button className="pick-open" onClick={() => openPaper(p.paperId)}>
                  <div className="pick-title"><MathText>{p.title}</MathText></div>
                  <div className="pick-meta">{p.totalQuestions} questions · {p.maxMarks} marks</div>
                </button>
                <SourceRow sources={p.sources} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

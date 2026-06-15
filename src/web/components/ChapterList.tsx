import { useEffect, useState } from 'react';
import '../styles/ChapterList.css';

interface Chapter {
  id: string;
  title: string;
  index: number;
  status: 'active' | 'locked' | 'complete';
}

export default function ChapterList({
  learnerId,
  exam,
  subject,
  onPick,
  onTakePaper,
  onBack,
  apiBase,
}: {
  learnerId: string;
  exam: string;
  subject: string;
  onPick: (chapterId: string) => void;
  onTakePaper: () => void;
  onBack: () => void;
  apiBase: string;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/learner/${learnerId}/chapters/${exam}/${subject}`)
      .then((r) => r.json())
      .then((d) => setChapters(d.chapters ?? []))
      .catch(() => setChapters([]))
      .finally(() => setLoading(false));
  }, [learnerId, exam, subject, apiBase]);

  return (
    <div className="chapter-list">
      <button className="back-btn" onClick={onBack}>← Subjects</button>

      <div className="step">
        <div className="num">2</div>
        <div className="grow">
          <h2>Work through the chapters, in order</h2>
          <p>Chapters unlock one after another — finish one to open the next. No skipping ahead.</p>

          <div className="map-wrap">
            <div className="map-title">CBSE 10 · Maths — {chapters.length} chapters</div>
            {loading ? (
              <div className="cl-loading">Loading chapters…</div>
            ) : (
              <div className="map">
                {chapters.map((c) => (
                  <div
                    key={c.id}
                    className={`c ${c.status === 'active' ? 'available' : c.status === 'complete' ? 'done' : 'locked'}`}
                    onClick={() => c.status !== 'locked' && onPick(c.id)}
                    title={c.title}
                  >
                    <div className="dot">{c.status === 'complete' ? '' : c.index}</div>
                    <div className="nm">{c.title}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="legend">
              <span className="l-done">done</span>
              <span className="l-now">you're here</span>
              <span className="l-lock">locked</span>
            </div>
          </div>

          <button className="take-paper-btn" onClick={onTakePaper}>
            📝 Sit a past board paper — then revise what you miss →
          </button>
        </div>
      </div>
    </div>
  );
}

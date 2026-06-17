import { useEffect, useState } from 'react';
import '../styles/ChapterList.css'; // shared chapter-grid cell styles (.map/.c/.dot/.nm/.legend/.take-paper-btn)
import '../styles/Home.css';
import type { AuthUser } from '../lib/auth';

interface ChapterCell {
  id: string;
  title: string;
  index: number;
  status: 'active' | 'locked' | 'complete';
}

interface Course {
  key: string;
  exam: string;
  subject: string;
  title: string;
  passed: number;
  total: number;
  pct: number;
  chapters: ChapterCell[];
}

/**
 * The main page. A progress header (per-course completion %) sits above the full node layout for
 * every math course, stacked vertically. Clicking a chapter routes into it — but if the learner is
 * logged out, App intercepts and opens the auth modal first.
 */
export default function Home({
  learnerId,
  apiBase,
  user,
  onPickChapter,
  onTakePaper,
  onLoginClick,
  onLogout,
}: {
  learnerId: string;
  apiBase: string;
  user: AuthUser | null;
  onPickChapter: (exam: string, subject: string, chapterId: string) => void;
  onTakePaper: (exam: string, subject: string) => void;
  onLoginClick: () => void;
  onLogout: () => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/learner/${learnerId}/home`)
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [learnerId, apiBase]);

  return (
    <div className="home">
      <header className="home-top">
        <div className="home-brand">
          <span className="home-logo">∑</span>
          <div>
            <div className="home-title">Bottom-Up · Maths</div>
            <div className="home-tag">Build it up, concept by concept — then sit one clean exam.</div>
          </div>
        </div>
        <div className="home-account">
          {user ? (
            <>
              <span className="home-hi">Hi, <strong>{user.username}</strong></span>
              <button className="home-logout" onClick={onLogout}>Log out</button>
            </>
          ) : (
            <button className="home-login" onClick={onLoginClick}>Log in / Register</button>
          )}
        </div>
      </header>

      {/* Progress tracker: one card per course with its completion %. */}
      <section className="prog-strip">
        {loading
          ? <div className="prog-loading">Loading your progress…</div>
          : courses.map((c) => (
              <div key={c.key} className="prog-card">
                <Ring pct={c.pct} />
                <div className="prog-meta">
                  <div className="prog-name">{c.title}</div>
                  <div className="prog-count">{c.passed} / {c.total} nodes</div>
                </div>
              </div>
            ))}
      </section>

      {!user && !loading && (
        <div className="home-cta">Browse the full map below. Open a chapter to start — you'll be asked to make a quick account first.</div>
      )}

      {/* The full node layout for every course, stacked. */}
      {courses.map((c) => (
        <section key={c.key} className="course-block">
          <div className="course-head">
            <h2>{c.title} <span className="course-chcount">— {c.chapters.length} chapters</span></h2>
            <span className="course-pct">{c.pct}% complete</span>
          </div>

          <div className="map">
            {c.chapters.map((ch) => {
              const visual = ch.status === 'complete' ? 'done' : ch.status === 'active' ? 'available' : 'locked';
              return (
                <div
                  key={ch.id}
                  className={`c ${visual}`}
                  onClick={() => ch.status !== 'locked' && onPickChapter(c.exam, c.subject, ch.id)}
                  title={ch.title}
                >
                  <div className="dot">{ch.status === 'complete' ? '' : ch.index}</div>
                  <div className="nm">{ch.title}</div>
                </div>
              );
            })}
          </div>

          <div className="legend">
            <span className="l-done">done</span>
            <span className="l-now">you're here</span>
            <span className="l-lock">locked</span>
          </div>

          <button className="take-paper-btn" onClick={() => onTakePaper(c.exam, c.subject)}>
            📝 Sit a past board paper — then revise what you miss →
          </button>
        </section>
      ))}
    </div>
  );
}

/** Small circular % indicator drawn with a conic-gradient. */
function Ring({ pct }: { pct: number }) {
  return (
    <div
      className="ring"
      style={{ background: `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--accent-soft) 0deg)` }}
    >
      <div className="ring-hole">{pct}%</div>
    </div>
  );
}

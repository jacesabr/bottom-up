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
  who?: string;
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
          {c.who && <p className="course-who">{c.who}</p>}

          {c.exam === 'scratch' ? (
            <ClassLadder course={c} onPick={onPickChapter} />
          ) : (
            <>
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
                <span className="l-lock">to do</span>
              </div>

              {/* Papers are always open: a student can browse the exam questions and jump from any
                  one straight to the concept's nodes to refresh — no need to finish the course first. */}
              <button className="take-paper-btn" onClick={() => onTakePaper(c.exam, c.subject)}>
                📝 Sit a past exam paper — jump from any question to its concept to revise →
              </button>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * The "Learn from Scratch" class ladder — a glowing slideshow of class levels you climb. Highest class
 * sits at the top; tap any rung to jump straight into that class (we assume prior mastery and refresh
 * what's needed). Every rung is open — you can start at Kindergarten or jump up toward Grade 11 level.
 */
function ClassLadder({
  course,
  onPick,
}: {
  course: Course;
  onPick: (exam: string, subject: string, chapterId: string) => void;
}) {
  // Server returns chapters low→high (Kindergarten first). A ladder climbs upward, so render top→bottom.
  const rungs = [...course.chapters].reverse();
  return (
    <div className="class-ladder">
      <div className="ladder-rail" />
      {rungs.map((ch) => (
        <button
          key={ch.id}
          className={`rung ${ch.status === 'complete' ? 'done' : 'open'}`}
          onClick={() => onPick(course.exam, course.subject, ch.id)}
          title={`Start ${ch.title}`}
        >
          <span className="rung-no">{ch.status === 'complete' ? '✓' : ch.index}</span>
          <span className="rung-name">{ch.title.replace(' · Maths', '')}</span>
          <span className="rung-go">Start →</span>
        </button>
      ))}
      <div className="ladder-hint">Climb to any class — start where you like; we'll refresh whatever you need.</div>
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

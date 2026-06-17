import { useEffect, useState } from 'react';
import './App.css';
import Home from './components/Home';
import AdminDashboard from './components/AdminDashboard';
import Documentation from './components/Documentation';
import AuthModal from './components/AuthModal';
import ChapterMap from './components/ChapterMap';
import NodeView from './components/NodeView';
import PaperView from './components/PaperView';
import { getStoredUser, clearUser, type AuthUser } from './lib/auth';

// Prod bakes in VITE_API_URL (render.yaml). In dev, fall back to the relative '/api' so requests go
// through Vite's proxy (vite.config.ts → API_PORT) — no hardcoded port that can drift from the API.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

type View = 'home' | 'nodes' | 'node' | 'paper';

// Anonymous browsing id (so the home map renders before login). Once logged in, the account's user
// id IS the learnerId, so all progress ties to the account.
function anonId(): string {
  const id = localStorage.getItem('learnerId');
  const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (isUuid) return id as string;
  const newId = crypto.randomUUID();
  localStorage.setItem('learnerId', newId);
  return newId;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [anon] = useState(anonId);
  const learnerId = user?.id ?? anon;

  const [view, setView] = useState<View>('home');
  const [exam, setExam] = useState('cbse10');
  const [subject, setSubject] = useState('maths');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);

  // Auth gate: a logged-out learner who clicks a chapter gets the modal first. We stash the intended
  // destination and replay it after a successful login/register.
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  // Hash routes: #admin (operator dashboard, basic-auth) and #docs (documentation hub).
  const [route, setRoute] = useState(() => (typeof location !== 'undefined' ? location.hash : ''));
  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (route === '#admin') {
    return (
      <div className="app">
        <main className="app-main">
          <AdminDashboard apiBase={API_BASE} />
        </main>
      </div>
    );
  }
  if (route === '#docs') {
    return (
      <div className="app">
        <main className="app-main">
          <Documentation onBack={() => { location.hash = ''; }} />
        </main>
      </div>
    );
  }

  const goChapter = (e: string, s: string, id: string) => {
    setExam(e);
    setSubject(s);
    setChapterId(id);
    setView('nodes');
  };

  const handlePickChapter = (e: string, s: string, id: string) => {
    if (!user) {
      setPendingNav(() => () => goChapter(e, s, id));
      setAuthOpen(true);
      return;
    }
    goChapter(e, s, id);
  };

  const handleTakePaper = (e: string, s: string) => {
    if (!user) {
      setPendingNav(() => () => { setExam(e); setSubject(s); setView('paper'); });
      setAuthOpen(true);
      return;
    }
    setExam(e);
    setSubject(s);
    setView('paper');
  };

  const onAuthed = (u: AuthUser) => {
    setUser(u);
    setAuthOpen(false);
    const next = pendingNav;
    setPendingNav(null);
    if (next) next();
  };

  const onLogout = () => {
    clearUser();
    setUser(null);
    setView('home');
  };

  return (
    <div className="app">
      <main className="app-main">
        {view === 'home' && (
          <Home
            learnerId={learnerId}
            apiBase={API_BASE}
            user={user}
            onPickChapter={handlePickChapter}
            onTakePaper={handleTakePaper}
            onLoginClick={() => { setPendingNav(null); setAuthOpen(true); }}
            onLogout={onLogout}
          />
        )}

        {view === 'paper' && (
          <PaperView
            learnerId={learnerId}
            exam={exam}
            subject={subject}
            apiBase={API_BASE}
            onBack={() => setView('home')}
            onRevise={(cId, chId) => {
              setChapterId(chId);
              setConceptId(cId);
              setView('node');
            }}
          />
        )}

        {view === 'nodes' && chapterId && (
          <ChapterMap
            learnerId={learnerId}
            chapterId={chapterId}
            apiBase={API_BASE}
            onNodeClick={(id) => {
              setConceptId(id);
              setView('node');
            }}
            onBack={() => setView('home')}
          />
        )}

        {view === 'node' && conceptId && (
          <NodeView
            learnerId={learnerId}
            conceptId={conceptId}
            apiBase={API_BASE}
            onBack={() => setView('nodes')}
          />
        )}
      </main>

      {authOpen && (
        <AuthModal
          apiBase={API_BASE}
          onAuthed={onAuthed}
          onClose={() => { setAuthOpen(false); setPendingNav(null); }}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import './App.css';
import ExamSelect from './components/ExamSelect';
import SubjectSelect from './components/SubjectSelect';
import ChapterList from './components/ChapterList';
import ChapterMap from './components/ChapterMap';
import NodeView from './components/NodeView';
import PaperView from './components/PaperView';

// Prod bakes in VITE_API_URL (render.yaml). In dev, fall back to the relative '/api' so requests go
// through Vite's proxy (vite.config.ts → API_PORT) — no hardcoded port that can drift from the API.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

type View = 'exam' | 'subject' | 'chapters' | 'nodes' | 'node' | 'paper';

export default function App() {
  const [learnerId] = useState(() => {
    const id = localStorage.getItem('learnerId');
    const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) return id as string;
    const newId = crypto.randomUUID();
    localStorage.setItem('learnerId', newId);
    return newId;
  });

  const [view, setView] = useState<View>('exam');
  const [exam, setExam] = useState('cbse10');
  const [subject, setSubject] = useState('maths');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);

  return (
    <div className="app">
      <main className="app-main">
        {view === 'exam' && (
          <ExamSelect
            onSelect={(e) => {
              setExam(e);
              setView('subject');
            }}
          />
        )}

        {view === 'subject' && (
          <SubjectSelect
            exam={exam}
            onBack={() => setView('exam')}
            onSelect={(s) => {
              setSubject(s);
              setView('chapters');
            }}
          />
        )}

        {view === 'chapters' && (
          <ChapterList
            learnerId={learnerId}
            exam={exam}
            subject={subject}
            apiBase={API_BASE}
            onPick={(id) => {
              setChapterId(id);
              setView('nodes');
            }}
            onTakePaper={() => setView('paper')}
            onBack={() => setView('subject')}
          />
        )}

        {view === 'paper' && (
          <PaperView
            learnerId={learnerId}
            exam={exam}
            subject={subject}
            apiBase={API_BASE}
            onBack={() => setView('chapters')}
            onRevise={(conceptId, chapterId) => {
              setChapterId(chapterId);
              setConceptId(conceptId);
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
            onBack={() => setView('chapters')}
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
    </div>
  );
}

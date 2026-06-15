import { useState, useEffect } from 'react';
import './App.css';
import ChapterView from './components/ChapterView';
import NodeView from './components/NodeView';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3030/api';

export default function App() {
  const [learnerId] = useState(() => {
    const id = localStorage.getItem('learnerId');
    if (id) return id;
    const newId = 'learner-' + Math.random().toString(36).slice(2);
    localStorage.setItem('learnerId', newId);
    return newId;
  });

  const [view, setView] = useState<'chapter' | 'node'>('chapter');
  const [currentConceptId, setCurrentConceptId] = useState<string | null>(null);
  const [chapterId] = useState('cbse10:maths:jemh101');

  const handleNodeClick = (conceptId: string) => {
    setCurrentConceptId(conceptId);
    setView('node');
  };

  const handleBackToChapter = () => {
    setView('chapter');
    setCurrentConceptId(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Bottom-Up Exam Prep</h1>
        <p className="learner-id">Learner: {learnerId.slice(0, 12)}</p>
      </header>

      <main className="app-main">
        {view === 'chapter' && (
          <ChapterView
            learnerId={learnerId}
            chapterId={chapterId}
            onNodeClick={handleNodeClick}
            apiBase={API_BASE}
          />
        )}

        {view === 'node' && currentConceptId && (
          <NodeView
            learnerId={learnerId}
            conceptId={currentConceptId}
            onBack={handleBackToChapter}
            apiBase={API_BASE}
          />
        )}
      </main>
    </div>
  );
}

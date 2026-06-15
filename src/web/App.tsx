import { useState, useEffect } from 'react';
import './App.css';
import SubjectSelect from './components/SubjectSelect';
import ChapterMap from './components/ChapterMap';
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

  const [view, setView] = useState<'subject' | 'chapters' | 'node'>('subject');
  const [currentExam, setCurrentExam] = useState<string | null>(null);
  const [currentSubject, setCurrentSubject] = useState<string | null>(null);
  const [currentConceptId, setCurrentConceptId] = useState<string | null>(null);

  const handleSubjectSelect = (exam: string, subject: string) => {
    setCurrentExam(exam);
    setCurrentSubject(subject);
    setView('chapters');
  };

  const handleNodeClick = (conceptId: string) => {
    setCurrentConceptId(conceptId);
    setView('node');
  };

  const handleBackToChapters = () => {
    setView('chapters');
    setCurrentConceptId(null);
  };

  const handleBackToSubject = () => {
    setView('subject');
    setCurrentExam(null);
    setCurrentSubject(null);
  };

  return (
    <div className="app">
      <main className="app-main">
        {view === 'subject' && (
          <SubjectSelect onSelect={handleSubjectSelect} />
        )}

        {view === 'chapters' && currentExam && currentSubject && (
          <ChapterMap
            learnerId={learnerId}
            exam={currentExam}
            subject={currentSubject}
            onNodeClick={handleNodeClick}
            onBack={handleBackToSubject}
            apiBase={API_BASE}
          />
        )}

        {view === 'node' && currentConceptId && (
          <NodeView
            learnerId={learnerId}
            conceptId={currentConceptId}
            onBack={handleBackToChapters}
            apiBase={API_BASE}
          />
        )}
      </main>
    </div>
  );
}

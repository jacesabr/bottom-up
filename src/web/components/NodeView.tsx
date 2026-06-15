import { useEffect, useState } from 'react';
import '../styles/NodeView.css';

interface Checklist {
  keyMoveIndex: number;
  demonstrated: boolean;
}

interface NodeViewProps {
  learnerId: string;
  conceptId: string;
  onBack: () => void;
  apiBase: string;
}

type ViewPhase = 'intro' | 'teaching' | 'gate' | 'complete';

export default function NodeView({ learnerId, conceptId, onBack, apiBase }: NodeViewProps) {
  const [phase, setPhase] = useState<ViewPhase>('intro');
  const [concept, setConcept] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogue, setDialogue] = useState<Array<{ role: 'tutor' | 'learner'; message: string }>>([]);
  const [checklist, setChecklist] = useState<Checklist[]>([]);
  const [allKeyMovesDemonstrated, setAllKeyMovesDemonstrated] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [inputLoading, setInputLoading] = useState(false);

  const [gate, setGate] = useState<any>(null);
  const [gateAnswer, setGateAnswer] = useState('');
  const [gateResult, setGateResult] = useState<any>(null);

  useEffect(() => {
    const fetchConcept = async () => {
      try {
        // Hardcode concept data from the content for now
        const concepts = [
          {
            id: 'cbse10:maths:jemh101:know-prime-composite-coprime',
            slug: 'know-prime-composite-coprime',
            title: 'Recognise coprime integers (common factor only 1) and the prime/composite distinction',
            role: 'bedrock',
            sec: 2,
            order: 1,
            brief: 'Coprime numbers share no common factor other than 1; factorisation targets composites and produces primes.',
            explanation: 'The irrationality proofs rely on writing a fraction in coprime form: a and b are coprime means their only common factor is 1.',
            keyMoves: [
              'Recognise coprime pairs (only common factor is 1, i.e. HCF = 1)',
              'Reduce a fraction to coprime numerator and denominator',
              "Use 'product of primes' as the goal of factorising a composite",
            ],
          },
          {
            id: 'cbse10:maths:jemh101:prime-factorise-integer',
            title: 'Factorise a composite number into a product of primes',
            role: 'intermediate',
            order: 2,
            brief: 'Break a positive integer into prime factors using a factor tree.',
            keyMoves: [
              'Divide out the smallest prime repeatedly via a factor tree',
              'Continue until every leaf is prime',
              'Combine repeated primes into powers and order ascending',
            ],
          },
          {
            id: 'cbse10:maths:jemh101:state-fundamental-theorem-arithmetic',
            title: 'State the Fundamental Theorem of Arithmetic',
            role: 'intermediate',
            order: 3,
            brief: 'Know that every composite number factorises as a product of primes uniquely.',
            keyMoves: [
              'State existence: every composite is a product of primes',
              'State uniqueness: only one factorisation, ignoring order',
              'Recognise uniqueness as the deductive tool',
            ],
          },
        ];

        const foundConcept = concepts.find(c => c.id === conceptId);
        if (foundConcept) {
          setConcept(foundConcept);
          setChecklist(foundConcept.keyMoves.map((_, index) => ({ keyMoveIndex: index, demonstrated: false })));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchConcept();
  }, [conceptId]);

  const handleEnterNode = async () => {
    try {
      setInputLoading(true);
      await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/enter`, { method: 'POST' });
      const res = await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/tutor-turn`, { method: 'POST' });
      const data = await res.json();
      setDialogue([{ role: 'tutor', message: data.message }]);
      setPhase('teaching');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enter node');
    } finally {
      setInputLoading(false);
    }
  };

  const handleLearnerReply = async () => {
    if (!userInput.trim()) return;

    try {
      setInputLoading(true);
      const newDialogue = [...dialogue, { role: 'learner', message: userInput }];
      setDialogue(newDialogue);
      setUserInput('');

      const res = await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/learner-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput }),
      });

      const data = await res.json();
      setChecklist(data.checklist);
      setAllKeyMovesDemonstrated(data.allKeyMovesDemonstrated);

      if (data.allKeyMovesDemonstrated) {
        const gateRes = await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/gate`, { method: 'POST' });
        const gateData = await gateRes.json();
        setGate(gateData);
        setPhase('gate');
      } else {
        // Get next tutor message
        const tutorRes = await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/tutor-turn`, { method: 'POST' });
        const tutorData = await tutorRes.json();
        newDialogue.push({ role: 'tutor', message: tutorData.message });
        setDialogue([...newDialogue]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process reply');
    } finally {
      setInputLoading(false);
    }
  };

  const handleGateAnswer = async () => {
    if (!gateAnswer.trim()) return;

    try {
      setInputLoading(true);
      const res = await fetch(`${apiBase}/learner/${learnerId}/node/${conceptId}/gate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId: gate.gateId, answer: gateAnswer }),
      });

      const data = await res.json();
      setGateResult(data);

      if (data.correct) {
        setPhase('complete');
      } else {
        // Return to teaching
        setPhase('teaching');
        setGateAnswer('');
        setChecklist(checklist.map(c => ({ ...c, demonstrated: false })));
        setAllKeyMovesDemonstrated(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grade answer');
    } finally {
      setInputLoading(false);
    }
  };

  if (loading) return <div className="node-view loading">Loading concept...</div>;
  if (error) return <div className="node-view error">Error: {error}</div>;

  return (
    <div className="node-view">
      <button className="back-button" onClick={onBack}>← Back to Chapter</button>

      <div className="node-header">
        <h2>{concept?.title}</h2>
        <p className="node-brief">{concept?.brief}</p>
      </div>

      {phase === 'intro' && (
        <div className="intro-panel">
          <div className="intro-content">
            <h3>Ready to learn?</h3>
            <p>In this node, you'll learn:</p>
            <ul>
              {concept?.keyMoves.map((move, idx) => (
                <li key={idx}>{move}</li>
              ))}
            </ul>
            <button onClick={handleEnterNode} disabled={inputLoading} className="btn-primary">
              {inputLoading ? 'Starting...' : 'Start Learning'}
            </button>
          </div>
        </div>
      )}

      {phase === 'teaching' && (
        <div className="teaching-panel">
          <div className="dialogue-area">
            {dialogue.map((msg, idx) => (
              <div key={idx} className={`dialogue-message ${msg.role}`}>
                <div className="message-label">{msg.role === 'tutor' ? 'Tutor' : 'You'}</div>
                <div className="message-text">{msg.message}</div>
              </div>
            ))}
          </div>

          <div className="checklist">
            <h4>Key ideas to show:</h4>
            {checklist.map((item, idx) => (
              <div key={idx} className={`checklist-item ${item.demonstrated ? 'done' : ''}`}>
                <input type="checkbox" checked={item.demonstrated} readOnly />
                <span>{concept?.keyMoves[item.keyMoveIndex]}</span>
              </div>
            ))}
          </div>

          <div className="input-area">
            <textarea
              placeholder="Share your thoughts or answer..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={inputLoading}
            />
            <button onClick={handleLearnerReply} disabled={inputLoading || !userInput.trim()} className="btn-primary">
              {inputLoading ? 'Processing...' : 'Reply'}
            </button>
          </div>
        </div>
      )}

      {phase === 'gate' && (
        <div className="gate-panel">
          <h3>Gate Question</h3>
          <p className="gate-prompt">{gate?.prompt}</p>

          {gate?.options && (
            <div className="gate-options">
              {gate.options.map((option, idx) => (
                <label key={idx} className="gate-option">
                  <input
                    type="radio"
                    name="gate-answer"
                    value={option}
                    checked={gateAnswer === option}
                    onChange={(e) => setGateAnswer(e.target.value)}
                    disabled={inputLoading}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}

          {gate?.answerType === 'symbolic' && (
            <input
              type="text"
              placeholder="e.g., 2^3 * 3^2 * 5 * 7 * 13"
              value={gateAnswer}
              onChange={(e) => setGateAnswer(e.target.value)}
              disabled={inputLoading}
              className="gate-input"
            />
          )}

          <button onClick={handleGateAnswer} disabled={inputLoading || !gateAnswer.trim()} className="btn-primary">
            {inputLoading ? 'Checking...' : 'Submit'}
          </button>

          {gateResult && (
            <div className={`gate-result ${gateResult.correct ? 'pass' : 'fail'}`}>
              {gateResult.message}
            </div>
          )}
        </div>
      )}

      {phase === 'complete' && (
        <div className="complete-panel">
          <h3>Great work! 🎉</h3>
          <p>You've passed this concept.</p>
          <button onClick={onBack} className="btn-primary">
            Back to Chapter
          </button>
        </div>
      )}
    </div>
  );
}

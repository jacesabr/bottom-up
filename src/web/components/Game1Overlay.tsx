import { type RefObject, useEffect, useMemo, useState } from 'react';
import '../styles/Game1Overlay.css';

type ChoicePuzzle = {
  title: string;
  prompt: string;
  hint?: string;
  choices: string[];
  answer?: number;
  ok?: string;
};

type Stage = 'menu' | 'boot' | 'questions' | 'check' | 'note' | 'ending';

const games = [
  'Land of Ecodelia',
  'The Fractured Parallel',
  'Void Nexus',
  'Dreams of the Forgotten',
  'Echoes of the Unknown',
  'The Simulacrum',
];

const questions: ChoicePuzzle[] = [
  { title: 'QUESTION 01', prompt: 'Voce ja chorou durante o sexo?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 02', prompt: 'Voce ja fantasiou sobre matar seu pai?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 03', prompt: 'Voce ja teve medo de perder tudo o que ama?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 04', prompt: 'Se a tecnologia pudesse prever sua morte, voce gostaria de saber?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 05', prompt: 'Voce ja sentiu que a humanidade esta perto do fim?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 06', prompt: 'Voce sacrificaria uma vida para salvar milhoes?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 07', prompt: 'Voce acredita que somos observados?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 08', prompt: 'Se pudesse apagar uma memoria, voce faria isso?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 09', prompt: 'Voce acha que merece ser feliz?', choices: ['Sim', 'Nao'] },
  { title: 'QUESTION 10', prompt: 'A chave esta na sala?', choices: ['Sim', 'Nao'] },
];

const hiddenMessages: Record<number, string> = {
  3: 'O simbolo de um olho aparece brevemente na tela.',
  5: 'Voce ouve um sussurro: "Nos estamos observando..."',
  8: 'Um triangulo com um olho aparece no canto inferior direito.',
};

const bootPuzzles: ChoicePuzzle[] = [
  {
    title: '// SYSTEM LOCK - VERIFY OPERATOR //',
    prompt: 'To load the disk, evaluate the prime power: 3^2',
    hint: '3^2 means 3 x 3 (NOT 3 x 2)',
    choices: ['6', '5', '9', '8'],
    answer: 2,
    ok: 'ACCESS GRANTED. The disk spins up...',
  },
];

const checkPuzzles: ChoicePuzzle[] = [
  {
    title: '// CALIBRATING... DO NOT LOOK AWAY //',
    prompt: 'Resolve the product into one integer: 2^3 x 3^2',
    hint: 'Evaluate each power first: 8 x 9. Do NOT add exponents.',
    choices: ['6^5', '72', '30', '48'],
    answer: 1,
    ok: 'CALIBRATION HELD. Continue.',
  },
  {
    title: '// CALIBRATING... THE WATER IS DROPPING //',
    prompt: 'Resolve the product into one integer: 2^3 x 3^2 x 5',
    hint: 'Take the 72 you found, then multiply by 5.',
    choices: ['180', '360', '450', '720'],
    answer: 1,
    ok: 'CALIBRATION HELD. Continue.',
  },
];

const notePuzzles: ChoicePuzzle[] = [
  {
    title: '// THE NOTE IS ENCRYPTED - KEY 1/2 //',
    prompt: 'Two numbers share prime 2 as 2^2 and 2^3. Which exponent goes in their HCF?',
    hint: 'HCF takes the SMALLEST exponent of a shared prime.',
    choices: ['2^2', '2^3', '2^5', '2^1'],
    answer: 0,
    ok: 'Half the note clears...',
  },
  {
    title: '// THE NOTE IS ENCRYPTED - KEY 2/2 //',
    prompt: 'Same primes, 2^2 and 2^3. Which exponent goes in their LCM?',
    hint: 'LCM takes the GREATEST exponent of a shared prime.',
    choices: ['2^2', '2^1', '2^3', '2^5'],
    answer: 2,
    ok: 'The note resolves fully.',
  },
];

const endingText = [
  'A cifra cede. O bilhete finalmente se revela:',
  '"Voce decifrou as chaves. Eram primos o tempo todo."',
  'Um holograma de um olho observa cada movimento seu.',
  'A voz ecoa: "Agora voce sabe ler o que estava escondido."',
  'De repente, tudo ao seu redor comeca a desaparecer...',
  '"Nao somos nada alem de nossas escolhas."',
  '"Voce estava preparado para fazer as suas?"',
];

export default function Game1Overlay({
  audioBlocked,
  audioRef,
  onAudioBlockedChange,
  onClose,
}: {
  audioBlocked: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  onAudioBlockedChange: (blocked: boolean) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>('menu');
  const [menuIndex, setMenuIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [checkIndex, setCheckIndex] = useState(0);
  const [noteIndex, setNoteIndex] = useState(0);
  const [feedback, setFeedback] = useState('');

  const activePuzzle = useMemo(() => {
    if (stage === 'boot') return bootPuzzles[0];
    if (stage === 'check') return checkPuzzles[checkIndex];
    if (stage === 'note') return notePuzzles[noteIndex];
    if (stage === 'questions') return questions[questionIndex];
    return null;
  }, [checkIndex, noteIndex, questionIndex, stage]);

  const startAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.volume = 0.6;
      await audio.play();
      onAudioBlockedChange(false);
    } catch {
      onAudioBlockedChange(true);
    }
  };

  useEffect(() => {
    startAudio();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        const audio = audioRef.current;
        if (audio) audio.muted = !audio.muted;
        return;
      }
      if (event.key === 'ArrowUp') {
        move(-1);
      } else if (event.key === 'ArrowDown') {
        move(1);
      } else if (event.key === 'Enter') {
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const resetChoice = () => {
    setChoiceIndex(0);
    setFeedback('');
  };

  const move = (delta: number) => {
    if (stage === 'ending') return;
    const count = stage === 'menu' ? games.length : activePuzzle?.choices.length ?? 0;
    if (!count) return;
    if (stage === 'menu') {
      setMenuIndex((index) => (index + delta + count) % count);
    } else {
      setChoiceIndex((index) => (index + delta + count) % count);
    }
  };

  const enterGame = () => {
    if (menuIndex !== 0) {
      setFeedback('Este jogo ainda nao esta disponivel.');
      return;
    }
    setStage('boot');
    resetChoice();
  };

  const passPuzzle = (next: () => void) => {
    const message = activePuzzle?.ok ? `CORRECT. ${activePuzzle.ok}` : 'CORRECT.';
    setFeedback(message);
    window.setTimeout(() => {
      next();
      resetChoice();
    }, 750);
  };

  const submit = (choiceOverride = choiceIndex) => {
    if (stage === 'menu') {
      enterGame();
      return;
    }
    if (!activePuzzle) return;

    if (stage === 'questions') {
      const nextIndex = questionIndex + 1;
      if (questionIndex === 2 || questionIndex === 6) {
        setCheckIndex(questionIndex === 2 ? 0 : 1);
        setStage('check');
        resetChoice();
      } else if (nextIndex < questions.length) {
        setQuestionIndex(nextIndex);
        resetChoice();
      } else {
        setStage('note');
        setNoteIndex(0);
        resetChoice();
      }
      return;
    }

    if (choiceOverride !== activePuzzle.answer) {
      setFeedback('WRONG. Re-read the hint and retry.');
      return;
    }

    if (stage === 'boot') {
      passPuzzle(() => setStage('questions'));
    } else if (stage === 'check') {
      passPuzzle(() => {
        setQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
        setStage('questions');
      });
    } else if (stage === 'note') {
      passPuzzle(() => {
        if (noteIndex < notePuzzles.length - 1) setNoteIndex((index) => index + 1);
        else setStage('ending');
      });
    }
  };

  const restart = () => {
    setStage('menu');
    setMenuIndex(0);
    setQuestionIndex(0);
    setCheckIndex(0);
    setNoteIndex(0);
    resetChoice();
    startAudio();
  };

  return (
    <div className="game1-overlay" role="dialog" aria-modal="true" aria-label="Land of Ecodelia">
      <button className="game1-close" type="button" onClick={onClose} aria-label="Close game">Close</button>

      <div className="game1-scanlines" />
      <main className="game1-terminal" onClick={audioBlocked ? startAudio : undefined}>
        {audioBlocked && <div className="game1-audio">Click anywhere to start sound</div>}

        {stage === 'menu' && (
          <>
            <h1>ARCADE OF REALITIES</h1>
            <p className="game1-subtitle">Selecione um jogo usando as setas</p>
            <div className="game1-list">
              {games.map((game, index) => (
                <button
                  key={game}
                  type="button"
                  className={index === menuIndex ? 'selected' : ''}
                  onClick={() => {
                    setMenuIndex(index);
                    if (index === 0) enterGame();
                    else setFeedback('Este jogo ainda nao esta disponivel.');
                    startAudio();
                  }}
                >
                  <span>{index === menuIndex ? '>' : ' '}</span>
                  {game}
                </button>
              ))}
            </div>
            {feedback && <p className="game1-feedback bad">{feedback}</p>}
          </>
        )}

        {activePuzzle && stage !== 'menu' && stage !== 'ending' && (
          <>
            <h1>{activePuzzle.title}</h1>
            <p className="game1-prompt">{activePuzzle.prompt}</p>
            {activePuzzle.hint && <p className="game1-hint">{activePuzzle.hint}</p>}
            <div className="game1-list compact">
              {activePuzzle.choices.map((choice, index) => (
                <button
                  key={choice}
                  type="button"
                  className={index === choiceIndex ? 'selected' : ''}
                  onClick={() => {
                    setChoiceIndex(index);
                    submit(index);
                    startAudio();
                  }}
                >
                  <span>{index === choiceIndex ? '>' : ' '}</span>
                  {choice}
                </button>
              ))}
            </div>
            {stage === 'questions' && hiddenMessages[questionIndex] && (
              <p className="game1-hidden">{hiddenMessages[questionIndex]}</p>
            )}
            {feedback && <p className={`game1-feedback ${feedback.startsWith('WRONG') ? 'bad' : 'good'}`}>{feedback}</p>}
          </>
        )}

        {stage === 'ending' && (
          <>
            <h1>NOTE DECODED</h1>
            <div className="game1-ending">
              {endingText.map((line) => <p key={line}>{line}</p>)}
            </div>
            <div className="game1-actions">
              <button type="button" onClick={restart}>Voltar ao menu principal</button>
              <button type="button" onClick={onClose}>Sair</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

import { useEffect } from 'react';
import '../styles/GameOverlay.css';

// Each unlocked game is a self-contained static HTML doc served from /gameN/.
// We load it in an iframe rather than porting its engine to React. One overlay
// serves every game — pass the entry url + title.
export default function GameOverlay({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button className="game-overlay-close" type="button" onClick={onClose} aria-label="Close game">
        Close
      </button>
      <iframe
        className="game-overlay-frame"
        src={src}
        title={title}
        allow="autoplay; fullscreen; gamepad; pointer-lock"
      />
    </div>
  );
}

import { useEffect } from 'react';
import '../styles/ExitGameOverlay.css';

// The eXit game is a self-contained HTML doc (inline CSS/JS + Web Audio synth)
// served from /game1/exit.html. We load it in an iframe rather than porting its
// vanilla-JS terminal engine to React.
export default function ExitGameOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="exit-overlay" role="dialog" aria-modal="true" aria-label="eXit">
      <button className="exit-close" type="button" onClick={onClose} aria-label="Close game">
        Close
      </button>
      <iframe className="exit-frame" src="/game1/exit.html" title="eXit" />
    </div>
  );
}

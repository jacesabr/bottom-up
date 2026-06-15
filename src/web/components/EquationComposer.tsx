import { useState, useRef, useEffect } from 'react';
import { renderMath } from '../lib/MathText';
import '../styles/EquationComposer.css';

/**
 * Lightweight equation composer: type LaTeX, see a live KaTeX render, insert into the reply.
 * Quick-keys cover the common CBSE-maths notation (powers, roots, fractions, ×, ·).
 * (Socratic uses MathLive; this keeps the same "Insert notation" affordance without the
 * heavy web-component dependency — good enough for the prototype.)
 */
const QUICK: Array<[label: string, snippet: string]> = [
  ['x²', '^{2}'],
  ['xⁿ', '^{n}'],
  ['√', '\\sqrt{}'],
  ['ⁿ√', '\\sqrt[n]{}'],
  ['a/b', '\\frac{a}{b}'],
  ['×', '\\times '],
  ['·', '\\cdot '],
  ['≠', '\\neq '],
  ['≤', '\\leq '],
  ['≥', '\\geq '],
  ['π', '\\pi '],
  ['°', '^{\\circ}'],
];

export default function EquationComposer({
  onInsert,
  onClose,
}: {
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const insertToken = (snippet: string) => {
    const el = ref.current;
    if (!el) {
      setRaw((v) => v + snippet);
      return;
    }
    const s = el.selectionStart ?? raw.length;
    const e = el.selectionEnd ?? raw.length;
    const next = raw.slice(0, s) + snippet + raw.slice(e);
    setRaw(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = s + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const commit = () => {
    const out = raw.trim();
    if (out) onInsert(`$${out}$`); // wrap so MathText renders it in the bubble
    setRaw('');
    onClose();
  };

  const preview = raw.trim() ? renderMath(raw, false) : '';

  return (
    <div className="eq-composer">
      <div className="eq-head">
        <span className="eq-title">∑ Equation</span>
        <span className="eq-hint">type LaTeX — it renders below, then insert</span>
      </div>

      <div className="eq-preview">
        {preview ? (
          <span dangerouslySetInnerHTML={{ __html: preview }} />
        ) : (
          <span className="eq-placeholder">live preview…</span>
        )}
      </div>

      <input
        ref={ref}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="e.g. 2^3 \cdot 3^2 \cdot 5"
        className="eq-input"
      />

      <div className="eq-keys">
        {QUICK.map(([label, snippet]) => (
          <button key={label} className="eq-key" onClick={() => insertToken(snippet)} type="button">
            {label}
          </button>
        ))}
      </div>

      <div className="eq-actions">
        <button className="eq-cancel" onClick={onClose} type="button">Cancel</button>
        <button className="eq-insert" onClick={commit} type="button">Insert into reply →</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

/**
 * Claude-Code-style "working" indicator: a cycling sparkle glyph + a rotating whimsical gerund
 * (Noodling… Effecting… …) and an elapsed-seconds counter. Replaces the plain "thinking…" text
 * while the tutor turn is being generated.
 */
const GLYPHS = ['✶', '✸', '✺', '✷', '✦', '✳'];
const WORDS = [
  'Noodling', 'Percolating', 'Effecting', 'Ruminating', 'Conjuring', 'Pondering',
  'Marinating', 'Finagling', 'Cogitating', 'Tinkering', 'Untangling', 'Distilling',
  'Mulling', 'Calibrating', 'Simmering', 'Synthesizing', 'Wrangling', 'Brewing',
  'Schlepping', 'Deliberating',
];
const rand = (a: string[]) => a[Math.floor(Math.random() * a.length)];

export default function ThinkingIndicator() {
  const [g, setG] = useState(0);
  const [word, setWord] = useState(() => rand(WORDS));
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const gi = setInterval(() => setG((i) => (i + 1) % GLYPHS.length), 130);
    const wi = setInterval(() => setWord(rand(WORDS)), 2600);
    const ti = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { clearInterval(gi); clearInterval(wi); clearInterval(ti); };
  }, []);
  return (
    <div className="thinking" aria-live="polite">
      <span className="thinking-star">{GLYPHS[g]}</span>
      <span className="thinking-word">{word}…</span>
      {secs >= 1 && <span className="thinking-secs">({secs}s)</span>}
    </div>
  );
}

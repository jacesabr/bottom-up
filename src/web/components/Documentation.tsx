import { useState } from 'react';
import '../styles/Documentation.css';

/**
 * Documentation hub — a left tab rail + content pane (socratic's Documentation layout), each tab an
 * iframe to a self-contained page in /public. "How it works" is Sarthi's build-up method; "Why Sarthi"
 * is the Socratic–Feynman philosophy; "For investors" is the (now public) seed pitch.
 */
const TABS = [
  { id: 'how', label: 'How it works', hint: 'the build-up method — concept by concept, gated', src: '/how-it-works.html' },
  { id: 'why', label: 'Why Sarthi', hint: 'the Socratic–Feynman idea behind it', src: '/why-sarthi.html' },
  { id: 'invest', label: 'For investors', hint: 'the seed pitch', src: '/pitch.html' },
];

export default function Documentation({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="docs">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="docs-shell">
        <aside className="docs-nav">
          <div className="docs-nav-label">About Sarthi</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`docs-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <div className="docs-tab-label">{t.label}</div>
              <div className="docs-tab-hint">{t.hint}</div>
            </button>
          ))}
          <a className="docs-admin" href="#admin">Admin →</a>
        </aside>
        <div className="docs-content">
          <iframe key={active.id} title={active.label} src={active.src} className="docs-frame" />
        </div>
      </div>
    </div>
  );
}

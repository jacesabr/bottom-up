import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/Documentation.css';

/**
 * Documentation hub — a left tab rail + content pane (socratic's Documentation layout), each tab an
 * iframe to a self-contained page in /public. The iframe is auto-sized to its content height (same
 * origin) so the page scrolls as ONE document — no nested inner scrollbar.
 */
const TABS = [
  { id: 'how', label: 'How it works', hint: 'the build-up method — concept by concept, gated', src: '/how-it-works.html' },
  { id: 'why', label: 'Why Sarthi', hint: 'the Socratic–Feynman idea behind it', src: '/why-sarthi.html' },
  // 'For investors' (the seed pitch) is intentionally UNLISTED — still served, reachable only by direct URL: /pitch.html
];

export default function Documentation({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Size the iframe to its content so there's no inner scrollbar; the outer page scrolls instead.
  const fit = useCallback(() => {
    const f = frameRef.current;
    try {
      const doc = f?.contentWindow?.document;
      if (doc) f!.style.height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) + 'px';
    } catch {
      /* same-origin expected — ignore if not */
    }
  }, []);

  // Re-fit on window resize (content reflows → height changes). onLoad handles tab switches.
  useEffect(() => {
    window.addEventListener('resize', fit);
    const t = setInterval(fit, 1200); // catch late layout (fonts/images) for a couple seconds
    const stop = setTimeout(() => clearInterval(t), 3000);
    return () => { window.removeEventListener('resize', fit); clearInterval(t); clearTimeout(stop); };
  }, [fit]);

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
          <iframe ref={frameRef} key={active.id} title={active.label} src={active.src} className="docs-frame" onLoad={fit} scrolling="no" />
        </div>
      </div>
    </div>
  );
}

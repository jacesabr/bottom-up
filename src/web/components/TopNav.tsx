import '../styles/TopNav.css';

/**
 * The site-wide top tab bar. Always visible so learners can reach Documentation and operators can
 * reach the (locked) Admin panel. Tabs are hash routes handled by App: '' is the learn/home view,
 * the rest are #docs / #admin. Admin shows a 🔒 — it's Basic-auth gated server-side; the lock just
 * signals "staff only".
 */
type TabId = 'home' | 'docs' | 'admin';

const TABS: { id: TabId; label: string; hash: string; locked?: boolean }[] = [
  { id: 'home', label: 'Learn', hash: '' },
  { id: 'docs', label: 'Documentation', hash: '#docs' },
  { id: 'admin', label: 'Admin', hash: '#admin', locked: true },
];

export default function TopNav({ active }: { active: TabId }) {
  return (
    <nav className="topnav" aria-label="Primary">
      <a className="topnav-brand" href="#" onClick={() => { location.hash = ''; }}>
        <span className="topnav-logo">∑</span>
        <span className="topnav-name">Sarthi</span>
      </a>
      <div className="topnav-tabs">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.hash || '#'}
            className={`topnav-tab ${active === t.id ? 'active' : ''} ${t.locked ? 'locked' : ''}`}
            aria-current={active === t.id ? 'page' : undefined}
          >
            {t.label}
            {t.locked && <span className="topnav-lock" aria-label="staff only">🔒</span>}
          </a>
        ))}
      </div>
    </nav>
  );
}

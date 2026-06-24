import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/AdminDashboard.css';

/**
 * Operator dashboard at #admin. Gated by HTTP Basic auth (ADMIN_USER/ADMIN_PASSWORD on the API).
 * Credentials live only in sessionStorage (never the bundle). Read-only: totals, per-model LLM usage
 * (the NIM-vs-Haiku picture), conversation transcripts, and the raw-call log feeding the NIM study.
 */
export default function AdminDashboard({ apiBase }: { apiBase: string }) {
  const [auth, setAuth] = useState<string | null>(() => sessionStorage.getItem('adminAuth'));
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<'dashboard' | 'guide'>('dashboard');
  const [overview, setOverview] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [openConvo, setOpenConvo] = useState<any>(null);
  const [openError, setOpenError] = useState<any>(null);
  const [route, setRoute] = useState<any>(null);
  const [routing, setRouting] = useState(false);

  // System Guide tab: the living architecture doc. It is NOT a public static file — we fetch it
  // through the Basic-auth'd /admin/guide endpoint and render the HTML into a sandboxed iframe via
  // srcdoc, then size the iframe to its content so the page scrolls as one document.
  const [guideHtml, setGuideHtml] = useState<string | null>(null);
  const guideRef = useRef<HTMLIFrameElement>(null);
  const fitGuide = useCallback(() => {
    const f = guideRef.current;
    try {
      const doc = f?.contentWindow?.document;
      if (doc) f!.style.height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) + 'px';
    } catch {
      /* same-origin expected — ignore if not */
    }
  }, []);

  const authedFetch = useCallback(
    async (path: string) => {
      const res = await fetch(`${apiBase}/admin${path}`, { headers: { Authorization: `Basic ${auth}` } });
      if (res.status === 401) throw new Error('Wrong admin credentials.');
      if (res.status === 503) throw new Error('Admin not configured on the server (ADMIN_USER/ADMIN_PASSWORD).');
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    [apiBase, auth]
  );

  // Live router probe — hits the public /route endpoint (no admin auth needed) to show the current
  // speed×quality race operators can run on demand.
  const probeRouter = useCallback(async () => {
    setRouting(true);
    try {
      const res = await fetch(`${apiBase}/learner/admin-probe/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text' }) });
      setRoute(await res.json());
    } catch {
      setRoute({ error: true });
    } finally {
      setRouting(false);
    }
  }, [apiBase]);

  const load = useCallback(async () => {
    setErr(null);
    // Load each panel independently — a single slow/failed endpoint (e.g. the API mid-restart) must
    // not blank the whole dashboard.
    const [o, t, c, l, e] = await Promise.allSettled([
      authedFetch('/overview'),
      authedFetch('/traffic'),
      authedFetch('/conversations'),
      authedFetch('/llm-calls'),
      authedFetch('/errors'),
    ]);
    if (o.status === 'fulfilled') setOverview(o.value);
    if (t.status === 'fulfilled') setTraffic(t.value);
    if (c.status === 'fulfilled') setConversations(c.value.conversations ?? []);
    if (l.status === 'fulfilled') setCalls(l.value.calls ?? []);
    if (e.status === 'fulfilled') setErrors(e.value.errors ?? []);
    const fails = [o, t, c, l, e].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (fails.some((r) => String(r.reason).includes('credentials'))) {
      sessionStorage.removeItem('adminAuth');
      setAuth(null);
      setErr('Wrong admin credentials.');
    } else if (fails.length === 5) {
      setErr("Couldn't reach the admin API — it may be restarting. Tap Refresh in a moment.");
    } else if (fails.length) {
      setErr(`${fails.length} panel(s) didn't load — tap Refresh to retry.`);
    }
  }, [authedFetch]);

  useEffect(() => { if (auth) load(); }, [auth, load]);

  // Fetch the System Guide HTML through the auth'd endpoint (it's never a public URL).
  const loadGuide = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/admin/guide`, { headers: { Authorization: `Basic ${auth}` } });
      if (res.status === 401) { sessionStorage.removeItem('adminAuth'); setAuth(null); setErr('Wrong admin credentials.'); return; }
      if (!res.ok) throw new Error(`API ${res.status}`);
      setGuideHtml(await res.text());
    } catch {
      setErr("Couldn't load the system guide — tap System guide again in a moment.");
    }
  }, [apiBase, auth]);
  useEffect(() => { if (auth && tab === 'guide' && guideHtml === null) loadGuide(); }, [auth, tab, guideHtml, loadGuide]);

  // Keep the guide iframe sized to its content on resize + catch late layout (fonts) for a couple seconds.
  useEffect(() => {
    if (tab !== 'guide') return;
    window.addEventListener('resize', fitGuide);
    const t = setInterval(fitGuide, 1200);
    const stop = setTimeout(() => clearInterval(t), 3000);
    return () => { window.removeEventListener('resize', fitGuide); clearInterval(t); clearTimeout(stop); };
  }, [tab, fitGuide]);

  const submitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const token = btoa(`${u}:${p}`);
    sessionStorage.setItem('adminAuth', token);
    setAuth(token);
  };

  const openTranscript = async (learnerId: string, conceptId: string) => {
    try {
      const d = await authedFetch(`/conversation/${learnerId}/${conceptId}`);
      setOpenConvo(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load transcript');
    }
  };

  const openErrorDetail = async (id: string) => {
    try {
      const d = await authedFetch(`/error/${id}`);
      setOpenError(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load error');
    }
  };

  if (!auth) {
    return (
      <div className="admin-login">
        <form onSubmit={submitLogin}>
          <h2>Admin</h2>
          <input placeholder="admin user" value={u} onChange={(e) => setU(e.target.value)} autoFocus />
          <input placeholder="admin password" type="password" value={p} onChange={(e) => setP(e.target.value)} />
          {err && <div className="admin-err">{err}</div>}
          <button type="submit">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>Sarthi · Admin</h1>
        <div className="admin-tabs">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>System guide</button>
        </div>
        <div>
          {tab === 'dashboard' && <button onClick={load}>Refresh</button>}
          <button onClick={() => { sessionStorage.removeItem('adminAuth'); setAuth(null); }}>Log out</button>
        </div>
      </header>

      {tab === 'guide' && (
        guideHtml === null
          ? <div className="admin-card muted">Loading the system guide…</div>
          : <iframe
              ref={guideRef}
              title="System guide"
              srcDoc={guideHtml}
              className="admin-guide-frame"
              onLoad={fitGuide}
              scrolling="no"
            />
      )}

      {tab === 'dashboard' && <>
        <section className="admin-card">
          <h3>NIM tutor router <span className="hint">— every session speed-probes the free NIM pool (thinking off) and picks the best by 0.5·speed + 0.5·quality; dead/slow endpoints are dropped, and it re-probes on a tutor failure. See docs/NIM_STUDY.md.</span></h3>
          <button onClick={probeRouter} disabled={routing}>{routing ? 'Probing…' : 'Run a probe now'}</button>
          {route && !route.error && (
            <table>
              <thead><tr><th>endpoint</th><th>speed</th><th>quality</th><th>score</th></tr></thead>
              <tbody>
                {(route.ranked || []).map((r: any) => (
                  <tr key={r.model} style={r.model === route.winner ? { fontWeight: 700 } : undefined}>
                    <td>{r.model.split('/').pop()}{r.model === route.winner ? ' ◀ winner' : ''}</td>
                    <td>{r.ok ? `${r.latencyMs}ms` : '✗ timeout'}</td>
                    <td>{r.ok ? `${Math.round(r.quality * 100)}%` : '—'}</td>
                    <td>{r.ok ? r.score.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {route?.error && <div className="muted">probe failed</div>}
        </section>
      {err && <div className="admin-err">{err}</div>}

      {overview && (
        <>
          <section className="admin-kpis">
            <Kpi label="Users" value={overview.totals.users} />
            <Kpi label="Nodes passed" value={overview.totals.nodesPassed} />
            <Kpi label="Gate attempts" value={overview.totals.gateAttempts} />
            <Kpi label="Gate pass rate" value={`${overview.totals.gatePassRate}%`} />
            <Kpi label="LLM calls" value={overview.totals.llmCalls} />
            <Kpi label="Events" value={overview.totals.events} />
          </section>

          <section className="admin-card">
            <h3>LLM usage by model <span className="hint">— the Haiku-vs-NIM picture. Run <code>node tools/nim-study.mjs</code> for the quality study (see docs/NIM_STUDY.md).</span></h3>
            <table>
              <thead><tr><th>Provider</th><th>Model</th><th>Purpose</th><th>Calls</th><th>Avg ms</th><th>Prompt tok</th><th>Compl tok</th><th>Errors</th></tr></thead>
              <tbody>
                <Rows rows={overview.byModel} cols={8} empty="No model calls captured yet."
                  render={(m: any, i: number) => (
                    <tr key={i}><td>{m.provider}</td><td>{m.model}</td><td>{m.purpose ?? '—'}</td><td>{m.calls}</td><td>{m.avgMs ?? '—'}</td><td>{m.promptTokens}</td><td>{m.completionTokens}</td><td>{m.errors}</td></tr>
                  )} />
              </tbody>
            </table>
          </section>
        </>
      )}

      {traffic && (
        <>
          <section className="admin-kpis">
            <Kpi label="Visits · 7d" value={traffic.visits?.last7 ?? 0} />
            <Kpi label="Visits · all" value={traffic.visits?.total ?? 0} />
            <Kpi label="Unique visitors" value={traffic.visits?.uniq ?? 0} />
            <Kpi label="Active today" value={traffic.active?.dau ?? 0} />
            <Kpi label="Active · 7d" value={traffic.active?.wau ?? 0} />
          </section>

          <section className="admin-card">
            <h3>Signup funnel <span className="hint">— visitors who convert through to passing a node</span></h3>
            <div className="funnel">
              {[
                ['Visitors', traffic.funnel?.visitors],
                ['Signups', traffic.funnel?.signups],
                ['Activated', traffic.funnel?.activated],
                ['Passed a node', traffic.funnel?.passed],
              ].map(([label, v], i, arr) => {
                const top = Number(arr[0][1] || 0);
                const pct = top > 0 ? Math.round((Number(v || 0) / top) * 100) : 0;
                return (
                  <div key={i} className="funnel-step">
                    <div className="funnel-v">{v ?? 0}</div>
                    <div className="funnel-l">{label}</div>
                    <div className="funnel-pct">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="admin-row">
            <section className="admin-card admin-half">
              <h3>Traffic by day <span className="hint">(last 14d)</span></h3>
              <table>
                <thead><tr><th>Day</th><th>Visits</th><th>Uniques</th><th>Signups</th></tr></thead>
                <tbody>
                  <Rows rows={traffic.byDay ?? []} cols={4} empty="No visits yet."
                    render={(d: any) => {
                      const su = (traffic.signupsByDay ?? []).find((s: any) => s.day === d.day);
                      return <tr key={d.day}><td>{d.day}</td><td>{d.visits}</td><td>{d.uniques}</td><td>{su?.n ?? 0}</td></tr>;
                    }} />
                </tbody>
              </table>
            </section>
            <section className="admin-card admin-half">
              <h3>Top referrers</h3>
              <table>
                <thead><tr><th>Source</th><th>Visits</th></tr></thead>
                <tbody>
                  <Rows rows={traffic.referrers ?? []} cols={2} empty="No referrers yet."
                    render={(r: any, i: number) => <tr key={i}><td className="mono">{r.ref}</td><td>{r.n}</td></tr>} />
                </tbody>
              </table>
            </section>
          </div>

          <div className="admin-row">
            <MiniTable title="Top pages" rows={traffic.topPages} keyName="page" />
            <MiniTable title="Devices" rows={traffic.devices} keyName="device" />
            <MiniTable title="Browsers" rows={traffic.browsers} keyName="browser" />
          </div>
        </>
      )}

      <section className="admin-card">
        <h3>Errors <span className="hint">— failed model calls (what a student saw "temporarily unavailable" for). Newest first; click a row for the full request + diagnostic.</span></h3>
        <table>
          <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Purpose</th><th>ms</th><th>Error</th><th></th></tr></thead>
          <tbody>
            <Rows rows={errors} cols={7} empty="No errors logged — the model has been healthy. 🎉"
              render={(e: any) => (
              <tr key={e.id}>
                <td>{e.ts ? new Date(e.ts).toLocaleString() : '—'}</td>
                <td>{e.provider}</td><td>{e.model}</td><td>{e.purpose ?? '—'}</td><td>{e.ms ?? '—'}</td>
                <td className="mono" style={{ maxWidth: 420, whiteSpace: 'normal', wordBreak: 'break-word', color: '#b00020' }}>{e.error ?? '—'}</td>
                <td><button className="link" onClick={() => openErrorDetail(e.id)}>view</button></td>
              </tr>
            )} />
          </tbody>
        </table>
      </section>

      <section className="admin-card">
        <h3>Recent conversations</h3>
        <table>
          <thead><tr><th>Concept</th><th>Learner</th><th>Turns</th><th>Last</th><th></th></tr></thead>
          <tbody>
            <Rows rows={conversations} cols={5} empty="No conversations yet."
              render={(c: any, i: number) => (
              <tr key={i}>
                <td>{c.title}</td>
                <td className="mono">{String(c.learnerId).slice(0, 8)}</td>
                <td>{c.turns}</td>
                <td>{c.last ? new Date(c.last).toLocaleString() : '—'}</td>
                <td><button className="link" onClick={() => openTranscript(c.learnerId, c.conceptId)}>view</button></td>
              </tr>
            )} />
          </tbody>
        </table>
      </section>

      <section className="admin-card">
        <h3>Recent raw LLM calls <span className="hint">— replay corpus for the NIM study</span></h3>
        <table>
          <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Purpose</th><th>ms</th><th>Tokens (p/c)</th><th>ok</th></tr></thead>
          <tbody>
            <Rows rows={calls} cols={7} empty="No raw calls captured yet (they accrue as students use the tutor)."
              render={(c: any) => (
              <tr key={c.id}>
                <td>{c.ts ? new Date(c.ts).toLocaleString() : '—'}</td>
                <td>{c.provider}</td><td>{c.model}</td><td>{c.purpose ?? '—'}</td><td>{c.ms ?? '—'}</td>
                <td>{c.promptTokens ?? '—'}/{c.completionTokens ?? '—'}</td>
                <td title={c.ok ? '' : c.error ?? ''}>{c.ok ? '✓' : '✗'}</td>
              </tr>
            )} />
          </tbody>
        </table>
      </section>

      {openConvo && (
        <div className="admin-overlay" onClick={() => setOpenConvo(null)}>
          <div className="admin-transcript" onClick={(e) => e.stopPropagation()}>
            <button className="admin-close" onClick={() => setOpenConvo(null)}>×</button>
            <h3>{openConvo.concept?.title ?? openConvo.concept?.id}</h3>
            <div className="transcript-body">
              {openConvo.events.map((ev: any, i: number) => (
                <div key={i} className={`tline t-${ev.type}`}>
                  <span className="ttype">{ev.type}</span>
                  <span className="ttext">{ev.payload?.message ?? JSON.stringify(ev.payload)}</span>
                </div>
              ))}
            </div>
            {openConvo.gates?.length > 0 && (
              <div className="transcript-gates">
                <h4>Gate attempts</h4>
                {openConvo.gates.map((g: any, i: number) => (
                  <div key={i} className={`gline ${g.correct ? 'ok' : 'no'}`}>
                    #{g.attemptNo} · {g.correct ? 'correct' : 'wrong'} · <span className="mono">{g.learnerAnswer}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {openError && (
        <div className="admin-overlay" onClick={() => setOpenError(null)}>
          <div className="admin-transcript" onClick={(e) => e.stopPropagation()}>
            <button className="admin-close" onClick={() => setOpenError(null)}>×</button>
            <h3>Error · {openError.provider}/{openError.model} · {openError.purpose ?? '—'}</h3>
            <p className="muted">
              <b>When:</b> {openError.ts ? new Date(openError.ts).toLocaleString() : '—'} · <b>Latency:</b> {openError.ms ?? '—'} ms
            </p>
            <p><b>Diagnostic (provider error body included):</b></p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', background: '#fbeaea', padding: 8, borderRadius: 6, fontSize: 12 }}>{openError.error ?? '(none)'}</pre>
            <p><b>Request messages (the prompt that failed):</b></p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto', background: '#f6f6f6', padding: 8, borderRadius: 6, fontSize: 12 }}>{JSON.stringify(openError.messages, null, 2)}</pre>
            {openError.response && (
              <>
                <p><b>Partial response:</b></p>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', background: '#f6f6f6', padding: 8, borderRadius: 6, fontSize: 12 }}>{openError.response}</pre>
              </>
            )}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="kpi">
      <div className="kpi-v">{value}</div>
      <div className="kpi-l">{label}</div>
    </div>
  );
}

function MiniTable({ title, rows, keyName }: { title: string; rows?: any[]; keyName: string }) {
  return (
    <section className="admin-card admin-third">
      <h3>{title}</h3>
      <table>
        <tbody>
          <Rows rows={rows} cols={2} empty="No data yet."
            render={(r: any, i: number) => (
              <tr key={i}><td>{r[keyName]}</td><td style={{ textAlign: 'right' }}>{r.n}</td></tr>
            )} />
        </tbody>
      </table>
    </section>
  );
}

// A <tbody> helper that keeps long operator tables compact: it shows only the first `step` rows, then a
// full-width "dropdown bar" that extends the table by `step` more rows per click (and collapses back to
// the first `step` once fully shown). Renders a fragment of <tr>s — valid as a direct child of <tbody>.
// No bar appears when the table has `step` rows or fewer, so it's safe to wrap every table.
function Rows({ rows, cols, render, empty, step = 5 }: {
  rows: any[] | undefined;
  cols: number;
  render: (row: any, i: number) => React.ReactNode;
  empty: React.ReactNode;
  step?: number;
}) {
  const [shown, setShown] = useState(step);
  if (!rows || rows.length === 0) return <tr><td colSpan={cols} className="muted">{empty}</td></tr>;
  const visible = Math.min(shown, rows.length);
  const hidden = rows.length - visible;
  return (
    <>
      {rows.slice(0, visible).map((r, i) => render(r, i))}
      {rows.length > step && (
        <tr className="more-row">
          <td colSpan={cols}>
            {hidden > 0 ? (
              <button className="more-bar" onClick={() => setShown(visible + step)}>
                ▾ Show {Math.min(step, hidden)} more <span className="more-rem">· {hidden} hidden</span>
              </button>
            ) : (
              <button className="more-bar" onClick={() => setShown(step)}>▴ Show less</button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

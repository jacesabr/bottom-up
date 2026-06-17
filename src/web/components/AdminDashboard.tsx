import { useCallback, useEffect, useState } from 'react';
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

  const [overview, setOverview] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [openConvo, setOpenConvo] = useState<any>(null);

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

  const load = useCallback(async () => {
    try {
      const [o, c, l] = await Promise.all([authedFetch('/overview'), authedFetch('/conversations'), authedFetch('/llm-calls')]);
      setOverview(o);
      setConversations(c.conversations ?? []);
      setCalls(l.calls ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      if (String(e).includes('credentials')) { sessionStorage.removeItem('adminAuth'); setAuth(null); }
    }
  }, [authedFetch]);

  useEffect(() => { if (auth) load(); }, [auth, load]);

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
        <h1>Bottom-Up · Admin</h1>
        <div>
          <button onClick={load}>Refresh</button>
          <button onClick={() => { sessionStorage.removeItem('adminAuth'); setAuth(null); }}>Log out</button>
        </div>
      </header>
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
                {overview.byModel.length === 0 && <tr><td colSpan={8} className="muted">No model calls captured yet.</td></tr>}
                {overview.byModel.map((m: any, i: number) => (
                  <tr key={i}><td>{m.provider}</td><td>{m.model}</td><td>{m.purpose ?? '—'}</td><td>{m.calls}</td><td>{m.avgMs ?? '—'}</td><td>{m.promptTokens}</td><td>{m.completionTokens}</td><td>{m.errors}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="admin-card">
        <h3>Recent conversations</h3>
        <table>
          <thead><tr><th>Concept</th><th>Learner</th><th>Turns</th><th>Last</th><th></th></tr></thead>
          <tbody>
            {conversations.length === 0 && <tr><td colSpan={5} className="muted">No conversations yet.</td></tr>}
            {conversations.map((c, i) => (
              <tr key={i}>
                <td>{c.title}</td>
                <td className="mono">{String(c.learnerId).slice(0, 8)}</td>
                <td>{c.turns}</td>
                <td>{c.last ? new Date(c.last).toLocaleString() : '—'}</td>
                <td><button className="link" onClick={() => openTranscript(c.learnerId, c.conceptId)}>view</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-card">
        <h3>Recent raw LLM calls <span className="hint">— replay corpus for the NIM study</span></h3>
        <table>
          <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Purpose</th><th>ms</th><th>Tokens (p/c)</th><th>ok</th></tr></thead>
          <tbody>
            {calls.length === 0 && <tr><td colSpan={7} className="muted">No raw calls captured yet (they accrue as students use the tutor).</td></tr>}
            {calls.map((c) => (
              <tr key={c.id}>
                <td>{c.ts ? new Date(c.ts).toLocaleString() : '—'}</td>
                <td>{c.provider}</td><td>{c.model}</td><td>{c.purpose ?? '—'}</td><td>{c.ms ?? '—'}</td>
                <td>{c.promptTokens ?? '—'}/{c.completionTokens ?? '—'}</td><td>{c.ok ? '✓' : '✗'}</td>
              </tr>
            ))}
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

import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { users, buEvent, buGateAttempt, buLlmCall, buNodePerformance, buVisit } from '../db/schema.js';
import { sql, eq, and, desc } from 'drizzle-orm';
import { getConceptById } from '../core/content-cache.js';

/**
 * Admin panel API — read-only operator views, gated by HTTP Basic auth (ADMIN_USER/ADMIN_PASSWORD).
 * Fail-closed: if those env vars aren't set, every /admin route returns 503. Mirrors the socratic/IE
 * admin pattern, scaled to bottom-up's tables (buEvent transcripts, buGateAttempt, bu_llm_call).
 */
const router = express.Router();

router.use((req, res, next) => {
  const U = process.env.ADMIN_USER;
  const P = process.env.ADMIN_PASSWORD;
  if (!U || !P) return res.status(503).json({ error: 'Admin not configured (set ADMIN_USER/ADMIN_PASSWORD).' });
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const [u, p] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    if (u === U && p === P) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="bottom-up admin"');
  return res.status(401).json({ error: 'Auth required' });
});

// Headline numbers + LLM-call breakdown by provider/model (the NIM-vs-Haiku usage picture).
router.get('/overview', async (_req, res) => {
  try {
    const [[{ userCount }], [{ passedCount }], [{ eventCount }], [{ gateCount }], [{ llmCount }]] = await Promise.all([
      db.select({ userCount: sql<number>`count(*)::int` }).from(users),
      db.select({ passedCount: sql<number>`count(*)::int` }).from(buNodePerformance).where(eq(buNodePerformance.status, 'passed')),
      db.select({ eventCount: sql<number>`count(*)::int` }).from(buEvent),
      db.select({ gateCount: sql<number>`count(*)::int` }).from(buGateAttempt),
      db.select({ llmCount: sql<number>`count(*)::int` }).from(buLlmCall),
    ]);

    const byModel = await db
      .select({
        provider: buLlmCall.provider,
        model: buLlmCall.model,
        purpose: buLlmCall.purpose,
        calls: sql<number>`count(*)::int`,
        avgMs: sql<number>`round(avg(${buLlmCall.ms}))::int`,
        promptTokens: sql<number>`coalesce(sum(${buLlmCall.promptTokens}),0)::int`,
        completionTokens: sql<number>`coalesce(sum(${buLlmCall.completionTokens}),0)::int`,
        errors: sql<number>`sum(case when ${buLlmCall.ok} then 0 else 1 end)::int`,
      })
      .from(buLlmCall)
      .groupBy(buLlmCall.provider, buLlmCall.model, buLlmCall.purpose)
      .orderBy(desc(sql`count(*)`));

    const [{ passes }] = await db.select({ passes: sql<number>`sum(case when ${buGateAttempt.correct} then 1 else 0 end)::int` }).from(buGateAttempt);
    const gatePassRate = gateCount > 0 ? Math.round((Number(passes ?? 0) / gateCount) * 100) : 0;

    res.json({
      totals: { users: userCount, nodesPassed: passedCount, events: eventCount, gateAttempts: gateCount, llmCalls: llmCount, gatePassRate },
      byModel,
    });
  } catch (err) {
    console.error('admin/overview error:', err);
    res.status(500).json({ error: 'overview failed' });
  }
});

// Traffic + growth funnel for the Traffic panel. Visits/uniques/referrers come from bu_visit; the
// funnel + DAU/WAU come from the existing event/user tables. Raw SQL keeps the aggregates compact.
router.get('/traffic', async (_req, res) => {
  try {
    const rows = (q: ReturnType<typeof sql>) => db.execute(q).then((r: any) => (r.rows ?? r) as any[]);
    const [visits] = await rows(sql`
      select count(*)::int total,
             count(*) filter (where ts > now() - interval '7 days')::int last7,
             count(distinct visitor_id)::int uniq,
             count(distinct visitor_id) filter (where ts > now() - interval '7 days')::int uniq7
      from bu_visit`);
    const byDay = await rows(sql`
      select to_char(date_trunc('day', ts),'YYYY-MM-DD') as "day", count(*)::int as visits,
             count(distinct visitor_id)::int as uniques
      from bu_visit where ts > now() - interval '14 days' group by 1 order by 1 desc`);
    const referrers = await rows(sql`
      select coalesce(nullif(referrer,''),'(direct)') as ref, count(*)::int as n
      from bu_visit group by 1 order by 2 desc limit 8`);
    const topPages = await rows(sql`
      select coalesce(nullif(path,''),'(none)') as page, count(*)::int as n
      from bu_visit group by 1 order by 2 desc limit 8`);
    const devices = await rows(sql`
      select case when ua ilike '%mobi%' then 'Mobile'
                  when ua ilike '%tablet%' or ua ilike '%ipad%' then 'Tablet'
                  else 'Desktop' end as device, count(*)::int as n
      from bu_visit where ua is not null group by 1 order by 2 desc`);
    const browsers = await rows(sql`
      select case when ua ilike '%edg%' then 'Edge'
                  when ua ilike '%opr%' or ua ilike '%opera%' then 'Opera'
                  when ua ilike '%chrome%' or ua ilike '%crios%' then 'Chrome'
                  when ua ilike '%firefox%' or ua ilike '%fxios%' then 'Firefox'
                  when ua ilike '%safari%' then 'Safari'
                  else 'Other' end as browser, count(*)::int as n
      from bu_visit where ua is not null group by 1 order by 2 desc`);
    const signupsByDay = await rows(sql`
      select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as "day", count(*)::int as n
      from users where username is not null and created_at > now() - interval '14 days' group by 1 order by 1 desc`);
    const [funnel] = await rows(sql`
      select (select count(distinct visitor_id) from bu_visit)::int visitors,
             (select count(*) from users where username is not null)::int signups,
             (select count(distinct learner_id) from bu_event where type='enter_node')::int activated,
             (select count(distinct learner_id) from bu_node_performance where status='passed')::int passed`);
    const [activeUsers] = await rows(sql`
      select (select count(distinct learner_id) from bu_event where ts > now() - interval '1 day')::int dau,
             (select count(distinct learner_id) from bu_event where ts > now() - interval '7 days')::int wau`);
    res.json({ visits, byDay, referrers, topPages, devices, browsers, signupsByDay, funnel, active: activeUsers });
  } catch (err) {
    console.error('admin/traffic error:', err);
    res.status(500).json({ error: 'traffic failed' });
  }
});

// Recent conversations: distinct (learner, concept) pairs with turn counts, newest first.
router.get('/conversations', async (_req, res) => {
  try {
    const rows = await db
      .select({
        learnerId: buEvent.learnerId,
        conceptId: buEvent.conceptId,
        turns: sql<number>`count(*)::int`,
        last: sql<string>`max(${buEvent.ts})`,
      })
      .from(buEvent)
      .where(sql`${buEvent.conceptId} is not null`)
      .groupBy(buEvent.learnerId, buEvent.conceptId)
      .orderBy(desc(sql`max(${buEvent.ts})`))
      .limit(80);

    // Title each concept from the in-memory content cache.
    const out = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        title: (await getConceptById(r.conceptId as string))?.title ?? r.conceptId,
      }))
    );
    res.json({ conversations: out });
  } catch (err) {
    console.error('admin/conversations error:', err);
    res.status(500).json({ error: 'conversations failed' });
  }
});

// One conversation: the full turn-by-turn transcript (buEvent) + gate attempts for (learner, concept).
router.get('/conversation/:learnerId/:conceptId', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const [events, gates, concept] = await Promise.all([
      db.select().from(buEvent).where(and(eq(buEvent.learnerId, learnerId), eq(buEvent.conceptId, conceptId))).orderBy(buEvent.ts),
      db.select().from(buGateAttempt).where(and(eq(buGateAttempt.learnerId, learnerId), eq(buGateAttempt.conceptId, conceptId))).orderBy(buGateAttempt.attemptNo),
      getConceptById(conceptId),
    ]);
    res.json({ concept: concept ? { id: concept.id, title: concept.title } : { id: conceptId }, events, gates });
  } catch (err) {
    console.error('admin/conversation error:', err);
    res.status(500).json({ error: 'conversation failed' });
  }
});

// Recent raw LLM calls (the replay corpus feeding the NIM study). Capped + light columns.
router.get('/llm-calls', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: buLlmCall.id, ts: buLlmCall.ts, provider: buLlmCall.provider, model: buLlmCall.model,
        purpose: buLlmCall.purpose, promptTokens: buLlmCall.promptTokens, completionTokens: buLlmCall.completionTokens,
        ms: buLlmCall.ms, ok: buLlmCall.ok, error: buLlmCall.error,
      })
      .from(buLlmCall)
      .orderBy(desc(buLlmCall.ts))
      .limit(100);
    res.json({ calls: rows });
  } catch (err) {
    console.error('admin/llm-calls error:', err);
    res.status(500).json({ error: 'llm-calls failed' });
  }
});

// The operator ERROR LOG: every failed model call, newest first — what failed, when, how long it took,
// and the FULL diagnostic (the provider's error body is captured in `error`). This is the panel that
// tells the admin exactly what broke when a student saw the "temporarily unavailable" message.
router.get('/errors', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: buLlmCall.id, ts: buLlmCall.ts, provider: buLlmCall.provider, model: buLlmCall.model,
        purpose: buLlmCall.purpose, ms: buLlmCall.ms, error: buLlmCall.error,
        learnerId: buLlmCall.learnerId, conceptId: buLlmCall.conceptId,
      })
      .from(buLlmCall)
      .where(eq(buLlmCall.ok, false))
      .orderBy(desc(buLlmCall.ts))
      .limit(100);
    res.json({ errors: rows });
  } catch (err) {
    console.error('admin/errors error:', err);
    res.status(500).json({ error: 'errors failed' });
  }
});

// One failed call in full — the exact request messages + any partial response, for root-causing.
router.get('/error/:id', async (req, res) => {
  try {
    const rows = await db.select().from(buLlmCall).where(eq(buLlmCall.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({
      id: r.id, ts: r.ts, provider: r.provider, model: r.model, purpose: r.purpose,
      ms: r.ms, ok: r.ok, error: r.error, messages: r.messages, response: r.response,
    });
  } catch (err) {
    console.error('admin/error detail error:', err);
    res.status(500).json({ error: 'error detail failed' });
  }
});

// The System Guide (living architecture doc). Served ONLY through this Basic-auth'd route — the file
// lives at docs/architecture.html (NOT public/), so it is never reachable as a static URL. The admin
// UI fetches this with the auth header and renders it into a sandboxed iframe via srcdoc.
const GUIDE_PATH = fileURLToPath(new URL('../../docs/architecture.html', import.meta.url));
router.get('/guide', async (_req, res) => {
  try {
    const html = await readFile(GUIDE_PATH, 'utf8');
    res.type('html').send(html);
  } catch (err) {
    console.error('admin/guide error:', err);
    res.status(500).json({ error: 'guide unavailable' });
  }
});

export default router;

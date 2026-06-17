import express from 'express';
import { db } from '../db/index.js';
import { users, buEvent, buGateAttempt, buLlmCall, buNodePerformance } from '../db/schema.js';
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
        ms: buLlmCall.ms, ok: buLlmCall.ok,
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

export default router;

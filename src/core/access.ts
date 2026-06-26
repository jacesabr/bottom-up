import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { buNodePerformance, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getConceptById, getChapter, getConceptsForChapter, getChaptersForSubject } from './content-cache.js';
import { verifySession, authEnforced } from './auth.js';

/**
 * Anti-scrape access control. A node's content (explanation, gates, the live teaching) is served ONLY to a
 * learner who has legitimately reached it — never enumerable up front. `isNodeAccessible` reproduces EXACTLY
 * the unlock the UI shows (so it never locks out a real learner), MATCHING this repo's model:
 *   - CHAPTER gate: strict-linear (every earlier chapter complete) — EXCEPT open-ladder exams (e.g. 'scratch'),
 *     where every chapter is open to climb into (mirrors routes.ts OPEN_LADDER_EXAMS + the Home logic).
 *   - NODE gate: strict-linear within the chapter (one frontier node open; passed nodes stay open). Unauthored
 *     "coming soon" stubs (`needsAuthoring`) are skipped — they hold no content and never become the frontier.
 * Net effect: a fresh/anonymous identity can only reach the very first node of an open chapter; getting any
 * further requires actually passing the gates — so the corpus can't be pulled by walking concept ids.
 */
const OPEN_LADDER_EXAMS = new Set(['scratch']); // keep in sync with routes.ts
const IN_PROGRESS = new Set(['teaching', 'awaiting_gate', 'needs_reteach']);

// The single operator/admin learner (by username). For QA it gets the first ADMIN_PREVIEW_NODES authored
// nodes of the FIRST chapter of each subject opened up — nothing else. Even if these creds leak, a scraper
// gets at most 5 nodes per exam, not the corpus; everywhere else the admin is a normal strict-linear learner.
const ADMIN_USERNAME = 'admin123';
export const ADMIN_PREVIEW_NODES = 5;

/** True iff this learnerId is the admin account (username `admin123`, matched case-insensitively). */
export async function isAdminLearner(learnerId: string): Promise<boolean> {
  if (!learnerId) return false;
  const r = await db.select({ u: users.username }).from(users).where(eq(users.id, learnerId)).limit(1);
  return r.length > 0 && (r[0].u || '').toLowerCase() === ADMIN_USERNAME;
}

export async function isNodeAccessible(learnerId: string, conceptId: string): Promise<boolean> {
  if (!learnerId || !conceptId) return false;
  const concept = await getConceptById(conceptId);
  if (!concept) return false;
  if ((concept as { needsAuthoring?: boolean }).needsAuthoring) return false; // "coming soon" stub — no content
  const chapter = await getChapter(concept.chapterId);
  if (!chapter) return false;

  // Admin QA preview: the admin learner can open the first ADMIN_PREVIEW_NODES authored nodes of the FIRST
  // chapter of each subject, regardless of progress. Any other node falls through to the strict-linear gate
  // below (so the admin still progresses normally elsewhere, and the corpus stays un-enumerable).
  if (await isAdminLearner(learnerId)) {
    const chaptersOrdered = await getChaptersForSubject(chapter.subjectId);
    if (chaptersOrdered[0]?.id === chapter.id) {
      const authored = (await getConceptsForChapter(chapter.id)).filter(
        (c) => !(c as { needsAuthoring?: boolean }).needsAuthoring
      );
      if (authored.slice(0, ADMIN_PREVIEW_NODES).some((c) => c.id === conceptId)) return true;
    }
  }

  // One DB read: this learner's per-node statuses. Everything else is the in-memory content cache (0 DB).
  const perfRows = await db.select().from(buNodePerformance).where(eq(buNodePerformance.learnerId, learnerId));
  const passed = new Set(perfRows.filter((p) => p.status === 'passed').map((p) => p.conceptId));
  const statusOf = new Map(perfRows.map((p) => [p.conceptId, p.status as string]));

  // 1) CHAPTER gate — strict-linear (all earlier chapters complete) unless this exam is an open ladder.
  const exam = (chapter.subjectId || '').split(':')[0];
  if (!OPEN_LADDER_EXAMS.has(exam)) {
    const chaptersOrdered = await getChaptersForSubject(chapter.subjectId);
    const chIdx = chaptersOrdered.findIndex((c) => c.id === chapter.id);
    if (chIdx < 0) return false;
    for (let i = 0; i < chIdx; i++) {
      const cs = await getConceptsForChapter(chaptersOrdered[i].id);
      if (!(cs.length > 0 && cs.every((c) => passed.has(c.id)))) return false; // an earlier chapter isn't done
    }
  }

  // 2) NODE gate — strict-linear within the chapter; coming-soon stubs are skipped (never the frontier).
  const nodes = await getConceptsForChapter(chapter.id); // sorted by order
  let activeAssigned = false;
  for (const c of nodes) {
    if ((c as { needsAuthoring?: boolean }).needsAuthoring) continue;
    const existing = statusOf.get(c.id);
    let status: string;
    if (existing === 'passed') {
      status = 'passed';
    } else if (!activeAssigned) {
      status = existing && IN_PROGRESS.has(existing) ? existing : 'available';
      activeAssigned = true;
    } else {
      status = 'locked';
    }
    if (c.id === conceptId) return status !== 'locked';
  }
  return false;
}

/**
 * Express guard for content routes. Reads the learner from the route param (`:learnerId`) or, for the
 * concept-scoped routes that have no learner in the path, the `?learner=` query. 403 if the node isn't
 * reachable for that learner. Fail-closed: any guard error denies (security over availability) but is logged.
 */
async function isRegisteredAccount(id: string): Promise<boolean> {
  const r = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return r.length > 0;
}

export async function requireNodeAccess(req: Request, res: Response, next: NextFunction) {
  const learnerId = req.params.learnerId || (req.query.learner as string) || '';
  const conceptId = req.params.conceptId || '';
  try {
    // Ownership (anti-impersonation): when auth is ENFORCED (SESSION_SECRET set), a learnerId that belongs
    // to a registered account may only be used WITH that account's session token. Anonymous ids need none.
    if (authEnforced()) {
      const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (verifySession(bearer) !== learnerId && (await isRegisteredAccount(learnerId))) {
        return res.status(401).json({ error: 'auth_required', message: 'Please log in again.' });
      }
    }
    if (await isNodeAccessible(learnerId, conceptId)) return next();
  } catch (err) {
    console.error('requireNodeAccess error:', err);
  }
  return res.status(403).json({ error: 'locked', message: 'This node is locked — finish the ones before it first.' });
}

/** Guard for the exam-paper routes: owner-bound (when enforced) + the learner must have passed at least
 *  one node — so a fresh/anonymous identity can't bulk-pull the past-paper question bank. */
export async function requirePaperAccess(req: Request, res: Response, next: NextFunction) {
  const learnerId = req.params.learnerId || '';
  try {
    if (authEnforced()) {
      const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (verifySession(bearer) !== learnerId && (await isRegisteredAccount(learnerId))) {
        return res.status(401).json({ error: 'auth_required', message: 'Please log in again.' });
      }
    }
    const r = await db
      .select({ c: buNodePerformance.conceptId })
      .from(buNodePerformance)
      .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.status, 'passed')))
      .limit(1);
    if (r.length) return next();
  } catch (err) {
    console.error('requirePaperAccess error:', err);
  }
  return res.status(403).json({ error: 'locked', message: 'Finish at least one lesson before taking a paper.' });
}

/**
 * Tiny dependency-free fixed-window rate limiter (per client IP). A backstop against rapid enumeration on
 * top of the unlock gate above — generous enough that a real learner (a handful of requests per node, plus
 * voice chunks) never trips it. Per-process memory; on a multi-instance deploy each instance limits its own
 * share, which is fine for this purpose. Returns Express middleware.
 */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    let rec = hits.get(ip);
    if (!rec || now >= rec.resetAt) {
      rec = { count: 0, resetAt: now + opts.windowMs };
      hits.set(ip, rec);
    }
    rec.count++;
    if (rec.count > opts.max) {
      res.setHeader('Retry-After', Math.ceil((rec.resetAt - now) / 1000));
      return res.status(429).json({ error: 'rate_limited' });
    }
    // Opportunistic cleanup so the map can't grow unbounded.
    if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    next();
  };
}

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  let host = '';
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host.endsWith('.onrender.com')) return true; // the deployed *-web static site(s)
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

/**
 * Locked-down CORS (replaces `Access-Control-Allow-Origin: *`). Only reflects an allowed Origin — local
 * dev, the deployed `*.onrender.com` web app, and anything in ALLOWED_ORIGINS (a custom domain). A random
 * third-party site can no longer call the API from a browser (so it can't quietly reuse/clone the app).
 * Note: CORS is a BROWSER control — it doesn't stop curl/scripts; the access gate + rate limit do that.
 */
export function cors(req: Request, res: Response, next: NextFunction) {
  const origin = (req.headers.origin as string) || '';
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

/** Baseline security headers: no MIME sniffing, no framing/embedding (anti-clickjack/clone), tight referrer,
 *  HSTS (Render is https), and noindex. Cheap defense-in-depth on every response. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

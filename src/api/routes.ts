import express from 'express';
import { db } from '../db/index.js';
import { buNodePerformance, buVisit } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { enterNode, respond, poseGate, answerGate, getNodeDetail, helpWithSketch, getConceptFigures, serviceDownMessage } from '../core/teach-loop.js';
import { LlmUnavailableError } from '../core/llm.js';
import { routeModels } from '../core/nim-router.js';
import { setRoute, getCurrentText, getVisionModel } from '../core/route-store.js';
import { LANGUAGES } from '../core/languages.js';
import { getChaptersForSubject, getChapter, getConceptsForChapter } from '../core/content-cache.js';
import { computeChapterStatuses } from '../core/sequencer.js';
import { listPapers, paperForClient, answerPaperQuestion, paperResult, paperState } from '../core/papers.js';
import { registerUser, loginUser, AuthError, signSession } from '../core/auth.js';
import { requireNodeAccess, requirePaperAccess, rateLimit } from '../core/access.js';

const router = express.Router();

// Brute-force / mass-signup throttle for the auth endpoints (per IP). Generous for real users.
const authLimiter = rateLimit({ windowMs: 60_000, max: 30 });

// The math courses shown on the home page (the only subject we surface for now). Each is an
// exam+subject pair; `subject` differs per exam because the corpus is keyed differently.
const MATH_COURSES = [
  { key: 'cbse10:maths', exam: 'cbse10', subject: 'maths', title: 'CBSE 10 · Maths', who: 'For Class 10 — CBSE board maths, built from the ground up.' },
  { key: 'cbse12:mathematics', exam: 'cbse12', subject: 'mathematics', title: 'CBSE 12 · Maths', who: 'For Class 12 — CBSE board maths. Assumes Class 11 is already familiar.' },
  { key: 'jee:maths', exam: 'jee', subject: 'maths', title: 'JEE · Maths', who: 'For Class 11 onward — starts at Class 11, runs into Class 12, deeper than boards. Ideal if you start in Class 11.' },
  // ── ARCHIVED 2026-06-19 — "Learn from Scratch" hidden from the front end (not yet authored). ──────────
  // It is removed from the home page ONLY by not being served here. Everything else stays in place and
  // isolated: the ClassLadder UI (Home.tsx), the `coming_soon`/needsAuthoring handling (ChapterMap.tsx),
  // the scratch teaching persona (exam-profile.ts SCRATCH_BANDS), OPEN_LADDER_EXAMS, and the whole
  // content/scratch/* corpus + DB rows. Re-enable by uncommenting this one line.
  // { key: 'scratch:maths', exam: 'scratch', subject: 'maths', title: 'Learn from Scratch · Maths', who: 'All of school maths as one map — Kindergarten to end of high school. Climb to any class and start there; we refresh whatever you need.' },
] as const;

// Courses whose chapters are class levels you may enter in any order (no strict-linear unlock wall).
const OPEN_LADDER_EXAMS = new Set(['scratch']);

// ---- Auth (simple username/password; the returned user id becomes the client's learnerId) ----

router.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await registerUser(String(username ?? ''), String(password ?? ''));
    res.json({ user, token: signSession(user.id) });
  } catch (err) {
    if (err instanceof AuthError) return res.status(400).json({ error: err.message });
    console.error('register error:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await loginUser(String(username ?? ''), String(password ?? ''));
    res.json({ user, token: signSession(user.id) });
  } catch (err) {
    if (err instanceof AuthError) return res.status(400).json({ error: err.message });
    console.error('login error:', err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

// Home page payload: every math course with this learner's per-course completion % AND the full
// chapter-node grid (status per chapter). One call powers the whole landing page (stacked grids +
// progress header). Counts are derived from the in-memory content cache; only the learner's passed
// set hits the DB (1 query, reused across all courses).
router.get('/learner/:learnerId/home', async (req, res) => {
  try {
    const { learnerId } = req.params;
    const perfRows = await db.select().from(buNodePerformance).where(eq(buNodePerformance.learnerId, learnerId));
    const passed = new Set(perfRows.filter((p) => p.status === 'passed').map((p) => p.conceptId));

    const courses = await Promise.all(
      MATH_COURSES.map(async (course) => {
        const ordered = await getChaptersForSubject(`${course.exam}:${course.subject}`);
        let total = 0;
        let passedCount = 0;
        let activeAssigned = false;
        const chapters = await Promise.all(
          ordered.map(async (ch, i) => {
            const concepts = await getConceptsForChapter(ch.id);
            const chTotal = concepts.length;
            const chPassed = concepts.filter((c) => passed.has(c.id)).length;
            total += chTotal;
            passedCount += chPassed;
            const complete = chTotal > 0 && chPassed === chTotal;
            let status: 'complete' | 'active' | 'locked';
            if (complete) status = 'complete';
            else if (OPEN_LADDER_EXAMS.has(course.exam)) {
              // Class ladder: every level is open to climb into; none are locked behind the prior one.
              status = 'active';
            } else if (!activeAssigned) {
              status = 'active';
              activeAssigned = true;
            } else status = 'locked';
            return { id: ch.id, title: ch.title, index: i + 1, status };
          })
        );
        const pct = total > 0 ? Math.round((passedCount / total) * 100) : 0;
        return { ...course, passed: passedCount, total, pct, chapters };
      })
    );

    res.json({ courses });
  } catch (err) {
    console.error('Error building home:', err);
    res.status(500).json({ error: 'Failed to load home' });
  }
});

// Anonymous page-visit beacon (ungated, fire-and-forget). Logs raw web traffic for the admin Traffic
// panel. No cookies/PII — visitorId is a random localStorage id; learnerId is set only once logged in.
router.post('/track', (req, res) => {
  try {
    const { path, referrer, visitorId, learnerId } = req.body || {};
    const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    if (visitorId) {
      void db
        .insert(buVisit)
        .values({
          visitorId: String(visitorId).slice(0, 64),
          learnerId: isUuid(learnerId) ? (learnerId as string) : null,
          path: path ? String(path).slice(0, 120) : null,
          referrer: referrer ? String(referrer).slice(0, 300) : null,
          ua: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 200) : null,
        })
        .catch(() => {});
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// Supported teaching/voice languages (for the UI selector).
router.get('/languages', (_req, res) => {
  res.json({ languages: Object.values(LANGUAGES) });
});

// Read-aloud: text → speech (Deepgram Aura-2 for English, Sarvam for Indic → null=browser TTS).
router.post('/tts', async (req, res) => {
  try {
    const { text, lang, provider, strict } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text' });
    const { synthesize } = await import('../core/voice.js');
    const force = ['sarvam', 'deepgram'].includes(provider) ? provider : undefined;
    const out = await synthesize(String(text), lang || 'en', force, !!strict);
    res.json(out ?? { audioBase64: null }); // null → client uses browser TTS
  } catch (err) {
    console.error('tts error:', err);
    res.status(500).json({ error: 'tts failed' });
  }
});

// Mic: speech → text (Deepgram → Sarvam → null=browser STT). audio is a base64 data URL or raw base64.
router.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64, mime, lang } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: 'No audio' });
    const b64 = String(audioBase64).includes(',') ? String(audioBase64).split(',')[1] : String(audioBase64);
    const buf = Buffer.from(b64, 'base64');
    const { transcribe } = await import('../core/voice.js');
    const out = await transcribe(buf, mime || 'audio/webm', lang || 'en');
    res.json(out ?? { transcript: null }); // null → client falls back to browser STT
  } catch (err) {
    console.error('transcribe error:', err);
    res.status(500).json({ error: 'transcribe failed' });
  }
});

// Serve a textbook figure image: chapterId "cbse10:maths:jemh103" → content/cbse10/maths/jemh103/figures/<file>
router.get('/figure/:chapterId/:filename', async (req, res) => {
  try {
    const { chapterId, filename } = req.params;
    // Both segments are attacker-controlled (chapterId becomes a path via the `:`→sep replace below),
    // so reject traversal / unexpected chars in EITHER — keep the read strictly inside content/.
    const unsafe = (s: string) => s.includes('..') || !/^[\w:.-]+$/.test(s);
    if (unsafe(chapterId) || unsafe(filename)) return res.status(400).end();
    const fs = await import('fs');
    const path = await import('path');
    const rel = chapterId.replace(/:/g, path.sep);
    const file = path.join(process.cwd(), 'content', rel, 'figures', filename);
    if (!fs.existsSync(file)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error('figure serve error:', err);
    res.status(500).end();
  }
});

// Relevant figures for a concept (the captioned mappings).
router.get('/concept/:conceptId/figures', requireNodeAccess, async (req, res) => {
  try {
    const figs = await getConceptFigures(req.params.conceptId);
    res.json({ figures: figs });
  } catch (err) {
    console.error('concept figures error:', err);
    res.status(500).json({ error: 'Failed to load figures' });
  }
});

// List chapters for an exam+subject, with this LEARNER's strict-linear progress: chapters the
// learner has fully cleared are 'complete', the first uncleared one is 'active', the rest 'locked'.
// Finishing every node in a chapter unlocks the next — progression runs through ALL content
// (each node is teachable from its book/practice gate; high-quality 5-gate authoring not required).
router.get('/learner/:learnerId/chapters/:exam/:subject', async (req, res) => {
  try {
    const { learnerId, exam, subject } = req.params;
    const subjectId = `${exam}:${subject}`;
    const chapters = await computeChapterStatuses(learnerId, subjectId);
    res.json({ exam, subject, chapters });
  } catch (err) {
    console.error('Error listing chapters:', err);
    res.status(500).json({ error: 'Failed to list chapters' });
  }
});

// Back-compat (no learner): first chapter active, rest locked.
router.get('/chapters/:exam/:subject', async (req, res) => {
  try {
    const { exam, subject } = req.params;
    const subjectId = `${exam}:${subject}`;
    const ordered = await getChaptersForSubject(subjectId);
    const list = ordered.map((c, i) => ({
      id: c.id,
      title: c.title,
      index: i + 1,
      status: i === 0 ? 'active' : 'locked',
    }));
    res.json({ exam, subject, chapters: list });
  } catch (err) {
    console.error('Error listing chapters:', err);
    res.status(500).json({ error: 'Failed to list chapters' });
  }
});

// Chapter with this learner's node states (the in-chapter node map).
// Fast path: exactly 3 reads, no loops, no inserts. Status is DERIVED on the fly; performance
// rows are only created lazily when the learner actually enters a node (enterNode).
router.get('/learner/:learnerId/chapter/:chapterId', async (req, res) => {
  try {
    const { learnerId, chapterId } = req.params;

    // Structure from the in-memory cache (0 DB); only the learner's status hits the DB (1 query).
    const [chapter, concepts] = await Promise.all([getChapter(chapterId), getConceptsForChapter(chapterId)]);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    const perfRows = await db.select().from(buNodePerformance).where(eq(buNodePerformance.learnerId, learnerId));

    const statusOf = new Map(perfRows.map((p) => [p.conceptId, p.status]));

    // Strict-linear within a chapter: exactly ONE node is open — the lowest-order not-yet-passed node
    // (keeping its in-progress state if the learner already started it). Passing it opens the next; all
    // later nodes stay locked. (concepts arrive sorted by order from the content cache.)
    const inProgress = new Set(['teaching', 'awaiting_gate', 'needs_reteach']);
    let activeAssigned = false;
    const nodes = concepts.map((concept) => {
      const existing = statusOf.get(concept.id);
      let status: string;
      if (concept.needsAuthoring) {
        // "Learn from Scratch" stub: imported from the Coherence Map but not yet authored. Never the
        // active node — it shows as "coming soon" and does not block the authored nodes before it.
        status = 'coming_soon';
      } else if (existing === 'passed') {
        status = 'passed';
      } else if (!activeAssigned) {
        status = existing && inProgress.has(existing) ? existing : 'available';
        activeAssigned = true;
      } else {
        status = 'locked';
      }
      return { id: concept.id, slug: concept.slug, title: concept.title, role: concept.role, order: concept.order, status };
    });

    res.json({ chapter: { id: chapter.id, title: chapter.title }, nodes });
  } catch (err) {
    console.error('Error fetching chapter:', err);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// Start a node: enter + opening tutor turn (no intro friction — the AI just begins).
// Speed-probe the NIM candidate pool and pick this session's model. The "finding your fastest tutor"
// popup calls this on node entry and again after a tutor failure. Stores the winner for the learner so
// the teach/grade path uses it; returns the full ranked race for the popup to render.
router.post('/learner/:learnerId/route', async (req, res) => {
  try {
    const { learnerId } = req.params;
    const kind = req.body?.kind === 'vision' ? 'vision' : 'text';
    const result = await routeModels(kind);
    setRoute(learnerId, result);
    res.json(result);
  } catch (err) {
    console.error('route probe failed:', err);
    res.status(500).json({ error: 'route probe failed' });
  }
});

router.post('/learner/:learnerId/node/:conceptId/start', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { lang, track } = req.body || {};
    await enterNode(learnerId, conceptId);
    const turn = await respond(learnerId, conceptId, undefined, true, lang || 'en', track === 'advanced' ? 'advanced' : 'foundation');
    res.json(turn);
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.error('start: model unavailable —', err.detail);
      return res.json({ message: await serviceDownMessage(req.body?.lang || 'en'), readyForGate: false, systemError: true, failedModel: getCurrentText(req.params.learnerId) });
    }
    console.error('Error starting node:', err);
    res.status(500).json({ error: 'Failed to start node' });
  }
});

// Learner reply → next tutor turn + checklist + readiness.
router.post('/learner/:learnerId/node/:conceptId/reply', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { message, lang, track } = req.body;
    const turn = await respond(learnerId, conceptId, message, false, lang || 'en', track === 'advanced' ? 'advanced' : 'foundation');
    res.json(turn);
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.error('reply: model unavailable —', err.detail);
      return res.json({ message: await serviceDownMessage(req.body?.lang || 'en'), readyForGate: false, systemError: true, failedModel: getCurrentText(req.params.learnerId) });
    }
    console.error('Error in reply:', err);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// Streaming variant of /reply: Server-Sent Events. Emits `delta` frames as the tutor turn is generated
// (token-by-token, English only), then one authoritative `done` frame carrying the SAME turn shape as
// /reply (message + checklist + readyForGate + figure). The client falls back to /reply if this fails.
router.post('/learner/:learnerId/node/:conceptId/reply-stream', requireNodeAccess, async (req, res) => {
  const { learnerId, conceptId } = req.params;
  const { message, lang, track } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // tell any proxy (nginx/Render) not to buffer the stream
  (res as any).flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.();
  };
  try {
    const turn = await respond(
      learnerId,
      conceptId,
      message,
      false,
      lang || 'en',
      track === 'advanced' ? 'advanced' : 'foundation',
      (messageSoFar) => send('delta', { message: messageSoFar })
    );
    send('done', turn);
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.error('reply-stream: model unavailable —', err.detail);
      send('done', { message: await serviceDownMessage(req.body?.lang || 'en'), readyForGate: false, systemError: true, failedModel: getCurrentText(req.params.learnerId) });
    } else {
      console.error('Error in reply-stream:', err);
      send('error', { error: 'Failed to process reply' });
    }
  } finally {
    res.end();
  }
});

// "Help me" — vision reads the learner's scratchpad working and returns a grounded hint.
router.post('/learner/:learnerId/node/:conceptId/help', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { image, lang } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });
    const { message } = await helpWithSketch(learnerId, conceptId, image, lang || 'en');
    res.json({ message });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.error('help: vision unavailable —', err.detail);
      return res.json({ message: await serviceDownMessage(req.body?.lang || 'en'), systemError: true, failedModel: getVisionModel(req.params.learnerId) });
    }
    console.error('Error in help:', err);
    res.status(500).json({ error: 'Failed to help' });
  }
});

// Pose the gate.
router.post('/learner/:learnerId/node/:conceptId/gate', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const track = req.query.track === 'advanced' ? 'advanced' : 'foundation';
    const gate = await poseGate(learnerId, conceptId, track);
    res.json(gate);
  } catch (err) {
    console.error('Error posing gate:', err);
    res.status(500).json({ error: 'Failed to pose gate' });
  }
});

// Grade one gate in the set. `answer` is text, or a JPEG data URL for sketch gates.
router.post('/learner/:learnerId/node/:conceptId/gate-answer', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { gateId, answer, lang, track } = req.body;
    const result = await answerGate(learnerId, conceptId, gateId, answer, lang || 'en', track === 'advanced' ? 'advanced' : 'foundation');
    res.json({
      correct: result.correct,
      feedback: result.feedback,
      allPassed: result.allPassed,
      passedCount: result.passedCount,
      total: result.total,
      message: result.allPassed
        ? "That's the whole set cleared — concept passed! The next concepts are now open."
        : result.correct
          ? 'Correct — on to the next check.'
          : "Not quite — read the feedback and try this one again.",
    });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      // Grader is down — do NOT record a pass/fail (none was; the grader threw before persisting).
      console.error('gate-answer: grader unavailable —', err.detail);
      return res.json({ correct: false, allPassed: false, systemError: true, feedback: await serviceDownMessage(req.body?.lang || 'en'), failedModel: getCurrentText(req.params.learnerId) });
    }
    console.error('Error grading gate:', err);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// Details panel: content summary, progress, checklist, pain points.
router.get('/learner/:learnerId/node/:conceptId/detail', requireNodeAccess, async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const detail = await getNodeDetail(learnerId, conceptId);
    res.json(detail);
  } catch (err) {
    console.error('Error fetching node detail:', err);
    res.status(500).json({ error: 'Failed to fetch detail' });
  }
});

// ---- Final past-paper exam (README steps 5-6) ----

// List the board/past papers available for an exam.
router.get('/papers/:exam', (req, res) => {
  try {
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    res.json({ exam: req.params.exam, papers: listPapers(req.params.exam, subject) });
  } catch (err) {
    console.error('Error listing papers:', err);
    res.status(500).json({ error: 'Failed to list papers' });
  }
});

// The paper to sit: prompts/options/sections only (answers never leave the server), + resume state.
router.get('/learner/:learnerId/paper/:paperId', requirePaperAccess, async (req, res) => {
  try {
    const { learnerId, paperId } = req.params;
    const paper = paperForClient(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const answers = await paperState(learnerId, paperId);
    res.json({ paper, answers });
  } catch (err) {
    console.error('Error loading paper:', err);
    res.status(500).json({ error: 'Failed to load paper' });
  }
});

// Grade one answer (mcq/numeric deterministic; written → LLM vs marking scheme).
router.post('/learner/:learnerId/paper/:paperId/answer', requirePaperAccess, async (req, res) => {
  try {
    const { learnerId, paperId } = req.params;
    const { q, answer } = req.body || {};
    if (typeof q !== 'number' || typeof answer !== 'string') return res.status(400).json({ error: 'q (number) and answer (string) required' });
    const result = await answerPaperQuestion(learnerId, paperId, q, answer);
    res.json(result);
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.error('paper answer: marker unavailable —', err.detail);
      return res.json({ systemError: true, message: await serviceDownMessage() });
    }
    console.error('Error grading paper answer:', err);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// Score, per-section breakdown, and the weak-concept review (clickable back into those nodes).
router.get('/learner/:learnerId/paper/:paperId/result', requirePaperAccess, async (req, res) => {
  try {
    const { learnerId, paperId } = req.params;
    const result = await paperResult(learnerId, paperId);
    res.json(result);
  } catch (err) {
    console.error('Error computing paper result:', err);
    res.status(500).json({ error: 'Failed to compute result' });
  }
});

export default router;

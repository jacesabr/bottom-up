import express from 'express';
import { db } from '../db/index.js';
import { buNodePerformance } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { enterNode, respond, poseGate, answerGate, getNodeDetail, helpWithSketch, getConceptFigures } from '../core/teach-loop.js';
import { LANGUAGES } from '../core/languages.js';
import { getChaptersForSubject, getChapter, getConceptsForChapter } from '../core/content-cache.js';
import { computeChapterStatuses } from '../core/sequencer.js';
import { listPapers, paperForClient, answerPaperQuestion, paperResult, paperState } from '../core/papers.js';

const router = express.Router();

// Supported teaching/voice languages (for the UI selector).
router.get('/languages', (_req, res) => {
  res.json({ languages: Object.values(LANGUAGES) });
});

// Read-aloud: text → speech (Sarvam → ElevenLabs → Deepgram-Aura → null=browser TTS).
router.post('/tts', async (req, res) => {
  try {
    const { text, lang } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text' });
    const { synthesize } = await import('../core/voice.js');
    const out = await synthesize(String(text), lang || 'en');
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
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).end();
    }
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
router.get('/concept/:conceptId/figures', async (req, res) => {
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
    const passed = new Set(perfRows.filter((p) => p.status === 'passed').map((p) => p.conceptId));

    const nodes = concepts.map((concept) => {
      const existing = statusOf.get(concept.id);
      let status: string;
      if (existing) status = existing; // passed | teaching | awaiting_gate | needs_reteach
      else status = concept.prereqs.every((p) => passed.has(p)) ? 'available' : 'locked';
      return { id: concept.id, slug: concept.slug, title: concept.title, role: concept.role, order: concept.order, status };
    });

    res.json({ chapter: { id: chapter.id, title: chapter.title }, nodes });
  } catch (err) {
    console.error('Error fetching chapter:', err);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// Start a node: enter + opening tutor turn (no intro friction — the AI just begins).
router.post('/learner/:learnerId/node/:conceptId/start', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { lang, track } = req.body || {};
    await enterNode(learnerId, conceptId);
    const turn = await respond(learnerId, conceptId, undefined, true, lang || 'en', track === 'advanced' ? 'advanced' : 'foundation');
    res.json(turn);
  } catch (err) {
    console.error('Error starting node:', err);
    res.status(500).json({ error: 'Failed to start node' });
  }
});

// Learner reply → next tutor turn + checklist + readiness.
router.post('/learner/:learnerId/node/:conceptId/reply', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { message, lang, track } = req.body;
    const turn = await respond(learnerId, conceptId, message, false, lang || 'en', track === 'advanced' ? 'advanced' : 'foundation');
    res.json(turn);
  } catch (err) {
    console.error('Error in reply:', err);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// "Help me" — vision reads the learner's scratchpad working and returns a grounded hint.
router.post('/learner/:learnerId/node/:conceptId/help', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { image, lang } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });
    const { message } = await helpWithSketch(learnerId, conceptId, image, lang || 'en');
    res.json({ message });
  } catch (err) {
    console.error('Error in help:', err);
    res.status(500).json({ error: 'Failed to help' });
  }
});

// Pose the gate.
router.post('/learner/:learnerId/node/:conceptId/gate', async (req, res) => {
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
router.post('/learner/:learnerId/node/:conceptId/gate-answer', async (req, res) => {
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
    console.error('Error grading gate:', err);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// Details panel: content summary, progress, checklist, pain points.
router.get('/learner/:learnerId/node/:conceptId/detail', async (req, res) => {
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
router.get('/learner/:learnerId/paper/:paperId', async (req, res) => {
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
router.post('/learner/:learnerId/paper/:paperId/answer', async (req, res) => {
  try {
    const { learnerId, paperId } = req.params;
    const { q, answer } = req.body || {};
    if (typeof q !== 'number' || typeof answer !== 'string') return res.status(400).json({ error: 'q (number) and answer (string) required' });
    const result = await answerPaperQuestion(learnerId, paperId, q, answer);
    res.json(result);
  } catch (err) {
    console.error('Error grading paper answer:', err);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// Score, per-section breakdown, and the weak-concept review (clickable back into those nodes).
router.get('/learner/:learnerId/paper/:paperId/result', async (req, res) => {
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

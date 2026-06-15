import express from 'express';
import { db } from '../db/index.js';
import { chapters as chaptersTable, concepts as conceptsTable } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { computeAvailability, initializeChapter } from '../core/sequencer.js';
import { enterNode, respond, poseGate, answerGate, getNodeDetail, helpWithSketch } from '../core/teach-loop.js';
import { LANGUAGES } from '../core/languages.js';

const router = express.Router();

// Supported teaching/voice languages (for the UI selector).
router.get('/languages', (_req, res) => {
  res.json({ languages: Object.values(LANGUAGES) });
});

// List chapters for an exam+subject (strict-linear status). 14 maths chapters.
router.get('/chapters/:exam/:subject', async (req, res) => {
  try {
    const { exam, subject } = req.params;
    const subjectId = `${exam}:${subject}`;
    const rows = await db
      .select()
      .from(chaptersTable)
      .where(eq(chaptersTable.subjectId, subjectId));

    // textbook order = jemh1NN ascending by id
    const ordered = rows.sort((a, b) => a.id.localeCompare(b.id));
    const list = ordered.map((c, i) => ({
      id: c.id,
      title: c.title,
      index: i + 1,
      // Strict-linear: first chapter active, rest locked (per-learner completion wires in later).
      status: i === 0 ? 'active' : 'locked',
    }));
    res.json({ exam, subject, chapters: list });
  } catch (err) {
    console.error('Error listing chapters:', err);
    res.status(500).json({ error: 'Failed to list chapters' });
  }
});

// Chapter with this learner's node states (the in-chapter node map).
router.get('/learner/:learnerId/chapter/:chapterId', async (req, res) => {
  try {
    const { learnerId, chapterId } = req.params;
    const chapter = await db.query.chapters.findFirst({
      where: (c, { eq }) => eq(c.id, chapterId),
    });
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

    await initializeChapter(learnerId, chapterId);
    const states = await computeAvailability(learnerId, chapterId);

    const concepts = await db
      .select()
      .from(conceptsTable)
      .where(eq(conceptsTable.chapterId, chapterId))
      .orderBy(asc(conceptsTable.order));

    const nodes = concepts.map((concept) => ({
      id: concept.id,
      slug: concept.slug,
      title: concept.title,
      role: concept.role,
      order: concept.order,
      status: states.find((s) => s.conceptId === concept.id)?.status ?? 'locked',
    }));

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
    const { lang } = req.body || {};
    await enterNode(learnerId, conceptId);
    const turn = await respond(learnerId, conceptId, undefined, true, lang || 'en');
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
    const { message, lang } = req.body;
    const turn = await respond(learnerId, conceptId, message, false, lang || 'en');
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
    const gate = await poseGate(learnerId, conceptId);
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
    const { gateId, answer, lang } = req.body;
    const result = await answerGate(learnerId, conceptId, gateId, answer, lang || 'en');
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

export default router;

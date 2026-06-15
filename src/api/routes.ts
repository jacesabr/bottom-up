import express from 'express';
import { db } from '../db/index.js';
import { chapters as chaptersTable, concepts as conceptsTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { computeAvailability, initializeChapter } from '../core/sequencer.js';
import {
  enterNode,
  tutorTurn,
  learnerReply,
  poseGate,
  gradeGate,
  passGate,
  failGate,
} from '../core/teach-loop.js';

const router = express.Router();

// Get chapter with learner's node states
router.get('/learner/:learnerId/chapter/:chapterId', async (req, res) => {
  try {
    const { learnerId, chapterId } = req.params;

    const chapter = await db.query.chapters.findFirst({
      where: (chapters, { eq }) => eq(chapters.id, chapterId),
    });

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Initialize chapter if not already done
    await initializeChapter(learnerId, chapterId);

    // Get node states
    const states = await computeAvailability(learnerId, chapterId);

    // Get full concept data for each node
    const concepts = await db
      .select()
      .from(conceptsTable)
      .where(eq(conceptsTable.chapterId, chapterId));

    const nodes = concepts.map(concept => {
      const state = states.find(s => s.conceptId === concept.id);
      return {
        id: concept.id,
        slug: concept.slug,
        title: concept.title,
        role: concept.role,
        order: concept.order,
        status: state?.status || 'locked',
      };
    });

    res.json({
      chapter: {
        id: chapter.id,
        title: chapter.title,
      },
      nodes,
    });
  } catch (error) {
    console.error('Error fetching chapter:', error);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// Enter node
router.post('/learner/:learnerId/node/:conceptId/enter', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;

    const concept = await db.query.concepts.findFirst({
      where: (concepts, { eq }) => eq(concepts.id, conceptId),
    });

    if (!concept) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const context = await enterNode(learnerId, conceptId);

    res.json({
      success: true,
      conceptId,
      title: concept.title,
      brief: concept.brief,
      keyMoves: concept.keyMoves,
    });
  } catch (error) {
    console.error('Error entering node:', error);
    res.status(500).json({ error: 'Failed to enter node' });
  }
});

// Get tutor response
router.post('/learner/:learnerId/node/:conceptId/tutor-turn', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;

    const concept = await db.query.concepts.findFirst({
      where: (concepts, { eq }) => eq(concepts.id, conceptId),
    });

    if (!concept) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    // Create a minimal context for the turn
    const context = {
      learnerId,
      conceptId,
      chapterId: concept.chapterId,
      concept,
      keyMoveStates: concept.keyMoves.map((text, index) => ({
        index,
        text,
        demonstrated: false,
      })),
      allKeyMovesDemonstrated: false,
      dialogue: [],
      currentGateAttemptNo: 1,
    };

    const { response, checklist } = await tutorTurn(context);

    res.json({
      message: response,
      checklist,
    });
  } catch (error) {
    console.error('Error in tutor turn:', error);
    res.status(500).json({ error: 'Failed to process tutor turn' });
  }
});

// Process learner reply
router.post('/learner/:learnerId/node/:conceptId/learner-reply', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { message } = req.body;

    const concept = await db.query.concepts.findFirst({
      where: (concepts, { eq }) => eq(concepts.id, conceptId),
    });

    if (!concept) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const context = {
      learnerId,
      conceptId,
      chapterId: concept.chapterId,
      concept,
      keyMoveStates: concept.keyMoves.map((text, index) => ({
        index,
        text,
        demonstrated: false,
      })),
      allKeyMovesDemonstrated: false,
      dialogue: [],
      currentGateAttemptNo: 1,
    };

    await learnerReply(context, message);

    // Get updated checklist state
    const checklist = await db.query.buNodeChecklist.findMany({
      where: (table, { eq, and }) =>
        and(eq(table.learnerId, learnerId), eq(table.conceptId, conceptId)),
    });

    // Check if all key moves are now demonstrated
    const allDemonstrated = concept.keyMoves.every((_, index) =>
      checklist.some(c => c.keyMoveIndex === index && c.demonstrated)
    );

    res.json({
      success: true,
      allKeyMovesDemonstrated: allDemonstrated,
      checklist: checklist.map(c => ({
        keyMoveIndex: c.keyMoveIndex,
        demonstrated: c.demonstrated,
      })),
    });
  } catch (error) {
    console.error('Error processing learner reply:', error);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// Pose gate
router.post('/learner/:learnerId/node/:conceptId/gate', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;

    const concept = await db.query.concepts.findFirst({
      where: (concepts, { eq }) => eq(concepts.id, conceptId),
    });

    if (!concept) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const context = {
      learnerId,
      conceptId,
      chapterId: concept.chapterId,
      concept,
      keyMoveStates: [],
      allKeyMovesDemonstrated: true, // Assume ready to pose
      dialogue: [],
      currentGateAttemptNo: 1,
    };

    const { gateId, prompt } = await poseGate(context);

    // Get gate details
    const gate = await db.query.gates.findFirst({
      where: (gates, { eq }) => eq(gates.id, gateId),
    });

    const expected = gate?.expected as any;
    let gateOptions = null;

    if (gate?.answerType === 'mcq') {
      gateOptions = expected.options;
    }

    res.json({
      gateId,
      prompt,
      answerType: gate?.answerType,
      options: gateOptions,
    });
  } catch (error) {
    console.error('Error posing gate:', error);
    res.status(500).json({ error: 'Failed to pose gate' });
  }
});

// Grade gate answer
router.post('/learner/:learnerId/node/:conceptId/gate-answer', async (req, res) => {
  try {
    const { learnerId, conceptId } = req.params;
    const { gateId, answer } = req.body;

    const concept = await db.query.concepts.findFirst({
      where: (concepts, { eq }) => eq(concepts.id, conceptId),
    });

    if (!concept) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const context = {
      learnerId,
      conceptId,
      chapterId: concept.chapterId,
      concept,
      keyMoveStates: [],
      allKeyMovesDemonstrated: true,
      dialogue: [],
      currentGateAttemptNo: 1,
    };

    const { correct } = await gradeGate(context, gateId, answer);

    if (correct) {
      await passGate(context);
    } else {
      await failGate(context);
    }

    res.json({
      correct,
      message: correct
        ? 'Great! You passed this concept. Moving to the next.'
        : 'Let me re-teach this concept. Try again.',
    });
  } catch (error) {
    console.error('Error grading gate:', error);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

export default router;

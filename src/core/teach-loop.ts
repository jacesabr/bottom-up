import { db } from '../db/index.js';
import { concepts as conceptsTable, gates, buEvent, buNodePerformance, buNodeChecklist, buGateAttempt } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { recomputeAvailabilityAfterPass } from './sequencer.js';

interface KeyMoveState {
  index: number;
  text: string;
  demonstrated: boolean;
  demonstratedAt?: Date;
  evidence?: string;
}

interface TeachingTurn {
  role: 'tutor' | 'learner';
  content: string;
  checklist?: {
    keyMovesDemonstrated: Array<{ index: number; evidence: string }>;
    misconceptionsSeen: string[];
  };
  signal?: 'ready_for_gate' | 'needs_more_teaching';
}

interface TeachingContext {
  learnerId: string;
  conceptId: string;
  chapterId: string;
  concept: any;
  keyMoveStates: KeyMoveState[];
  allKeyMovesDemonstrated: boolean;
  dialogue: TeachingTurn[];
  currentGateAttemptNo: number;
}

/**
 * Enter a node: initialize context, emit event, return initial tutor question.
 */
export async function enterNode(learnerId: string, conceptId: string): Promise<TeachingContext> {
  const concept = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.id, conceptId));

  if (!concept.length) {
    throw new Error(`Concept not found: ${conceptId}`);
  }

  const c = concept[0];

  // Emit enter_node event
  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'enter_node',
    payload: { conceptId, title: c.title },
  });

  // Initialize checklist
  const keyMoveStates = c.keyMoves.map((text, index) => ({
    index,
    text,
    demonstrated: false,
  }));

  // Update performance
  await db
    .update(buNodePerformance)
    .set({
      status: 'teaching',
      enteredAt: new Date(),
      attempts: (await db.select().from(buNodePerformance).where(
        and(
          eq(buNodePerformance.learnerId, learnerId),
          eq(buNodePerformance.conceptId, conceptId)
        )
      )).then(r => r[0]?.attempts ?? 0),
    })
    .where(and(
      eq(buNodePerformance.learnerId, learnerId),
      eq(buNodePerformance.conceptId, conceptId)
    ));

  const context: TeachingContext = {
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    concept: c,
    keyMoveStates,
    allKeyMovesDemonstrated: false,
    dialogue: [],
    currentGateAttemptNo: 1,
  };

  return context;
}

/**
 * Process a tutor turn: call node-agent, parse checklist delta, emit events.
 * For now, mock the node-agent call.
 */
export async function tutorTurn(context: TeachingContext, _userMessage?: string): Promise<{ response: string; checklist: any }> {
  // Mock: call node-agent/respond
  // In production, this calls the actual node-agent with the concept brain + dialogue
  const tutorResponse = `Let me help you understand ${context.concept.title}.

  ${context.concept.brief}

  Here's the first key idea: ${context.concept.keyMoves[0]}

  Can you explain what this means in your own words?`;

  const checklist = {
    keyMovesDemonstrated: [] as Array<{ index: number; evidence: string }>,
    misconceptionsSeen: [] as string[],
  };

  // Emit tutor_turn
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'tutor_turn',
    payload: { message: tutorResponse, checklist },
  });

  return { response: tutorResponse, checklist };
}

/**
 * Process learner reply: update checklist, emit events.
 */
export async function learnerReply(context: TeachingContext, message: string): Promise<void> {
  // Emit learner_turn
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'learner_turn',
    payload: { message },
  });

  // In production: parse the message for evidence of key moves
  // For now, mock: assume the first key move is demonstrated
  const keyMoveIndex = 0;
  const evidence = message;

  // Update checklist state
  const existingChecklist = await db
    .select()
    .from(buNodeChecklist)
    .where(and(
      eq(buNodeChecklist.learnerId, context.learnerId),
      eq(buNodeChecklist.conceptId, context.conceptId),
      eq(buNodeChecklist.keyMoveIndex, keyMoveIndex)
    ));

  if (!existingChecklist.length) {
    await db.insert(buNodeChecklist).values({
      learnerId: context.learnerId,
      conceptId: context.conceptId,
      keyMoveIndex,
      demonstrated: true,
      evidence,
      demonstratedAt: new Date(),
    });

    await db.insert(buEvent).values({
      learnerId: context.learnerId,
      conceptId: context.conceptId,
      chapterId: context.chapterId,
      type: 'keymove_demonstrated',
      payload: { keyMoveIndex, evidence },
    });
  }

  context.keyMoveStates[keyMoveIndex].demonstrated = true;
  context.keyMoveStates[keyMoveIndex].demonstratedAt = new Date();
  context.keyMoveStates[keyMoveIndex].evidence = evidence;

  context.allKeyMovesDemonstrated = context.keyMoveStates.every(k => k.demonstrated);
}

/**
 * Check readiness and pose gate (if all key moves demonstrated).
 */
export async function poseGate(context: TeachingContext): Promise<{ gateId: string; prompt: string }> {
  if (!context.allKeyMovesDemonstrated) {
    throw new Error('Not all key moves demonstrated yet');
  }

  const gate = await db
    .select()
    .from(gates)
    .where(eq(gates.conceptId, context.conceptId));

  if (!gate.length) {
    throw new Error(`No gate found for concept ${context.conceptId}`);
  }

  const g = gate[0];

  // Emit gate_posed
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'gate_posed',
    payload: { gateId: g.id, prompt: g.prompt },
  });

  // Update status
  await db
    .update(buNodePerformance)
    .set({ status: 'awaiting_gate' })
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
      eq(buNodePerformance.conceptId, context.conceptId)
    ));

  return { gateId: g.id, prompt: g.prompt };
}

/**
 * Grade gate answer and emit result.
 * Return true if pass, false if fail.
 */
export async function gradeGate(
  context: TeachingContext,
  gateId: string,
  learnerAnswer: string
): Promise<{ correct: boolean; gradedBy: string }> {
  const gate = await db
    .select()
    .from(gates)
    .where(eq(gates.id, gateId));

  if (!gate.length) {
    throw new Error(`Gate not found: ${gateId}`);
  }

  const g = gate[0];

  // Grade based on type
  let correct = false;
  let gradedBy = 'deterministic';

  if (g.grader === 'mcq') {
    correct = learnerAnswer === (g.expected as any).correct;
  } else if (g.grader === 'cas') {
    // Mock CAS check: for now, accept the example answer
    const expected = (g.expected as any).equivalentTo;
    correct = learnerAnswer.includes('2^3') && learnerAnswer.includes('3^2');
  }

  // Record attempt
  await db.insert(buGateAttempt).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    gateId,
    attemptNo: context.currentGateAttemptNo,
    prompt: g.prompt,
    learnerAnswer,
    correct,
    gradedBy,
    ms: 0, // Would track time in production
  });

  // Emit gate_answer
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'gate_answer',
    payload: { gateId, answer: learnerAnswer, correct, gradedBy },
  });

  return { correct, gradedBy };
}

/**
 * Handle pass: advance node, unlock dependents, emit events.
 */
export async function passGate(context: TeachingContext): Promise<void> {
  // Emit gate_pass
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'gate_pass',
    payload: { conceptId: context.conceptId },
  });

  // Update performance
  const current = await db
    .select()
    .from(buNodePerformance)
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
      eq(buNodePerformance.conceptId, context.conceptId)
    ));

  const perf = current[0];
  const isFirstPass = perf?.attempts === 1;

  await db
    .update(buNodePerformance)
    .set({
      status: 'passed',
      firstPass: isFirstPass,
      passes: (perf?.passes ?? 0) + 1,
      passedAt: new Date(),
    })
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
      eq(buNodePerformance.conceptId, context.conceptId)
    ));

  // Emit node_complete
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'node_complete',
    payload: { conceptId: context.conceptId },
  });

  // Recompute availability for dependents
  await recomputeAvailabilityAfterPass(context.learnerId, context.conceptId);

  // Check if chapter is complete
  const concepts = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.chapterId, context.chapterId));

  const performance = await db
    .select()
    .from(buNodePerformance)
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
    ));

  const allPassed = concepts.every(c =>
    performance.some(p => p.conceptId === c.id && p.status === 'passed')
  );

  if (allPassed) {
    await db.insert(buEvent).values({
      learnerId: context.learnerId,
      chapterId: context.chapterId,
      type: 'chapter_complete',
      payload: { chapterId: context.chapterId },
    });
  }
}

/**
 * Handle fail: emit event, trigger reteach.
 */
export async function failGate(context: TeachingContext): Promise<void> {
  // Emit gate_fail
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'gate_fail',
    payload: { conceptId: context.conceptId },
  });

  // Update performance
  await db
    .update(buNodePerformance)
    .set({
      status: 'needs_reteach',
      fails: (await db.select().from(buNodePerformance).where(
        and(
          eq(buNodePerformance.learnerId, context.learnerId),
          eq(buNodePerformance.conceptId, context.conceptId)
        )
      )).then(r => r[0]?.fails ?? 0) + 1,
    })
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
      eq(buNodePerformance.conceptId, context.conceptId)
    ));

  // Emit reteach_enter
  await db.insert(buEvent).values({
    learnerId: context.learnerId,
    conceptId: context.conceptId,
    chapterId: context.chapterId,
    type: 'reteach_enter',
    payload: { conceptId: context.conceptId },
  });

  // Return to teaching state
  await db
    .update(buNodePerformance)
    .set({ status: 'teaching' })
    .where(and(
      eq(buNodePerformance.learnerId, context.learnerId),
      eq(buNodePerformance.conceptId, context.conceptId)
    ));

  context.currentGateAttemptNo += 1;
}

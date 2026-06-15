import { concepts as conceptsTable, buNodePerformance, buEvent } from '../db/schema.js';
import { db } from '../db/index.js';
import { eq, and } from 'drizzle-orm';

export type NodeStatus = 'locked' | 'available' | 'teaching' | 'awaiting_gate' | 'needs_reteach' | 'passed';

interface Concept {
  id: string;
  order: number;
  prereqs: string[];
}

interface NodeState {
  conceptId: string;
  status: NodeStatus;
}

/**
 * Compute node availability for a learner in a chapter.
 * A node is available if all in-chapter prerequisites are passed.
 * Respects the bottom-up ordering (bedrock first, then dependents).
 */
export async function computeAvailability(learnerId: string, chapterId: string): Promise<NodeState[]> {
  // Get all concepts in the chapter
  const concepts = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.chapterId, chapterId));

  // Get learner's performance for each concept
  const performance = await db
    .select()
    .from(buNodePerformance)
    .where(and(
      eq(buNodePerformance.learnerId, learnerId),
      // Filter for concepts in this chapter
    ));

  const performanceMap = new Map(performance.map(p => [p.conceptId, p]));

  // Compute status for each concept
  const states = concepts.map(concept => {
    const perf = performanceMap.get(concept.id);

    if (perf && perf.status === 'passed') {
      return { conceptId: concept.id, status: 'passed' as NodeStatus };
    }

    // Check if all prerequisites are passed
    const allPrereqsPassed = concept.prereqs.every(prereqId => {
      const prereqPerf = performanceMap.get(prereqId);
      return prereqPerf && prereqPerf.status === 'passed';
    });

    if (perf) {
      // Learner has entered this node
      return { conceptId: concept.id, status: perf.status };
    }

    // Node not started: available if all prereqs passed
    return { conceptId: concept.id, status: allPrereqsPassed ? 'available' : 'locked' };
  });

  return states;
}

/**
 * Initialize a learner's chapter progress (first entry).
 * Creates locked performance records for all concepts.
 */
export async function initializeChapter(learnerId: string, chapterId: string) {
  const concepts = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.chapterId, chapterId));

  for (const concept of concepts) {
    const existing = await db
      .select()
      .from(buNodePerformance)
      .where(and(
        eq(buNodePerformance.learnerId, learnerId),
        eq(buNodePerformance.conceptId, concept.id)
      ));

    if (!existing.length) {
      await db.insert(buNodePerformance).values({
        learnerId,
        conceptId: concept.id,
        status: concept.prereqs.length === 0 ? 'available' : 'locked',
        attempts: 0,
        passes: 0,
        fails: 0,
      });
    }
  }
}

/**
 * Recompute availability after a node passes.
 * Unlocks dependent nodes.
 */
export async function recomputeAvailabilityAfterPass(learnerId: string, conceptId: string) {
  const concept = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.id, conceptId));

  if (!concept.length) return;

  const chapterId = concept[0].chapterId;

  // Find all concepts that depend on this one
  const dependents = await db
    .select()
    .from(conceptsTable)
    .where(
      and(
        eq(conceptsTable.chapterId, chapterId),
        // We'd need a better query for this, but for now we'll check each
      )
    );

  for (const dependent of dependents) {
    if (!dependent.prereqs.includes(conceptId)) continue;

    // Check if all prereqs are now passed
    const allPrereqsPassed = dependent.prereqs.every(async (prereqId) => {
      const perf = await db
        .select()
        .from(buNodePerformance)
        .where(and(
          eq(buNodePerformance.learnerId, learnerId),
          eq(buNodePerformance.conceptId, prereqId)
        ));
      return perf.length > 0 && perf[0].status === 'passed';
    });

    if (await allPrereqsPassed) {
      await db
        .update(buNodePerformance)
        .set({ status: 'available' })
        .where(and(
          eq(buNodePerformance.learnerId, learnerId),
          eq(buNodePerformance.conceptId, dependent.id)
        ));
    }
  }
}

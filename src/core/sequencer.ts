import { concepts as conceptsTable, buNodePerformance, buEvent } from '../db/schema.js';
import { db } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { getChaptersForSubject, getConceptsForChapter } from './content-cache.js';

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
 * UNLOCK-ALL: every node is open (grey) from the start so a learner can jump straight to any
 * concept to refresh it; a node only turns 'passed' (green) once they finish it. Prereqs are kept
 * on the concept for ordering/provenance but no longer gate access.
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
  const states: NodeState[] = concepts.map(concept => {
    const perf = performanceMap.get(concept.id);

    if (perf && perf.status === 'passed') {
      return { conceptId: concept.id, status: 'passed' as NodeStatus };
    }

    if (perf) {
      // Learner has entered this node. Everything is unlocked now, so a stale 'locked' row
      // (left from the old strict-linear DAG) surfaces as plain 'available' (grey).
      const status = perf.status === 'locked' ? 'available' : (perf.status as NodeStatus);
      return { conceptId: concept.id, status };
    }

    // Not started → always available (grey until passed). No prereq gating: every node is open.
    return { conceptId: concept.id, status: 'available' as NodeStatus };
  });

  return states;
}

export type ChapterStatus = 'complete' | 'active' | 'locked';

/**
 * Chapter progression for a learner across a subject — UNLOCK-ALL.
 * A chapter is COMPLETE when the learner has passed every concept in it; otherwise it is ACTIVE
 * (open, grey). No chapter is ever LOCKED — every chapter is reachable so a learner can dip into
 * any concept to revise it.
 */
export async function computeChapterStatuses(
  learnerId: string,
  subjectId: string
): Promise<Array<{ id: string; title: string; index: number; status: ChapterStatus }>> {
  const ordered = await getChaptersForSubject(subjectId);

  // One DB read: every concept this learner has passed (across the subject).
  const perfRows = await db
    .select()
    .from(buNodePerformance)
    .where(eq(buNodePerformance.learnerId, learnerId));
  const passed = new Set(perfRows.filter((p) => p.status === 'passed').map((p) => p.conceptId));

  // Per-chapter completion: chapter is complete iff it has concepts and all are passed.
  const complete: boolean[] = [];
  for (const ch of ordered) {
    const concepts = await getConceptsForChapter(ch.id);
    complete.push(concepts.length > 0 && concepts.every((c) => passed.has(c.id)));
  }

  // Unlock-all: a chapter is 'complete' once every concept in it is passed, else 'active' (open).
  return ordered.map((ch, i) => ({
    id: ch.id,
    title: ch.title,
    index: i + 1,
    status: (complete[i] ? 'complete' : 'active') as ChapterStatus,
  }));
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
        status: 'available', // unlock-all: every node starts open (grey)
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

  // All concepts in the chapter + this learner's performance rows
  const chapterConcepts = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.chapterId, chapterId));

  const perfRows = await db
    .select()
    .from(buNodePerformance)
    .where(eq(buNodePerformance.learnerId, learnerId));
  const statusOf = new Map(perfRows.map((p) => [p.conceptId, p.status]));

  for (const dependent of chapterConcepts) {
    if (!dependent.prereqs.includes(conceptId)) continue;
    // Don't downgrade a node already past 'available'
    const current = statusOf.get(dependent.id);
    if (current && current !== 'locked') continue;

    const allPrereqsPassed = dependent.prereqs.every(
      (prereqId) => statusOf.get(prereqId) === 'passed'
    );

    if (allPrereqsPassed) {
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

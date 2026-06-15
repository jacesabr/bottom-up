import { db } from '../db/index.js';
import {
  concepts as conceptsTable,
  gates,
  buEvent,
  buNodePerformance,
  buNodeChecklist,
  buGateAttempt,
} from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { recomputeAvailabilityAfterPass } from './sequencer.js';
import { teachTurn, gradeWritten, gradeSketch, gradeEquation, type KeyMove } from './node-agent.js';
import { nimVision } from './llm.js';

/**
 * The per-node teaching loop (bottom_up.md §4).
 * Source of truth = the append-only bu_event log; the dialogue is reconstructed from it,
 * and bu_node_checklist / bu_node_performance / bu_gate_attempt are fast derived reads.
 */

async function loadConcept(conceptId: string) {
  const rows = await db.select().from(conceptsTable).where(eq(conceptsTable.id, conceptId));
  if (!rows.length) throw new Error(`Concept not found: ${conceptId}`);
  return rows[0];
}

/** Reconstruct the current node's dialogue from the event log (since the latest enter_node). */
async function reconstructDialogue(learnerId: string, conceptId: string) {
  const events = await db
    .select()
    .from(buEvent)
    .where(and(eq(buEvent.learnerId, learnerId), eq(buEvent.conceptId, conceptId)))
    .orderBy(asc(buEvent.ts));

  const dialogue: Array<{ role: 'tutor' | 'learner'; content: string }> = [];
  for (const e of events) {
    if (e.type === 'tutor_turn') dialogue.push({ role: 'tutor', content: (e.payload as any)?.message ?? '' });
    else if (e.type === 'learner_turn') dialogue.push({ role: 'learner', content: (e.payload as any)?.message ?? '' });
  }
  return dialogue;
}

async function loadChecklist(learnerId: string, conceptId: string, keyMoves: string[]): Promise<KeyMove[]> {
  const rows = await db
    .select()
    .from(buNodeChecklist)
    .where(and(eq(buNodeChecklist.learnerId, learnerId), eq(buNodeChecklist.conceptId, conceptId)));
  const demoIdx = new Set(rows.filter((r) => r.demonstrated).map((r) => r.keyMoveIndex));
  return keyMoves.map((text, index) => ({ index, text, demonstrated: demoIdx.has(index) }));
}

async function markKeyMove(learnerId: string, conceptId: string, chapterId: string, index: number, evidence: string) {
  const existing = await db
    .select()
    .from(buNodeChecklist)
    .where(
      and(
        eq(buNodeChecklist.learnerId, learnerId),
        eq(buNodeChecklist.conceptId, conceptId),
        eq(buNodeChecklist.keyMoveIndex, index)
      )
    );
  if (existing.length && existing[0].demonstrated) return; // already shown

  if (existing.length) {
    await db
      .update(buNodeChecklist)
      .set({ demonstrated: true, evidence, demonstratedAt: new Date() })
      .where(eq(buNodeChecklist.id, existing[0].id));
  } else {
    await db.insert(buNodeChecklist).values({
      learnerId,
      conceptId,
      keyMoveIndex: index,
      demonstrated: true,
      evidence,
      demonstratedAt: new Date(),
    });
  }

  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId,
    type: 'keymove_demonstrated',
    payload: { keyMoveIndex: index, evidence },
  });
}

/** Enter a node: emit enter_node, set teaching, bump attempts. Returns concept + whether it's a re-entry. */
export async function enterNode(learnerId: string, conceptId: string) {
  const c = await loadConcept(conceptId);

  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'enter_node',
    payload: { conceptId, title: c.title },
  });

  const perf = await db
    .select()
    .from(buNodePerformance)
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));

  if (perf.length) {
    await db
      .update(buNodePerformance)
      .set({ status: 'teaching', enteredAt: perf[0].enteredAt ?? new Date(), attempts: (perf[0].attempts ?? 0) + 1 })
      .where(eq(buNodePerformance.id, perf[0].id));
  } else {
    await db.insert(buNodePerformance).values({
      learnerId,
      conceptId,
      status: 'teaching',
      enteredAt: new Date(),
      attempts: 1,
    });
  }

  return c;
}

interface TurnResult {
  message: string;
  checklist: Array<{ index: number; text: string; demonstrated: boolean }>;
  readyForGate: boolean;
  provider: string;
}

/** Produce the next tutor turn. If learnerMessage is given, record it first and apply the checklist delta. */
export async function respond(learnerId: string, conceptId: string, learnerMessage?: string): Promise<TurnResult> {
  const c = await loadConcept(conceptId);

  if (learnerMessage && learnerMessage.trim()) {
    await db.insert(buEvent).values({
      learnerId,
      conceptId,
      chapterId: c.chapterId,
      type: 'learner_turn',
      payload: { message: learnerMessage.trim() },
    });
  }

  const dialogue = await reconstructDialogue(learnerId, conceptId);
  const checklist = await loadChecklist(learnerId, conceptId, c.keyMoves);
  const isReteach = (await nodeStatus(learnerId, conceptId)) === 'needs_reteach';
  const isOpening = !learnerMessage && dialogue.length === 0;

  const turn = await teachTurn({
    conceptTitle: c.title,
    brief: c.brief,
    explanation: c.explanation,
    keyMoves: checklist,
    misconceptions: c.misconceptions,
    dialogue,
    isReteach,
  });

  // Apply checklist delta
  for (const d of turn.keyMovesDemonstrated) {
    if (typeof d.index === 'number' && d.index >= 0 && d.index < c.keyMoves.length) {
      await markKeyMove(learnerId, conceptId, c.chapterId, d.index, d.evidence ?? '');
    }
  }
  for (const m of turn.misconceptionsSeen) {
    await db.insert(buEvent).values({
      learnerId,
      conceptId,
      chapterId: c.chapterId,
      type: 'misconception_seen',
      payload: { label: m },
    });
  }

  // On the very first turn, prepend a warm welcome + how-to so every chat onboards the learner.
  let message = turn.message;
  if (isOpening) {
    const welcome =
      `Hi there! 👋 I'm your tutor — we'll take this one step at a time, no pressure, and you can't "fail" here; we just keep going until it clicks.\n\n` +
      `💡 Tap **Details** (top-right) anytime to see what we'll cover. The panel on the right is your **scratchpad** — sketch anything, even rough or half-finished working, then **Attach** it to your reply or hit **Help me** and I'll take a look.\n\n` +
      `Okay — let's begin. `;
    message = welcome + turn.message;
  }

  // Record tutor turn
  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'tutor_turn',
    payload: { message },
  });

  const updated = await loadChecklist(learnerId, conceptId, c.keyMoves);
  const allShown = updated.every((k) => k.demonstrated);

  return {
    message,
    checklist: updated,
    readyForGate: allShown || turn.readyForGate,
    provider: turn.provider,
  };
}

async function nodeStatus(learnerId: string, conceptId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(buNodePerformance)
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));
  return rows[0]?.status ?? null;
}

/** "Help me": read the learner's handwritten working (sketch) and give a short grounded hint. */
export async function helpWithSketch(learnerId: string, conceptId: string, imageDataUrl: string): Promise<{ message: string }> {
  const c = await loadConcept(conceptId);
  const checklist = await loadChecklist(learnerId, conceptId, c.keyMoves);
  const nextMove = checklist.find((k) => !k.demonstrated);

  const prompt = `You are a warm CBSE Class 10 maths tutor helping with the concept "${c.title}" (${c.brief}).
The image is the student's handwritten working. Read it, then give ONE short, encouraging hint (1–2 sentences) that nudges them toward${nextMove ? ` this idea: "${nextMove.text}"` : ' finishing'}.
Stay strictly on this concept. Use $...$ for maths. Do NOT give the full answer — just the next nudge.`;

  let message: string;
  try {
    message = (await nimVision(prompt, imageDataUrl)).trim();
  } catch {
    message = nextMove
      ? `I can see you're working it out — nice. Try focusing on this next: ${nextMove.text.toLowerCase()}. What do you get?`
      : `Good progress on paper! Talk me through your final step and we'll check it together.`;
  }

  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'tutor_turn',
    payload: { message, fromSketch: true },
  });
  return { message };
}

/** Ordered gate set for a concept: the 5 authored gates if present, else the original 'book' gate. */
async function gateSet(conceptId: string) {
  const rows = await db.select().from(gates).where(eq(gates.conceptId, conceptId));
  const authored = rows.filter((g) => g.kind === 'authored').sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
  return authored.length ? authored : rows;
}

/** Which gateIds the learner has already cleared (a correct attempt exists). */
async function passedGateIds(learnerId: string, conceptId: string): Promise<Set<string>> {
  const attempts = await db
    .select()
    .from(buGateAttempt)
    .where(and(eq(buGateAttempt.learnerId, learnerId), eq(buGateAttempt.conceptId, conceptId)));
  return new Set(attempts.filter((a) => a.correct).map((a) => a.gateId));
}

/** Pose the NEXT uncleared gate in the set (expected/answer never serialised). */
export async function poseGate(learnerId: string, conceptId: string) {
  const set = await gateSet(conceptId);
  if (!set.length) throw new Error(`No gate for concept ${conceptId}`);
  const c = await loadConcept(conceptId);
  const passed = await passedGateIds(learnerId, conceptId);

  const remaining = set.filter((g) => !passed.has(g.id));
  if (!remaining.length) return { allPassed: true, total: set.length, passedCount: set.length };

  const g = remaining[0];
  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'gate_posed',
    payload: { gateId: g.id, prompt: g.prompt, slot: g.slot },
  });
  await db
    .update(buNodePerformance)
    .set({ status: 'awaiting_gate' })
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));

  const expected = g.expected as any;
  return {
    gateId: g.id,
    slot: g.slot,
    prompt: g.prompt,
    answerType: g.answerType,
    options: g.answerType === 'mcq' ? expected.options : null,
    index: set.length - remaining.length + 1,
    total: set.length,
    allPassed: false,
  };
}

/**
 * Grade one gate (mcq/cas deterministic, written→rubric, sketch→vision), record it.
 * The node PASSES only when every gate in the set is cleared; a wrong answer gives
 * targeted feedback and the same gate is re-posed (seamless, no hard reset).
 */
export async function answerGate(learnerId: string, conceptId: string, gateId: string, answer: string) {
  const c = await loadConcept(conceptId);
  const grows = await db.select().from(gates).where(eq(gates.id, gateId));
  if (!grows.length) throw new Error(`Gate not found: ${gateId}`);
  const g = grows[0];
  const expected = g.expected as any;

  let correct = false;
  let feedback = '';
  let gradedBy = 'deterministic';
  if (g.grader === 'mcq') {
    const strip = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
    correct = norm(answer) === norm(expected.correct) || strip(answer) === strip(expected.correct);
    feedback = correct ? 'Correct.' : 'Not the right option — look again.';
  } else if (g.grader === 'cas') {
    const target = expected.equivalentTo ?? '';
    // Clean integer target → deterministic CAS; otherwise LLM equivalence vs the ideal answer.
    if (/^\d+$/.test(String(target).trim())) {
      correct = casEquivalent(answer, target);
      feedback = correct ? 'Correct.' : "That doesn't evaluate to the right value — recheck your working.";
    } else {
      gradedBy = 'equivalence';
      const r = await gradeEquation(g.prompt, g.idealAnswer ?? target, answer);
      correct = r.correct;
      feedback = r.feedback;
    }
  } else if (g.grader === 'rubric') {
    gradedBy = 'rubric';
    const r = await gradeWritten(g.prompt, g.rubric, g.idealAnswer, answer);
    correct = r.correct;
    feedback = r.feedback;
  } else if (g.grader === 'vision') {
    gradedBy = 'vision';
    const r = await gradeSketch(g.prompt, g.rubric, g.idealAnswer, answer);
    correct = r.correct;
    feedback = r.feedback;
  } else {
    correct = norm(answer) === norm(expected.correct ?? expected.answer ?? '');
  }

  const prior = await db
    .select()
    .from(buGateAttempt)
    .where(and(eq(buGateAttempt.learnerId, learnerId), eq(buGateAttempt.conceptId, conceptId)));
  const attemptNo = prior.length + 1;

  await db.insert(buGateAttempt).values({
    learnerId,
    conceptId,
    gateId,
    attemptNo,
    prompt: g.prompt,
    // sketch answers are big data URLs — store a marker, not the whole image
    learnerAnswer: g.grader === 'vision' ? '[sketch]' : answer,
    correct,
    gradedBy,
    ms: 0,
  });
  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'gate_answer',
    payload: { gateId, slot: g.slot, correct, gradedBy },
  });

  // Node passes only when the WHOLE set is cleared.
  const set = await gateSet(conceptId);
  const passed = await passedGateIds(learnerId, conceptId);
  const allPassed = set.every((gg) => passed.has(gg.id));

  if (allPassed) {
    await passNode(learnerId, conceptId, c.chapterId);
  } else if (!correct) {
    // targeted miss → record a fail (re-teach available), but keep the learner in the gate phase
    await db.insert(buEvent).values({ learnerId, conceptId, chapterId: c.chapterId, type: 'gate_fail', payload: { gateId } });
    const perf = await db
      .select()
      .from(buNodePerformance)
      .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));
    if (perf[0]) {
      await db
        .update(buNodePerformance)
        .set({ fails: (perf[0].fails ?? 0) + 1, firstPass: false })
        .where(eq(buNodePerformance.id, perf[0].id));
    }
  }

  return { correct, feedback, allPassed, passedCount: passed.size, total: set.length };
}

async function passNode(learnerId: string, conceptId: string, chapterId: string) {
  const perf = await db
    .select()
    .from(buNodePerformance)
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));
  const p = perf[0];
  const firstPass = (p?.fails ?? 0) === 0;

  await db.insert(buEvent).values({ learnerId, conceptId, chapterId, type: 'gate_pass', payload: { conceptId } });
  if (p) {
    await db
      .update(buNodePerformance)
      .set({ status: 'passed', firstPass, passes: (p.passes ?? 0) + 1, passedAt: new Date() })
      .where(eq(buNodePerformance.id, p.id));
  }
  await db.insert(buEvent).values({ learnerId, conceptId, chapterId, type: 'node_complete', payload: { conceptId } });

  await recomputeAvailabilityAfterPass(learnerId, conceptId);

  // chapter complete?
  const chapterConcepts = await db.select().from(conceptsTable).where(eq(conceptsTable.chapterId, chapterId));
  const perfRows = await db.select().from(buNodePerformance).where(eq(buNodePerformance.learnerId, learnerId));
  const passed = new Set(perfRows.filter((r) => r.status === 'passed').map((r) => r.conceptId));
  if (chapterConcepts.every((cc) => passed.has(cc.id))) {
    await db.insert(buEvent).values({ learnerId, chapterId, type: 'chapter_complete', payload: { chapterId } });
  }
}

async function failNode(learnerId: string, conceptId: string, chapterId: string) {
  const perf = await db
    .select()
    .from(buNodePerformance)
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));
  const p = perf[0];

  await db.insert(buEvent).values({ learnerId, conceptId, chapterId, type: 'gate_fail', payload: { conceptId } });
  await db.insert(buEvent).values({ learnerId, conceptId, chapterId, type: 'reteach_enter', payload: { conceptId } });
  if (p) {
    await db
      .update(buNodePerformance)
      .set({ status: 'needs_reteach', fails: (p.fails ?? 0) + 1, firstPass: false })
      .where(eq(buNodePerformance.id, p.id));
  }
}

/** Everything the Details panel needs: content summary, progress, checklist+evidence, pain points, the gate (question only). */
export async function getNodeDetail(learnerId: string, conceptId: string) {
  const c = await loadConcept(conceptId);

  // checklist with the evidence line that proved each key move
  const checkRows = await db
    .select()
    .from(buNodeChecklist)
    .where(and(eq(buNodeChecklist.learnerId, learnerId), eq(buNodeChecklist.conceptId, conceptId)));
  const evidenceByIdx = new Map(checkRows.map((r) => [r.keyMoveIndex, r]));
  const checklist = c.keyMoves.map((text, index) => ({
    index,
    text,
    demonstrated: !!evidenceByIdx.get(index)?.demonstrated,
    evidence: evidenceByIdx.get(index)?.evidence ?? null,
  }));

  // The gate question for transparency — NEVER the expected answer (server-only).
  const grows = await db.select().from(gates).where(eq(gates.conceptId, conceptId));
  const gate = grows.length
    ? {
        prompt: grows[0].prompt,
        answerType: grows[0].answerType,
        options: grows[0].answerType === 'mcq' ? (grows[0].expected as any).options : null,
        srcLabel: grows[0].srcLabel,
      }
    : null;
  const perf = await db
    .select()
    .from(buNodePerformance)
    .where(and(eq(buNodePerformance.learnerId, learnerId), eq(buNodePerformance.conceptId, conceptId)));
  const attempts = await db
    .select()
    .from(buGateAttempt)
    .where(and(eq(buGateAttempt.learnerId, learnerId), eq(buGateAttempt.conceptId, conceptId)))
    .orderBy(asc(buGateAttempt.attemptNo));
  const misconceptionEvents = await db
    .select()
    .from(buEvent)
    .where(and(eq(buEvent.learnerId, learnerId), eq(buEvent.conceptId, conceptId)));
  const painPoints = misconceptionEvents
    .filter((e) => e.type === 'misconception_seen')
    .map((e) => (e.payload as any)?.label)
    .filter(Boolean);

  // Tutor's notes — a human read of where this learner is, derived purely from tracked data
  // (no extra LLM call): current focus, sticking points, gate fails, next step.
  const shown = checklist.filter((c) => c.demonstrated).length;
  const nextMove = checklist.find((c) => !c.demonstrated);
  const status = perf[0]?.status ?? 'available';
  const fails = perf[0]?.fails ?? 0;

  let currentFocus: string;
  if (status === 'passed') currentFocus = 'Concept passed — gate cleared.';
  else if (!nextMove) currentFocus = 'All key ideas shown — at the gate check now.';
  else currentFocus = `Working to demonstrate: "${nextMove.text}".`;

  const stickingPoints: string[] = [];
  if (fails > 0) stickingPoints.push(`Missed the gate ${fails} time${fails > 1 ? 's' : ''} — re-teaching in place.`);
  for (const p of painPoints) stickingPoints.push(`Misconception seen: ${p}`);

  const notes = {
    summary: `On "${c.title}": ${shown}/${c.keyMoves.length} key ideas shown. ${currentFocus}`,
    currentFocus,
    gateFails: fails,
    stickingPoints,
    nextStep:
      status === 'passed'
        ? 'Move to a newly-unlocked concept.'
        : !nextMove
          ? 'Answer the gate question to pass.'
          : 'Continue the dialogue to solidify the current key idea.',
  };

  return {
    concept: {
      title: c.title,
      role: c.role,
      brief: c.brief,
      explanation: c.explanation,
      keyMoves: c.keyMoves,
      misconceptions: c.misconceptions,
    },
    progress: {
      status: perf[0]?.status ?? 'available',
      attempts: perf[0]?.attempts ?? 0,
      passes: perf[0]?.passes ?? 0,
      fails: perf[0]?.fails ?? 0,
      nudges: perf[0]?.nudges ?? 0,
      firstPass: perf[0]?.firstPass ?? null,
      enteredAt: perf[0]?.enteredAt ?? null,
      passedAt: perf[0]?.passedAt ?? null,
    },
    counts: {
      tutorTurns: misconceptionEvents.filter((e) => e.type === 'tutor_turn').length,
      learnerTurns: misconceptionEvents.filter((e) => e.type === 'learner_turn').length,
      events: misconceptionEvents.length,
    },
    checklist,
    gate,
    gateAttempts: attempts.map((a) => ({ attemptNo: a.attemptNo, answer: a.learnerAnswer, correct: a.correct })),
    painPoints,
    notes,
  };
}

function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tiny CAS check for "product of prime powers" answers (e.g. 2^3 * 3^2 * 5 * 7 * 13). */
function casEquivalent(answer: string, equivalentTo: string): boolean {
  try {
    const target = parseInt(equivalentTo, 10);
    const cleaned = answer.replace(/[×·]/g, '*').replace(/\s+/g, '');
    let product = 1;
    for (const factor of cleaned.split('*')) {
      if (!factor) continue;
      const [base, exp] = factor.split('^');
      const b = parseInt(base, 10);
      const e = exp ? parseInt(exp, 10) : 1;
      if (Number.isNaN(b) || Number.isNaN(e)) return false;
      product *= Math.pow(b, e);
    }
    return product === target;
  } catch {
    return false;
  }
}

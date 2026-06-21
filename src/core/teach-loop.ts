import { db } from '../db/index.js';
import {
  concepts as conceptsTable,
  gates,
  buEvent,
  buNodePerformance,
  buNodeChecklist,
  buGateAttempt,
  buChatSummary,
  buCorpusGap,
  buFigure,
} from '../db/schema.js';
import { eq, and, asc, desc, gt, sql } from 'drizzle-orm';
import { recomputeAvailabilityAfterPass } from './sequencer.js';
import { teachTurn, gradeWritten, gradeSketch, gradeEquation, translateText, summarizeConversation, type KeyMove } from './node-agent.js';
import { languageInstruction } from './languages.js';
import { nimVision } from './llm.js';
import { examProfile, type Track } from './exam-profile.js';
import { getTextModel, getVisionModel } from './route-store.js';

/**
 * The per-node teaching loop (bottom_up.md §4).
 * Source of truth = the append-only bu_event log; the dialogue is reconstructed from it,
 * and bu_node_checklist / bu_node_performance / bu_gate_attempt are fast derived reads.
 */

/**
 * Shown to the student (as a tutor bubble / gate feedback) when the live model is unavailable and we
 * therefore can't produce a real turn or grade. We say plainly that the app is down and that it's been
 * logged for the admin — never a fabricated lesson. The failure itself is recorded in bu_llm_call
 * (visible in the admin Errors view). English is translated best-effort into the learner's language.
 */
export const SERVICE_DOWN_MESSAGE =
  "⚠️ Sorry — I can't reach the tutor right now, so I can't reply properly. This has been logged automatically and the admin has been notified. Please wait a little and try again.";

export async function serviceDownMessage(langCode = 'en'): Promise<string> {
  if (!langCode || langCode === 'en') return SERVICE_DOWN_MESSAGE;
  try {
    return await translateText(SERVICE_DOWN_MESSAGE, langCode);
  } catch {
    return SERVICE_DOWN_MESSAGE;
  }
}

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
    if (e.type === 'tutor_turn') {
      // Skip the boilerplate welcome/opening turns so resumed history shows the real teaching only.
      if ((e.payload as any)?.opening) continue;
      const msg = (e.payload as any)?.message ?? '';
      if (isOpeningMessage(msg)) continue; // catch pre-flag openings already in the log
      dialogue.push({ role: 'tutor', content: msg });
    } else if (e.type === 'learner_turn') {
      dialogue.push({ role: 'learner', content: (e.payload as any)?.message ?? '' });
    }
  }
  return dialogue;
}

// Opening turns predate the payload.opening flag for some learners; match their fixed prefixes too.
const OPENING_PREFIXES = ['Welcome back', "Hi there. 🙂 I'm your tutor"];
function isOpeningMessage(m: string): boolean {
  return OPENING_PREFIXES.some((p) => m.startsWith(p));
}

/** Turn events (tutor/learner) strictly after a watermark timestamp. */
async function turnsSince(learnerId: string, conceptId: string, since: Date | null) {
  const base = and(eq(buEvent.learnerId, learnerId), eq(buEvent.conceptId, conceptId));
  const where = since ? and(base, gt(buEvent.ts, since)) : base;
  const events = await db.select().from(buEvent).where(where).orderBy(asc(buEvent.ts));
  const out: Array<{ role: 'tutor' | 'learner'; content: string; ts: Date | null }> = [];
  for (const e of events) {
    if (e.type === 'tutor_turn') out.push({ role: 'tutor', content: (e.payload as any)?.message ?? '', ts: e.ts });
    else if (e.type === 'learner_turn') out.push({ role: 'learner', content: (e.payload as any)?.message ?? '', ts: e.ts });
  }
  return out;
}

/** Resume context = stored running summary (compact) + the turns since its watermark. Bounds growth. */
async function buildContext(learnerId: string, conceptId: string) {
  const rows = await db
    .select()
    .from(buChatSummary)
    .where(and(eq(buChatSummary.learnerId, learnerId), eq(buChatSummary.conceptId, conceptId)));
  const summaryRow = rows[0];
  const recent = await turnsSince(learnerId, conceptId, summaryRow?.watermark ?? null);
  // Backstop against a lost thread: if the watermark has somehow advanced past the live turns (e.g. a
  // mid-lesson re-entry on a language switch folded them into the summary), `recent` can be empty/tiny and
  // the tutor would forget the very question it just asked, then reconstruct from the summary's older
  // frontier (loops back to an already-answered step). Always keep at least the last TAIL turns verbatim
  // alongside the summary so the immediate thread can never be summarized away. Cheap insurance.
  const TAIL = 6;
  const dialogue =
    recent.length >= TAIL ? recent : (await turnsSince(learnerId, conceptId, null)).slice(-TAIL);
  return {
    summary: summaryRow?.summary ?? null,
    recentDialogue: dialogue.map((t) => ({ role: t.role, content: t.content })),
  };
}

/**
 * Cold-start/revisit summarization: fold all turns up to now into the running summary and advance
 * the watermark. Runs once per node entry (not per turn). Cheap, occasional. No-op on a fresh node.
 */
export async function summarizeOnEntry(learnerId: string, conceptId: string): Promise<void> {
  const c = await loadConcept(conceptId);
  const rows = await db
    .select()
    .from(buChatSummary)
    .where(and(eq(buChatSummary.learnerId, learnerId), eq(buChatSummary.conceptId, conceptId)));
  const summaryRow = rows[0];
  const newTurns = await turnsSince(learnerId, conceptId, summaryRow?.watermark ?? null);
  if (!newTurns.length) return; // nothing new to fold (fresh node)

  // Don't distill a tutor-only monologue (repeated unanswered openings) into a resume note. With no learner
  // turn there's no progress to capture, and summarising the tutor's own openings is precisely what lets an
  // off-hand phrase drift further on each re-entry. Skip until the learner actually replies; once a summary
  // exists (built post-engagement) we keep folding normally.
  if (!summaryRow && !newTurns.some((t) => t.role === 'learner')) return;

  const updated = await summarizeConversation(
    c.title,
    summaryRow?.summary ?? null,
    newTurns.map((t) => ({ role: t.role, content: t.content }))
  );
  const watermark = newTurns[newTurns.length - 1].ts ?? new Date();
  const turnsSummarized = (summaryRow?.turnsSummarized ?? 0) + newTurns.length;

  if (summaryRow) {
    await db
      .update(buChatSummary)
      .set({ summary: updated, watermark, turnsSummarized })
      .where(eq(buChatSummary.id, summaryRow.id));
  } else {
    await db.insert(buChatSummary).values({ learnerId, conceptId, summary: updated, watermark, turnsSummarized });
  }
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

/** Relevant captioned textbook figures for a concept (served whole-page; no cropping). */
export async function getConceptFigures(conceptId: string) {
  const rows = await db
    .select()
    .from(buFigure)
    .where(and(eq(buFigure.relevant, true), sql`${conceptId} = ANY(${buFigure.conceptIds})`));
  return rows.map((f) => ({
    id: f.id,
    caption: f.caption ?? '',
    url: `figure/${f.chapterId}/${f.filename}`, // relative to apiBase
  }));
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

  // Cold-start: fold any prior-session turns into the running summary (fire-and-forget so /start
  // stays fast; buildContext tolerates a not-yet-updated summary).
  void summarizeOnEntry(learnerId, conceptId).catch((e) =>
    console.error('summarizeOnEntry (non-fatal):', e?.message ?? e)
  );

  return c;
}

interface TurnResult {
  message: string;
  checklist: Array<{ index: number; text: string; demonstrated: boolean }>;
  readyForGate: boolean;
  provider: string;
  figure?: { url: string; caption: string } | null;
  // On a resumed node, the prior conversation so the client can replay it before the opening turn.
  history?: Array<{ role: 'tutor' | 'learner'; text: string }>;
}

/** A warm, in-character Socrates opening — instant (no LLM wait), grounded in THIS concept. */
function socratesOpening(c: any, _nextMoveText?: string, returning = false, hasPrior = false): string {
  // Name the topic ONCE, cleanly, then a gentle prior-knowledge question (don't dump it as a goal,
  // don't assume they know the terms). The AI builds the actual idea up on the first real turn.
  const q = `Today's topic is **${c.title}**. Before we dive in — how are you feeling about it? Have you come across it before, or is it pretty new? Either way is completely fine, we'll take it nice and slow.`;

  // Resuming a node we've actually talked through before — don't restart, pick up the thread.
  if (hasPrior) {
    return (
      `Welcome back! 🙂 Here's our conversation so far on **${c.title}** above — take a moment to read back over it. ` +
      `When you're ready, let's carry on from where we left off. Want to keep going, or shall I give a quick recap first?`
    );
  }

  if (returning) {
    // Gentle reminder for a learner who's been here before — assume they may have forgotten.
    return (
      `Welcome back. 🙂 Quick reminder: tap **Details** (top-right) anytime, use the **scratchpad** for rough working ` +
      `(or **📷 scan** a photo of working you did on paper, straight onto it), then **Attach** it or hit **Help me** — ` +
      `and you can **🎤 speak** instead of typing or have replies **read aloud**.\n\n` +
      q
    );
  }

  return (
    `Hi there. 🙂 I'm your tutor — I won't lecture at you; I'll ask little questions and we'll figure it out together, ` +
    `step by step. There's no failing here, so relax.\n\n` +
    `A couple of handy things: tap **Details** (top-right) anytime, jot rough working on the **scratchpad** — or **📷 scan** ` +
    `a photo of working you did on paper straight onto it — then **Attach** it or hit **Help me**, and you can **🎤 speak** ` +
    `instead of typing or have my replies **read aloud**.\n\n` +
    q
  );
}

/** Warm, deterministic closing turn — used when the lesson just completed but the model didn't wrap up. */
function closingHandoff(c: any): string {
  return `Lovely — that's all the core ideas for **${c.title}** now. 🙂 Whenever you're ready, tap the button below and I'll give you a few quick checks to lock it in.`;
}

/** Produce the next tutor turn. `opening` forces a fresh warm open every time a node is entered. */
export async function respond(
  learnerId: string,
  conceptId: string,
  learnerMessage?: string,
  opening = false,
  langCode = 'en',
  track: Track = 'foundation',
  onDelta?: (messageSoFar: string) => void
): Promise<TurnResult> {
  const c = await loadConcept(conceptId);

  if (learnerMessage && learnerMessage.trim()) {
    const msg = learnerMessage.trim();
    // A turn that died mid-flight already logged this learner message before the model failed; the client
    // re-sends the SAME message on retry (failure-popup → retryRef). Don't double-log it — a duplicate
    // pollutes the running summary and the replayed history. This only skips when the identical message is
    // the very last event (i.e. a retry); a learner legitimately repeating a word has a tutor turn between.
    const last = await db
      .select()
      .from(buEvent)
      .where(and(eq(buEvent.learnerId, learnerId), eq(buEvent.conceptId, conceptId)))
      .orderBy(desc(buEvent.ts))
      .limit(1);
    const isRetryDuplicate = last[0]?.type === 'learner_turn' && (last[0]?.payload as any)?.message === msg;
    if (!isRetryDuplicate) {
      await db.insert(buEvent).values({
        learnerId,
        conceptId,
        chapterId: c.chapterId,
        type: 'learner_turn',
        payload: { message: msg },
      });
    }
  }

  const checklist = await loadChecklist(learnerId, conceptId, c.keyMoves);

  // OPENING: instant warm Socrates open (English template); translated for other languages.
  if (opening) {
    const nextMove = checklist.find((k) => !k.demonstrated);
    const enterCount = (
      await db
        .select()
        .from(buEvent)
        .where(and(eq(buEvent.learnerId, learnerId), eq(buEvent.type, 'enter_node')))
    ).length;
    const returning = enterCount > 1; // they've entered some node before → gentle reminder
    // Prior teaching turns for THIS node (excludes earlier openings) — replayed by the client.
    const prior = await reconstructDialogue(learnerId, conceptId);
    const hasPrior = prior.length > 0;
    let message = socratesOpening(c, nextMove?.text, returning, hasPrior);
    if (langCode !== 'en') message = await translateText(message, langCode);
    await db.insert(buEvent).values({
      learnerId,
      conceptId,
      chapterId: c.chapterId,
      type: 'tutor_turn',
      payload: { message, opening: true },
    });
    return {
      message,
      checklist,
      readyForGate: false,
      provider: 'opening',
      history: prior.map((d) => ({ role: d.role, text: d.content })),
    };
  }

  // Resume context = running summary (compact) + recent turns since its watermark (bounds growth).
  const { summary, recentDialogue } = await buildContext(learnerId, conceptId);
  const isReteach = (await nodeStatus(learnerId, conceptId)) === 'needs_reteach';
  const isOpening = false;
  const figures = await getConceptFigures(conceptId);

  const turn = await teachTurn(
    {
      conceptTitle: c.title,
      brief: c.brief,
      explanation: c.explanation,
      keyMoves: checklist,
      misconceptions: c.misconceptions,
      refreshers: (c as any).refreshers ?? [],
      dialogue: recentDialogue,
      priorSummary: summary ?? undefined,
      isReteach,
      lang: langCode,
      figures: figures.map((f) => ({ id: f.id, caption: f.caption })),
      conceptId,
      track,
      advancedContent: (c as any).advancedContent ?? null,
      ...getTextModel(learnerId), // per-session model from the speed router (empty → MODELS.text default)
    },
    // Stream live tokens only for English: a non-English turn is translated AFTER it completes, so its
    // streamed English prose would just be discarded and replaced by the translation on `done`.
    langCode === 'en' ? onDelta : undefined
  );

  // Resolve a referenced figure to a servable image (shown inline by the client).
  let figure = turn.figureRef ? figures.find((f) => f.id === turn.figureRef) ?? null : null;
  // Deterministic safety net: if the student explicitly asks to SEE something and we have a figure,
  // show it even if the model forgot to set figureRef (so a direct "show me the graph" always works).
  if (!figure && figures.length && learnerMessage && /\b(show|see|look|picture|graph|diagram|draw|visual|what.*look)\b/i.test(learnerMessage)) {
    figure = figures[0];
  }

  // Corpus gap: the tutor couldn't answer from our content — log it for review (→ docs/corpus_gap.md).
  if (turn.corpusGap?.missing) {
    await db.insert(buEvent).values({
      learnerId,
      conceptId,
      chapterId: c.chapterId,
      type: 'corpus_gap',
      payload: turn.corpusGap,
    });
    await db.insert(buCorpusGap).values({
      conceptId,
      chapterId: c.chapterId,
      learnerId,
      question: turn.corpusGap.question || null,
      missing: turn.corpusGap.missing,
    });
  }

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

  // Did THIS turn complete the concept? The server is the source of truth (deterministic), so we
  // don't rely on the model foreseeing its own completion — it often can't (the move still reads
  // "not yet" while it's generating).
  const updated = await loadChecklist(learnerId, conceptId, c.keyMoves);
  const prevAllShown = checklist.length > 0 && checklist.every((k) => k.demonstrated);
  const allShown = updated.length > 0 && updated.every((k) => k.demonstrated);
  const becameReady = allShown && !prevAllShown;

  // Teaching reasons in English (best quality); translate the final message to the learner's language.
  let message = turn.message;
  void isOpening;
  // Clean hand-off guarantee: if the student just finished the last key idea but the model still
  // ended on a fresh question (didn't wrap up), swap in a warm closing so the chat never leaves a
  // dangling question sitting beside the "I'm ready" checks button. Stronger models obey the prompt
  // and keep their own wrap-up (no trailing '?'), so this only fires as a safety net.
  if (becameReady && /\?\s*$/.test(message.trim())) {
    message = closingHandoff(c);
  }
  if (langCode !== 'en') message = await translateText(message, langCode);

  // Record tutor turn
  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'tutor_turn',
    payload: { message },
  });

  return {
    message,
    checklist: updated,
    // Completion is server-owned: gate only when the deterministic checklist says EVERY key move is
    // demonstrated. Do NOT honour the model's own readyForGate guess on a node that has key moves — a
    // weak model sets it true prematurely (after teaching only some moves), which cut lessons short.
    // The model's flag is only a fallback for the rare node with no key moves to track.
    readyForGate: c.keyMoves.length > 0 ? allShown : turn.readyForGate,
    provider: turn.provider,
    figure: figure ? { url: figure.url, caption: figure.caption } : null,
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
export async function helpWithSketch(learnerId: string, conceptId: string, imageDataUrl: string, langCode = 'en'): Promise<{ message: string }> {
  const c = await loadConcept(conceptId);
  const checklist = await loadChecklist(learnerId, conceptId, c.keyMoves);
  const nextMove = checklist.find((k) => !k.demonstrated);

  const prof = examProfile(conceptId);
  const prompt = `You are a warm ${prof.level} ${prof.subject} tutor helping with the concept "${c.title}" (${c.brief}).
The image is the student's handwritten working. Read it, then give ONE short, encouraging hint (1–2 sentences) that nudges them toward${nextMove ? ` this idea: "${nextMove.text}"` : ' finishing'}.
Stay strictly on this concept. Use $...$ for maths. Do NOT give the full answer — just the next nudge.`;

  // nimVision throws LlmUnavailableError if the vision model is down — let it propagate so the API
  // shows the graceful "unavailable" message, rather than a canned hint pretending we read the work.
  let message = (await nimVision(prompt, imageDataUrl, 400, getVisionModel(learnerId))).trim();
  if (langCode !== 'en') message = await translateText(message, langCode);

  await db.insert(buEvent).values({
    learnerId,
    conceptId,
    chapterId: c.chapterId,
    type: 'tutor_turn',
    payload: { message, fromSketch: true },
  });
  return { message };
}

/**
 * Ordered gate set for a concept. Foundation tier (every learner): the 5 authored gates if present,
 * else the original 'book' gate. On the ADVANCED track, the advanced-tier gates are appended after
 * the foundation set (so an advanced learner clears both). 'advanced'-tier gates are never shown to
 * a foundation learner.
 */
async function gateSet(conceptId: string, track: Track = 'foundation') {
  const rows = await db.select().from(gates).where(eq(gates.conceptId, conceptId));
  const byOrd = (a: any, b: any) => (a.ord ?? 0) - (b.ord ?? 0);
  const isAdvanced = (g: any) => g.tier === 'advanced';
  const authoredFoundation = rows.filter((g) => g.kind === 'authored' && !isAdvanced(g)).sort(byOrd);
  const base = authoredFoundation.length ? authoredFoundation : rows.filter((g) => !isAdvanced(g)).sort(byOrd);
  if (track !== 'advanced') return base;
  const advanced = rows.filter(isAdvanced).sort(byOrd);
  return [...base, ...advanced];
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
export async function poseGate(learnerId: string, conceptId: string, track: Track = 'foundation') {
  const set = await gateSet(conceptId, track);
  const c = await loadConcept(conceptId);
  if (!set.length) {
    // Teach-only node (no gate authored): completing the teaching IS the pass. Don't crash the learner
    // with a 500 — mark it passed AND log a 'missing_gate' flag so a node that's missing its gate by
    // mistake can be found and fixed (it surfaces in the admin events feed).
    await passNode(learnerId, conceptId, c.chapterId);
    await db.insert(buEvent).values({
      learnerId,
      conceptId,
      chapterId: c.chapterId,
      type: 'missing_gate',
      payload: { track },
    });
    return { allPassed: true, total: 0, passedCount: 0 };
  }
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
export async function answerGate(learnerId: string, conceptId: string, gateId: string, answer: string, langCode = 'en', track: Track = 'foundation') {
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
      const r = await gradeEquation(g.prompt, g.idealAnswer ?? target, answer, langCode, conceptId, track);
      correct = r.correct;
      feedback = r.feedback;
    }
  } else if (g.grader === 'rubric') {
    gradedBy = 'rubric';
    const r = await gradeWritten(g.prompt, g.rubric, g.idealAnswer, answer, langCode, conceptId, track);
    correct = r.correct;
    feedback = r.feedback;
  } else if (g.grader === 'vision') {
    gradedBy = 'vision';
    const tm = getTextModel(learnerId);
    const r = await gradeSketch(g.prompt, g.rubric, g.idealAnswer, answer, langCode, conceptId, track, getVisionModel(learnerId), tm.model, tm.modelFallback);
    correct = r.correct;
    feedback = r.feedback;
  } else {
    correct = norm(answer) === norm(expected.correct ?? expected.answer ?? '');
  }

  // All grading reasons in English; translate the feedback to the learner's language (strong model).
  if (langCode !== 'en') feedback = await translateText(feedback, langCode);

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

  // Node passes only when the WHOLE set is cleared (advanced track must also clear advanced gates).
  const set = await gateSet(conceptId, track);
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

  // Stored session memory (the running summary) + any content gaps flagged on this node.
  const summaryRows = await db
    .select()
    .from(buChatSummary)
    .where(and(eq(buChatSummary.learnerId, learnerId), eq(buChatSummary.conceptId, conceptId)));
  const sessionSummary = summaryRows[0]?.summary ?? null;
  const corpusGapRows = await db.select().from(buCorpusGap).where(eq(buCorpusGap.conceptId, conceptId));
  const corpusGaps = corpusGapRows.map((g) => g.missing).filter(Boolean);

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

  // The full gate set for transparency — NEVER the expected answer (server-only).
  const grows = await db.select().from(gates).where(eq(gates.conceptId, conceptId));
  const authored = grows.filter((g) => g.kind === 'authored').sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
  const gateRows = authored.length ? authored : grows;
  const gatesList = gateRows.map((g) => ({
    slot: g.slot,
    answerType: g.answerType,
    prompt: g.prompt,
    options: g.answerType === 'mcq' ? (g.expected as any).options : null,
  }));
  const gate = gatesList[0] ?? null; // back-compat
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
    gates: gatesList,
    gateAttempts: attempts.map((a) => ({ attemptNo: a.attemptNo, answer: a.learnerAnswer, correct: a.correct })),
    painPoints,
    notes,
    sessionSummary,
    corpusGaps,
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

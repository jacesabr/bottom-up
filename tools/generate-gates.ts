/**
 * Gate-authoring pipeline (bottom_up.md gate expansion).
 *
 * Per concept, produce a 5-slot gate set:
 *   - sketch1, sketch2 : draw/construct (graded by vision)
 *   - explain          : long-form written explanation (graded by LLM rubric)
 *   - mcq              : multiple choice
 *   - equation         : a harder symbolic/numeric problem
 * (Leeway: a concept where a slot doesn't fit may omit it — we record why.)
 *
 * Grounding: Firecrawl web research (real exam / professional question banks) + the concept's own
 * textbook content. Authored by Claude Haiku (cheap). Each gate stores idealAnswer + why + rubric + source.
 *
 * Exam-aware: the research query and the author's persona/level adapt to the concept's exam
 * (cbse10 → CBSE Class 10, cbse12 → CBSE Class 12, jee → JEE Main/Advanced). Works for any loaded exam.
 *
 * Usage:  tsx tools/generate-gates.ts <chapterId|conceptId> [--dry] [--limit N]
 *   e.g.  tsx tools/generate-gates.ts cbse10:maths:jemh101
 *         tsx tools/generate-gates.ts cbse12:mathematics:mathematics-ch01 --limit 5
 *         tsx tools/generate-gates.ts jee:maths:maths-ch01 --limit 5
 *         tsx tools/generate-gates.ts cbse10:maths:jemh101:know-prime-composite-coprime --dry
 */
import 'dotenv/config';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../src/db/index.js';
import { concepts as conceptsTable, gates } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { claudeAuthor, parseLooseJson, type ChatMessage } from '../src/core/llm.js';

/** Ordered Firecrawl keys: FIRECRAWL_API_KEY then FIRECRAWL_API_KEY_2.._9 (pooled fallback set in .env). */
function firecrawlKeys(): string[] {
  const keys: string[] = [];
  const push = (k?: string) => { if (k && !keys.includes(k)) keys.push(k); };
  push(process.env.FIRECRAWL_API_KEY);
  for (let i = 2; i <= 9; i++) push(process.env[`FIRECRAWL_API_KEY_${i}`]);
  return keys;
}
const FIRECRAWL_KEYS = firecrawlKeys();
/** Rotate to a different key on rate-limit / credit / auth errors. */
const shouldRotateKey = (e: any) => [401, 402, 403, 429].includes(e?.response?.status);
const DRY = process.argv.includes('--dry');
// Curated authoring: --strong (Opus) for correct maths/phrasing; --model <id> to override; --improve-content
// to rewrite the node's teaching content (explanation/keyMoves/misconceptions) from NCERT + research first.
const IMPROVE_CONTENT = process.argv.includes('--improve-content');
// --skip-authored: skip concepts that already have authored gates (safe re-run default for batching).
// Without this flag, the tool does a clean-slate re-author (deletes + rewrites), which is intentional
// when you want to force a re-run but dangerous when batching over a mixed chapter.
const SKIP_AUTHORED = process.argv.includes('--skip-authored');
const AUTHOR_MODEL = (() => {
  const i = process.argv.indexOf('--model');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.argv.includes('--strong')) return 'claude-opus-4-8';
  return undefined; // → claudeAuthor's default (Haiku / MODEL_AUTHOR)
})();
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

/** Exam → author persona + level + the phrase used to find real exam question banks. */
interface ExamProfile {
  persona: string; // the assessment author's identity in the system prompt
  level: string; // how to describe the difficulty/level inside the prompt
  searchTag: string; // appended to the Firecrawl query
}
function examProfile(conceptId: string): ExamProfile {
  const exam = conceptId.split(':')[0];
  switch (exam) {
    case 'cbse12':
      return {
        persona: 'an expert CBSE Class 12 Mathematics assessment author',
        level: 'CBSE Class 12 (NCERT) level',
        searchTag: 'CBSE class 12 maths board exam questions with solutions',
      };
    case 'jee':
      return {
        persona: 'an expert JEE (Main & Advanced) Mathematics problem author',
        level: 'JEE Main/Advanced level (NCERT Class 11–12 foundation, exam-grade rigour)',
        searchTag: 'JEE main advanced maths problems with solutions',
      };
    case 'cbse10':
    default:
      return {
        persona: 'an expert CBSE Class 10 Maths assessment author',
        level: 'CBSE Class 10 (NCERT) level',
        searchTag: 'CBSE class 10 maths exam questions with solutions',
      };
  }
}

interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
}

// Low-signal sources for exam-question grounding (video/social/forum) — dropped from results.
const LOW_QUALITY = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|pinterest\.|reddit\.com|quora\.com|x\.com|twitter\.com|whatsapp)/i;
// Authoritative / reputable maths-education domains — ranked first when present.
const PREFERRED = /(ncert\.nic\.in|cbse\.gov\.in|cbseacademic|nta\.ac\.in|jeeadv\.ac\.in|learncbse|tiwariacademy|selfstudys|vedantu|byjus|toppr|embibe|careers360|examfear|cuemath|geeksforgeeks|brilliant|khanacademy|teachoo|meritnation|aakash|allen|fiitjee|physicswallah|pw\.live|shaalaa|extramarks)/i;

function rankHits(hits: ResearchHit[]): ResearchHit[] {
  const kept = hits.filter((h) => h.url && !LOW_QUALITY.test(h.url));
  // Preferred domains first, otherwise keep search order.
  return kept.sort((a, b) => (PREFERRED.test(b.url) ? 1 : 0) - (PREFERRED.test(a.url) ? 1 : 0));
}

async function research(topic: string, profile: ExamProfile): Promise<ResearchHit[]> {
  if (!FIRECRAWL_KEYS.length) return [];
  // Target authoritative question banks / NCERT exemplar / previous-year papers, and explicitly steer
  // away from video/social. Over-fetch (10) then domain-filter + rank down to the best 4.
  const query = `${topic} ${profile.searchTag} (NCERT exemplar OR previous year board questions OR solved question bank) -site:youtube.com -site:instagram.com -site:tiktok.com`;
  for (let i = 0; i < FIRECRAWL_KEYS.length; i++) {
    try {
      const res = await axios.post(
        'https://api.firecrawl.dev/v1/search',
        { query, limit: 10 },
        { headers: { Authorization: `Bearer ${FIRECRAWL_KEYS[i]}`, 'Content-Type': 'application/json' }, timeout: 40_000 }
      );
      const data = res.data?.data ?? [];
      const all: ResearchHit[] = data.map((d: any) => ({
        title: d.title ?? '',
        url: d.url ?? '',
        snippet: (d.description ?? d.markdown ?? '').slice(0, 600),
      }));
      const ranked = rankHits(all);
      // If filtering removed everything (rare), fall back to the unfiltered top few rather than nothing.
      return (ranked.length ? ranked : all).slice(0, 4);
    } catch (e: any) {
      if (shouldRotateKey(e) && i < FIRECRAWL_KEYS.length - 1) {
        console.warn(`  firecrawl key #${i + 1} failed (HTTP ${e?.response?.status}); rotating to next key`);
        continue;
      }
      console.warn(`  research failed: ${e?.message}`);
      return [];
    }
  }
  return [];
}

const SLOTS = [
  { slot: 'sketch1', answerType: 'sketch', grader: 'vision', note: 'draw/construct a diagram, number line, or figure that visualises ONLY this node\'s own key move (do NOT introduce a technique owned by a later node)' },
  { slot: 'sketch2', answerType: 'sketch', grader: 'vision', note: 'a second, different drawing/visual task' },
  { slot: 'explain', answerType: 'written', grader: 'rubric', note: 'long-form written explanation in the student’s own words' },
  { slot: 'mcq', answerType: 'mcq', grader: 'mcq', note: 'single-best-answer multiple choice with 4 options' },
  { slot: 'equation', answerType: 'symbolic', grader: 'cas', note: 'a harder compute/prove problem with an exact answer' },
];

function authorPrompt(concept: any, hits: ResearchHit[], profile: ExamProfile, priorTitles: string[], laterTitles: string[], nodePosition: number): ChatMessage[] {
  const researchBlock = hits.length
    ? hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url})\n${h.snippet}`).join('\n\n')
    : '(no external research available — rely on the textbook content below)';

  // What the learner has ALREADY been taught (earlier nodes, same chapter). Gates may rely on these
  // plus this node's own key moves — and NOTHING from a later node.
  const assumedKnown = priorTitles.length
    ? priorTitles.map((t) => `  - ${t}`).join('\n')
    : '  (nothing yet — this is the first node; assume only everyday arithmetic / common sense)';

  // What is taught LATER in this chapter — the explicit FORBIDDEN set. A gate solvable only via one of
  // these requires a not-yet-taught technique and is out of scope (the scope-leak bug this list closes).
  const taughtLater = laterTitles.length
    ? laterTitles.map((t) => `  - ${t}`).join('\n')
    : '  (none — this is the last node in its chapter)';

  const system = `You are ${profile.persona}. You write genuine, exam-quality questions for ONE concept, grounded in the official NCERT textbook content. Output STRICT JSON only.

Non-negotiable rules:
1. STAY IN SCOPE. Every item must be solvable using ONLY this node's own key moves plus ideas the learner has already been taught (listed below). NEVER require a technique, theorem, or definition that belongs to a LATER node (e.g. do not test HCF/LCM on a "compare powers" node, a divisibility PROOF on a "what divides means" node, or union/intersection on a "membership" node).
2. CLEAN ANSWERS. "idealAnswer" is the FINAL, correct answer only — never include retracted working, "Wait…", "let me reconsider", or a first wrong guess. Solve it yourself first, then write only the clean result. The worked example must actually exemplify THIS concept (e.g. for "empty relation", the example must BE empty).
3. CHECK YOUR ARITHMETIC. For any numeric item (mcq, equation) compute the answer step by step and re-verify it; "expectedValue"/the correct option MUST equal that computed result. Mis-evaluating a power or product is the most common failure — e.g. $2^2 \\times 3^3 \\times 5 = 4 \\times 27 \\times 5 = 540$ (NOT 1350). Show the arithmetic in idealAnswer.
4. NEVER ask a student to justify a FALSE statement. If you target a misconception, phrase the prompt as a TRUE task (e.g. ask them to combine $2^3 \\times 2^2$ correctly and say what rule applies — do NOT write "explain why $2^3 \\times 2^2$ is NOT $2^5$", because it IS $2^5$).`;

  const user = `CONCEPT (node #${nodePosition} in its chapter, taught bottom-up)
title: ${concept.title}
role: ${concept.role}
brief: ${concept.brief}
explanation: ${concept.explanation}
key moves (the ONLY skills this node owns): ${(concept.keyMoves || []).join('; ')}
common misconceptions: ${(concept.misconceptions || []).join('; ')}

ALREADY TAUGHT (you MAY rely on these earlier nodes; do NOT rely on anything not here or above):
${assumedKnown}

TAUGHT LATER — FORBIDDEN (these nodes come AFTER this one; you MUST NOT require any technique, theorem, definition, or skill they own. A gate that can only be solved using one of these is OUT OF SCOPE — the single most common authoring error, e.g. asking to factor-tree/prime-factorise on a node taught before the factorisation node, or to optimise an LP before the optimal-solution node):
${taughtLater}

REAL-WORLD RESEARCH (inspiration on what real exams ask — adapt, don't copy, and don't pull in out-of-scope topics):
${researchBlock}

TASK: Write FIVE assessment items, one per slot. Each must be answerable from THIS node's key moves + the already-taught list, at ${profile.level}, unambiguous. Pitch DIFFICULTY to node #${nodePosition}: an early node gets gentle, single-step items; do not write multi-step or proof-heavy items on a foundational node.

SLOTS (produce exactly these keys; if a slot genuinely doesn't fit, set "skip": true with a short "skipReason"). PREFER an honest "skip" for sketch1/sketch2 when the concept is purely logical/notational and any drawing would be contrived (a forced "draw a box and label it" is WORSE than skipping) — only include a sketch when drawing genuinely helps a learner SEE the idea:
- "sketch1": ${SLOTS[0].note}
- "sketch2": ${SLOTS[1].note}
- "explain": ${SLOTS[2].note}
- "mcq": ${SLOTS[3].note}
- "equation": ${SLOTS[4].note}

SLOT RULES:
- "equation" must have ONE exact final value in "expectedValue" (a number or closed expression, e.g. "60" or "2^3 * 3^2 * 5") that equals your worked answer. If the natural harder item is a PROOF/derivation (no single value), DON'T put it here — make the equation a concrete compute item instead, and let "explain" carry any reasoning.
- "mcq": exactly 4 options, each a SINGLE claim (no "X and Y" conjunctions); exactly one correct; "correct" MUST be copied verbatim as one of "options".

For EACH item return:
{
  "prompt": "<the question, use $...$ for maths>",
  "idealAnswer": "<the FINAL clean correct answer — no retracted working>",
  "why": "<1-2 sentences: what it tests / why this is the answer>",
  "rubric": "<sketch & explain ONLY: a '✓ … ✓ …' checklist of what a correct response must contain; omit for mcq/equation>",
  "options": ["...","...","...","..."],     // MCQ ONLY, 4 single-claim options
  "correct": "<exact text of the correct option>",  // MCQ ONLY, must equal one of options
  "expectedValue": "<EQUATION ONLY: the exact final value>"
}

Before returning, self-check: (a) no item uses a later-node technique; (b) mcq.correct is exactly one of mcq.options; (c) equation.expectedValue matches your own worked answer; (d) no idealAnswer contains retracted working; (e) each worked example exemplifies THIS concept.

Return ONLY this JSON object:
{ "sketch1": {...}, "sketch2": {...}, "explain": {...}, "mcq": {...}, "equation": {...} }`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Read the chapter's OCR'd NCERT source text (content/<exam>/<subject>/<chapter>/source/*.txt), if present. */
async function loadNcertText(conceptId: string): Promise<string | null> {
  const [exam, subject, chapter] = conceptId.split(':');
  const dir = path.join(process.cwd(), 'content', exam, subject, chapter, 'source');
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.txt'));
    if (!files.length) return null;
    return await fs.readFile(path.join(dir, files[0]), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Content-improvement pass (the previously-missing step). Grounds STRICTLY in the official NCERT source
 * text (+ light web research), rewrites the node's teaching content, and updates the concepts row.
 * Returns the improved concept so gates are authored from the better content.
 */
async function improveContent(concept: any, profile: ExamProfile, hits: ResearchHit[], model?: string) {
  const ncert = await loadNcertText(concept.id);
  const research = hits.length ? hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}`).join('\n\n') : '(none)';
  const system = `You are ${profile.persona} and an expert NCERT curriculum writer. You improve ONE concept node's TEACHING content, grounded strictly in the official NCERT material. Never invent facts beyond NCERT or pull in a later concept. Output STRICT JSON only.`;
  const user = `NODE: ${concept.title}  (${profile.level})
current brief: ${concept.brief}
current explanation: ${concept.explanation}
current key moves: ${(concept.keyMoves || []).join('; ')}
current misconceptions: ${(concept.misconceptions || []).join('; ')}

OFFICIAL NCERT SOURCE TEXT (primary grounding — do not contradict it):
${ncert ? ncert.slice(0, 7000) : '(no OCR text on disk — the current explanation is already NCERT-derived; refine it, do not contradict it)'}

SUPPLEMENTARY WEB RESEARCH (secondary; for clarity/pedagogy only):
${research}

TASK: Produce IMPROVED teaching content a warm tutor will teach FROM — clearer, fully correct, complete on the CORE idea, tightly scoped to THIS node (no later concepts). Fix any vagueness/errors. Keep "explanation" focused (~90–170 words), concrete, faithful to NCERT. Make "keyMoves" the precise, demonstrable sub-skills; "misconceptions" the real traps.

Return ONLY: { "brief": "...", "explanation": "...", "keyMoves": ["...","...","..."], "misconceptions": ["...","..."] }`;
  const raw = await claudeAuthor([{ role: 'system', content: system }, { role: 'user', content: user }], 1600, model);
  const p = parseLooseJson<any>(raw);
  if (!p || !p.explanation || !Array.isArray(p.keyMoves)) throw new Error('content improver returned unusable JSON');
  const improved = {
    ...concept,
    brief: p.brief ?? concept.brief,
    explanation: p.explanation,
    keyMoves: p.keyMoves,
    misconceptions: Array.isArray(p.misconceptions) ? p.misconceptions : concept.misconceptions,
  };
  if (!DRY) {
    await db
      .update(conceptsTable)
      .set({ brief: improved.brief, explanation: improved.explanation, keyMoves: improved.keyMoves, misconceptions: improved.misconceptions })
      .where(eq(conceptsTable.id, concept.id));
  }
  console.log(`    content: ✓ improved (explanation ${concept.explanation.length}→${improved.explanation.length} chars, ${improved.keyMoves.length} key moves)`);
  return improved;
}

async function authorGates(concept: any, priorTitles: string[], laterTitles: string[], nodePosition: number) {
  const profile = examProfile(concept.id);
  const hits = await research(concept.title, profile);
  let workingConcept = concept;
  if (IMPROVE_CONTENT) workingConcept = await improveContent(concept, profile, hits, AUTHOR_MODEL);
  const raw = await claudeAuthor(authorPrompt(workingConcept, hits, profile, priorTitles, laterTitles, nodePosition), 2600, AUTHOR_MODEL);
  const parsed = parseLooseJson<any>(raw);
  if (!parsed) throw new Error('author returned unparseable JSON');
  return { parsed, source: hits.map((h) => h.url).filter(Boolean).join(' | ') };
}

async function upsertGate(conceptId: string, slotDef: any, item: any, ord: number, source: string) {
  if (!item || item.skip) {
    console.log(`    ${slotDef.slot}: skipped (${item?.skipReason ?? 'no item'})`);
    return;
  }
  const id = `${conceptId}:${slotDef.slot}`;
  const expected: any =
    slotDef.slot === 'mcq'
      ? { kind: 'mcq', correct: item.correct, options: item.options }
      : slotDef.slot === 'equation'
        ? { kind: 'symbolic', equivalentTo: item.expectedValue, ideal: item.idealAnswer }
        : { kind: slotDef.answerType, ideal: item.idealAnswer, rubric: item.rubric };

  if (DRY) {
    console.log(`    ${slotDef.slot}: ${String(item.prompt).slice(0, 90)}`);
    return;
  }

  await db
    .insert(gates)
    .values({
      id,
      conceptId,
      kind: 'authored',
      prompt: item.prompt,
      answerType: slotDef.answerType,
      grader: slotDef.grader,
      expected,
      slot: slotDef.slot,
      ord,
      idealAnswer: item.idealAnswer ?? null,
      why: item.why ?? null,
      rubric: item.rubric ?? null,
      source: source || null,
    } as any)
    .onConflictDoUpdate({
      target: gates.id,
      set: {
        prompt: item.prompt,
        answerType: slotDef.answerType,
        grader: slotDef.grader,
        expected,
        slot: slotDef.slot,
        ord,
        idealAnswer: item.idealAnswer ?? null,
        why: item.why ?? null,
        rubric: item.rubric ?? null,
        source: source || null,
      } as any,
    });
  console.log(`    ${slotDef.slot}: ✓ ${String(item.prompt).slice(0, 80)}`);
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx tools/generate-gates.ts <chapterId|conceptId> [--dry]');
    process.exit(1);
  }

  const all = await db.select().from(conceptsTable);
  const targets = target.split(':').length >= 4
    ? all.filter((c) => c.id === target)
    : all.filter((c) => c.chapterId === target);

  if (!targets.length) {
    console.error(`No concepts matched "${target}"`);
    process.exit(1);
  }

  targets.sort((a, b) => a.order - b.order);
  if (Number.isFinite(LIMIT)) targets.splice(LIMIT); // --limit N → only the first N in bottom-up order

  // Build set of already-authored concept IDs (at least one authored gate exists).
  let alreadyAuthored = new Set<string>();
  if (SKIP_AUTHORED) {
    const rows = await db
      .selectDistinct({ conceptId: gates.conceptId })
      .from(gates)
      .where(eq(gates.kind, 'authored'));
    alreadyAuthored = new Set(rows.map((r) => r.conceptId));
    const skippable = targets.filter((c) => alreadyAuthored.has(c.id)).length;
    if (skippable) console.log(`  --skip-authored: skipping ${skippable} already-authored concept(s)\n`);
  }

  console.log(`Authoring ${SLOTS.length}-gate sets for ${targets.length} concept(s)${DRY ? ' [DRY RUN]' : ''}${SKIP_AUTHORED ? ' [skip-authored ON]' : ''}\n`);

  for (const concept of targets) {
    if (SKIP_AUTHORED && alreadyAuthored.has(concept.id)) {
      console.log(`• ${concept.slug}: already authored, skipping`);
      continue;
    }
    console.log(`• ${concept.slug}`);
    try {
      // Already-taught = lower-order concepts in the same chapter (the scope guard's allow-list).
      const priorTitles = all
        .filter((c) => c.chapterId === concept.chapterId && c.order < concept.order)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.title);
      // Taught-later = higher-order concepts in the same chapter (the scope guard's forbidden-list).
      const laterTitles = all
        .filter((c) => c.chapterId === concept.chapterId && c.order > concept.order)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.title);
      const { parsed, source } = await authorGates(concept, priorTitles, laterTitles, concept.order + 1);
      // Clear this concept's existing AUTHORED gates first, so a re-run is deterministic and a now-
      // skipped slot is actually removed (not left stale from a prior run). Book gates are untouched.
      if (!DRY) await db.delete(gates).where(and(eq(gates.conceptId, concept.id), eq(gates.kind, 'authored')));
      let ord = 0;
      for (const slotDef of SLOTS) {
        await upsertGate(concept.id, slotDef, parsed[slotDef.slot], ord++, source);
      }
    } catch (e: any) {
      console.warn(`  ERROR: ${e?.message}`);
    }
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

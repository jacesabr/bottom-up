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
 * Grounding: Firecrawl web research (real CBSE/professional question banks) + the concept's own
 * textbook content. Authored by Claude Haiku (cheap). Each gate stores idealAnswer + why + rubric + source.
 *
 * Usage:  tsx tools/generate-gates.ts <chapterId|conceptId> [--dry]
 *   e.g.  tsx tools/generate-gates.ts cbse10:maths:jemh101
 *         tsx tools/generate-gates.ts cbse10:maths:jemh101:know-prime-composite-coprime --dry
 */
import 'dotenv/config';
import axios from 'axios';
import { db } from '../src/db/index.js';
import { concepts as conceptsTable, gates } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { claudeAuthor, parseLooseJson, type ChatMessage } from '../src/core/llm.js';

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const DRY = process.argv.includes('--dry');

interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
}

async function research(topic: string): Promise<ResearchHit[]> {
  if (!FIRECRAWL_KEY) return [];
  try {
    const res = await axios.post(
      'https://api.firecrawl.dev/v1/search',
      { query: `${topic} CBSE class 10 maths exam questions with solutions`, limit: 4 },
      { headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' }, timeout: 40_000 }
    );
    const data = res.data?.data ?? [];
    return data.map((d: any) => ({
      title: d.title ?? '',
      url: d.url ?? '',
      snippet: (d.description ?? d.markdown ?? '').slice(0, 600),
    }));
  } catch (e: any) {
    console.warn(`  research failed: ${e?.message}`);
    return [];
  }
}

const SLOTS = [
  { slot: 'sketch1', answerType: 'sketch', grader: 'vision', note: 'draw/construct a diagram, factor tree, number line, or figure' },
  { slot: 'sketch2', answerType: 'sketch', grader: 'vision', note: 'a second, different drawing/visual task' },
  { slot: 'explain', answerType: 'written', grader: 'rubric', note: 'long-form written explanation in the student’s own words' },
  { slot: 'mcq', answerType: 'mcq', grader: 'mcq', note: 'single-best-answer multiple choice with 4 options' },
  { slot: 'equation', answerType: 'symbolic', grader: 'cas', note: 'a harder compute/prove problem with an exact answer' },
];

function authorPrompt(concept: any, hits: ResearchHit[]): ChatMessage[] {
  const researchBlock = hits.length
    ? hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url})\n${h.snippet}`).join('\n\n')
    : '(no external research available — rely on the textbook content below)';

  const system = `You are an expert CBSE Class 10 Maths assessment author. You write genuine, exam-quality questions for ONE concept, grounded in the official NCERT textbook content and informed by real question banks. Never invent facts outside the concept. Output STRICT JSON only.`;

  const user = `CONCEPT
title: ${concept.title}
role: ${concept.role}
brief: ${concept.brief}
explanation: ${concept.explanation}
key moves: ${(concept.keyMoves || []).join('; ')}
common misconceptions: ${(concept.misconceptions || []).join('; ')}

REAL-WORLD RESEARCH (for inspiration on what professionals ask — adapt, don't copy verbatim):
${researchBlock}

TASK: Write FIVE assessment items for this concept, one per slot below. Each must be answerable from THIS concept (CBSE Class 10 level), professional quality, and unambiguous.

SLOTS (produce exactly these keys; if a slot genuinely does not fit this concept, set "skip": true with a short "skipReason"):
- "sketch1": ${SLOTS[0].note}
- "sketch2": ${SLOTS[1].note}
- "explain": ${SLOTS[2].note}
- "mcq": ${SLOTS[3].note}
- "equation": ${SLOTS[4].note}

For EACH item return:
{
  "prompt": "<the question, use $...$ for maths>",
  "idealAnswer": "<the correct/model answer>",
  "why": "<1-2 sentences: why this is the answer / what it tests>",
  "rubric": "<for sketch & explain: what a correct response must contain, as a grading checklist; for mcq/equation: omit or empty>",
  "options": ["A","B","C","D"],     // MCQ ONLY
  "correct": "<exact correct option text>",  // MCQ ONLY
  "expectedValue": "<for equation: the exact final answer, e.g. 2^3 * 3^2 * 5>"  // EQUATION ONLY
}

Return ONLY this JSON object:
{ "sketch1": {...}, "sketch2": {...}, "explain": {...}, "mcq": {...}, "equation": {...} }`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

async function authorGates(concept: any) {
  const hits = await research(concept.title);
  const raw = await claudeAuthor(authorPrompt(concept, hits), 2600);
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
  console.log(`Authoring ${SLOTS.length}-gate sets for ${targets.length} concept(s)${DRY ? ' [DRY RUN]' : ''}\n`);

  for (const concept of targets) {
    console.log(`• ${concept.slug}`);
    try {
      const { parsed, source } = await authorGates(concept);
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

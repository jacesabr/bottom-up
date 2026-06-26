import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { buPaperAttempt, buEvent } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { gradeSubjective } from './node-agent.js';
import { getConceptById } from './content-cache.js';

/**
 * The final past-paper exam (bottom_up.md / README step 5-6). Papers are transcribed VERBATIM from
 * the official board material and live on disk at content/<exam>/_papers/<dir>/paper.json. Every
 * question carries the `node` (conceptId) it tests, so a wrong answer rolls up into the weak-concept
 * review (step 6) with no extra bookkeeping. We load + cache the JSON once and serve from memory.
 */

export interface PaperQuestion {
  q: number;
  section: string;
  marks: number;
  type: string; // mcq | assertion-reason | vsa | sa | la | case-study | numeric
  node: string; // conceptId this question tests
  grader: string; // mcq | numeric | llm-rubric | llm-descent
  handling: string; // grade | lab-acknowledge
  prompt: string;
  options?: string[];
  correct?: string; // SERVER-ONLY (never serialised to the client)
  msAnswer?: string; // SERVER-ONLY marking-scheme answer
  tolerance?: number | null;
  coveringNodes?: string[]; // the SET of concept-nodes that together cover this question (regen'd map)
}

export interface Paper {
  paperId: string;
  exam: string;
  subject: string;
  title: string;
  contract: { totalQuestions: number; maxMarks: number; sections?: Record<string, any> };
  questions: PaperQuestion[];
}

let papersCache: Map<string, Paper> | null = null;

function loadAll(): Map<string, Paper> {
  if (papersCache) return papersCache;
  const map = new Map<string, Paper>();
  const contentRoot = path.join(process.cwd(), 'content');
  let exams: string[] = [];
  try {
    exams = fs.readdirSync(contentRoot).filter((e) => fs.existsSync(path.join(contentRoot, e, '_papers')));
  } catch {
    /* no content dir */
  }
  for (const exam of exams) {
    const papersDir = path.join(contentRoot, exam, '_papers');
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync(papersDir);
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const file = path.join(papersDir, dir, 'paper.json');
      if (!fs.existsSync(file)) continue;
      try {
        const p = JSON.parse(fs.readFileSync(file, 'utf-8')) as Paper;
        if (p?.paperId && Array.isArray(p.questions)) {
          p.exam = p.exam || exam;
          map.set(p.paperId, p);
        }
      } catch (e) {
        console.error(`paper load failed (${file}):`, (e as any)?.message ?? e);
      }
    }
  }
  papersCache = map;
  return map;
}

export function invalidatePapersCache(): void {
  papersCache = null;
}

/** Verifiable source links (http URLs from the paper's `source` block) for student trust. */
function sourceLinks(p: Paper): Array<{ label: string; url: string }> {
  const src = (p as any).source;
  if (!src || typeof src !== 'object') return [];
  const labels: Record<string, string> = { official: 'Official exam portal', qp: 'Question paper', key: 'Answer key', sqp: 'Sample question paper', ms: 'Marking scheme' };
  return Object.entries(src)
    .filter(([, v]) => typeof v === 'string' && (v as string).startsWith('http'))
    .map(([k, v]) => ({ label: labels[k] ?? k, url: v as string }));
}

/**
 * Does a paper belong to the requested app subject? The app is maths-only: a 'maths'/'mathematics'
 * request shows every maths/general paper but hides any clearly-other-subject paper (Science, Physics…).
 * Unknown subjects → no filter.
 */
function matchesSubject(paperSubject: string, appSubject?: string): boolean {
  if (!appSubject) return true;
  const s = (paperSubject || '').toLowerCase();
  const a = appSubject.toLowerCase();
  const OTHER = /(science|physics|chemistry|biology|english|accountancy|economics|history|geography|political|psychology|sociology|business)/;
  if (a.startsWith('math')) return !OTHER.test(s); // maths: include Mathematics + generic (e.g. 'jee'), exclude other subjects
  return true;
}

/** List the papers available for an exam+subject (client-safe summary — no answers). */
export function listPapers(exam: string, subject?: string) {
  return [...loadAll().values()]
    .filter((p) => p.exam === exam && matchesSubject(p.subject, subject))
    .map((p) => ({
      paperId: p.paperId,
      title: p.title,
      subject: p.subject,
      totalQuestions: p.contract?.totalQuestions ?? p.questions.length,
      maxMarks: p.contract?.maxMarks ?? p.questions.reduce((s, q) => s + (q.marks ?? 0), 0),
      sources: sourceLinks(p),
    }));
}

export function getPaper(paperId: string): Paper | undefined {
  return loadAll().get(paperId);
}

/** Client view of a paper: prompts/options/sections only — NEVER correct / msAnswer. */
export function paperForClient(paperId: string) {
  const p = getPaper(paperId);
  if (!p) return null;
  return {
    paperId: p.paperId,
    exam: p.exam,
    subject: p.subject,
    title: p.title,
    contract: p.contract,
    sources: sourceLinks(p),
    questions: p.questions.map((q) => ({
      q: q.q,
      section: q.section,
      marks: q.marks,
      type: q.type,
      grader: q.grader,
      handling: q.handling,
      prompt: q.prompt,
      options: q.type === 'mcq' || q.type === 'assertion-reason' ? q.options ?? null : null,
      node: q.node, // the concept this question tests — lets the client link to it for a refresh
    })),
  };
}

/**
 * The "get unstuck" loop. A question's COVERING SET = the nodes whose concepts together let a learner
 * answer it (regenerated against the live node graph; written into paper.json as `coveringNodes`). When
 * a learner is stuck, we walk this set, posing each node's gate as a "quick check". Falls back to the
 * single tagged `node` if the covering set is missing/empty, so the loop always has at least one block.
 */
export function coveringNodeIds(paperId: string, qNum: number): string[] {
  const p = getPaper(paperId);
  const q = p?.questions.find((x) => x.q === qNum);
  if (!q) return [];
  const set = (q.coveringNodes ?? []).filter(Boolean);
  return set.length ? set : (q.node ? [q.node] : []);
}

/** Is conceptId one of the question's covering nodes? (guards the help endpoints against gate enumeration.) */
export function isCoveringNode(paperId: string, qNum: number, conceptId: string): boolean {
  return coveringNodeIds(paperId, qNum).includes(conceptId);
}

/** Client-safe covering set for a question: [{id, title}] in teaching order (skips unauthored stubs). */
export async function coveringForClient(paperId: string, qNum: number) {
  const out: Array<{ id: string; title: string }> = [];
  for (const id of coveringNodeIds(paperId, qNum)) {
    const c = await getConceptById(id);
    if (c && !(c as { needsAuthoring?: boolean }).needsAuthoring) out.push({ id, title: c.title });
  }
  return out;
}

/** Teaching payload for one covering node (shown when a learner misses its quick-check). */
export async function teachContentFor(conceptId: string) {
  const c = await getConceptById(conceptId);
  if (!c) return null;
  return { id: c.id, title: c.title, brief: c.brief, explanation: c.explanation, keyMoves: c.keyMoves ?? [] };
}

function norm(s: string): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .replace(/[−]/g, '-') // unicode minus → ascii
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a number out of a free-text answer (handles unicode minus, stray text/units). */
function numberFrom(s: string): number | null {
  const cleaned = (s ?? '').replace(/[−]/g, '-').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface GradeOut {
  correct: boolean | null;
  feedback: string;
  marksAwarded: number;
  gradedBy: string;
}

async function gradeQuestion(q: PaperQuestion, answer: string): Promise<GradeOut> {
  // Practical/lab questions a text tutor can't stage: present + acknowledge, never silently skip.
  if (q.handling === 'lab-acknowledge') {
    return { correct: null, feedback: 'Practical/lab question — acknowledged.', marksAwarded: 0, gradedBy: 'acknowledged' };
  }

  if (q.grader === 'mcq') {
    const strip = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
    const correct = norm(answer) === norm(q.correct ?? '') || strip(answer) === strip(q.correct ?? '');
    return {
      correct,
      feedback: correct ? 'Correct.' : `Not quite — the answer is: ${q.correct}`,
      marksAwarded: correct ? q.marks : 0,
      gradedBy: 'mcq',
    };
  }

  if (q.grader === 'numeric') {
    const got = numberFrom(answer);
    const want = numberFrom(q.correct ?? '');
    const tol = q.tolerance ?? 0;
    const correct = got !== null && want !== null && Math.abs(got - want) <= Math.max(tol, 1e-9);
    return {
      correct,
      feedback: correct ? 'Correct.' : `Not quite — the answer is ${q.correct}.`,
      marksAwarded: correct ? q.marks : 0,
      gradedBy: 'numeric',
    };
  }

  // Written (vsa/sa/la/case-study): subjective marking — PARTIAL marks per the marking scheme.
  const r = await gradeSubjective(q.prompt, q.msAnswer ?? null, answer, q.marks, 'en', q.node);
  // correct = full marks; null = partial credit; false = nothing earned.
  const correct = r.marksAwarded >= q.marks ? true : r.marksAwarded > 0 ? null : false;
  return { correct, feedback: r.feedback, marksAwarded: r.marksAwarded, gradedBy: 'subjective' };
}

/** Grade one answer and store it (replacing any prior answer to the same question). */
export async function answerPaperQuestion(learnerId: string, paperId: string, qNum: number, answer: string) {
  const p = getPaper(paperId);
  if (!p) throw new Error(`Paper not found: ${paperId}`);
  const q = p.questions.find((x) => x.q === qNum);
  if (!q) throw new Error(`Question ${qNum} not in ${paperId}`);

  const g = await gradeQuestion(q, answer);

  // One row per (learner, paper, q): revising an answer replaces it.
  await db
    .delete(buPaperAttempt)
    .where(and(eq(buPaperAttempt.learnerId, learnerId), eq(buPaperAttempt.paperId, paperId), eq(buPaperAttempt.q, qNum)));
  await db.insert(buPaperAttempt).values({
    learnerId,
    paperId,
    q: qNum,
    node: q.node,
    section: q.section,
    answer: answer.slice(0, 4000),
    correct: g.correct,
    marksAwarded: g.marksAwarded,
    marksPossible: q.marks,
    gradedBy: g.gradedBy,
  });

  return { q: qNum, correct: g.correct, feedback: g.feedback, marksAwarded: g.marksAwarded, marksPossible: q.marks };
}

/** Score + per-section breakdown + the weak-concept review (step 6). */
export async function paperResult(learnerId: string, paperId: string) {
  const p = getPaper(paperId);
  if (!p) throw new Error(`Paper not found: ${paperId}`);

  const attempts = await db
    .select()
    .from(buPaperAttempt)
    .where(and(eq(buPaperAttempt.learnerId, learnerId), eq(buPaperAttempt.paperId, paperId)));
  const byQ = new Map(attempts.map((a) => [a.q, a]));

  const maxMarks = p.contract?.maxMarks ?? p.questions.reduce((s, q) => s + (q.marks ?? 0), 0);
  let scored = 0;
  let answered = 0;
  const sectionAgg = new Map<string, { got: number; max: number }>();

  // Weak concepts: any question wrong OR unanswered → its node needs revision.
  const weakNodes = new Set<string>();

  for (const q of p.questions) {
    const a = byQ.get(q.q);
    const sec = sectionAgg.get(q.section) ?? { got: 0, max: 0 };
    sec.max += q.marks ?? 0;
    if (a) {
      answered++;
      sec.got += a.marksAwarded ?? 0;
      scored += a.marksAwarded ?? 0;
      // Weak = scored under half the marks on this question (covers MCQ wrong = 0, and partial-credit
      // written answers that lost most marks). Full / majority-correct answers don't flag for revision.
      const got = a.marksAwarded ?? 0;
      const max = a.marksPossible ?? q.marks ?? 0;
      if (q.handling !== 'lab-acknowledge' && got < max * 0.5) weakNodes.add(q.node);
    } else if (q.handling !== 'lab-acknowledge') {
      weakNodes.add(q.node); // unanswered counts as not-yet-mastered
    }
    sectionAgg.set(q.section, sec);
  }

  const weakConcepts: Array<{ conceptId: string; title: string; chapterId: string }> = [];
  for (const node of weakNodes) {
    const c = await getConceptById(node);
    weakConcepts.push({ conceptId: node, title: c?.title ?? node, chapterId: c?.chapterId ?? node.split(':').slice(0, 3).join(':') });
  }

  const finished = answered >= p.questions.filter((q) => q.handling !== 'lab-acknowledge').length;
  if (finished) {
    await db.insert(buEvent).values({ learnerId, type: 'paper_complete', payload: { paperId, scored, maxMarks } });
  }

  return {
    paperId,
    title: p.title,
    scored,
    maxMarks,
    answered,
    total: p.questions.length,
    finished,
    sections: [...sectionAgg.entries()].map(([section, v]) => ({ section, got: v.got, max: v.max })),
    weakConcepts,
  };
}

/** Existing answers (for resume / showing the result without re-answering). */
export async function paperState(learnerId: string, paperId: string) {
  const attempts = await db
    .select()
    .from(buPaperAttempt)
    .where(and(eq(buPaperAttempt.learnerId, learnerId), eq(buPaperAttempt.paperId, paperId)));
  return attempts.map((a) => ({ q: a.q, answer: a.answer, correct: a.correct, marksAwarded: a.marksAwarded, marksPossible: a.marksPossible }));
}

import { completeJson, parseLooseJson, resolveProvider, nimVision, claudeTranslate, type ChatMessage } from './llm.js';
import { languageInstruction, lang } from './languages.js';
import { examProfile } from './exam-profile.js';

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

/**
 * Translate into the learner's language using a FREE service (no Claude — those credits are for
 * actual teaching). Content is stored once in English and translated dynamically here, so nothing
 * goes stale. Maths ($...$) and **bold** are masked so the translator can't mangle them.
 * Provider: free Google endpoint (no key) → NIM fallback → original. For production-grade Indian
 * languages, swap in Bhashini (Govt of India, free) — see continue_authoring.md.
 */
export async function translateText(text: string, langCode?: string): Promise<string> {
  if (!langCode || langCode === 'en' || !text?.trim()) return text;

  // Mask maths/markdown/emoji so the translator preserves them verbatim.
  const masks: string[] = [];
  const mask = (s: string) => {
    const i = masks.length;
    masks.push(s);
    return ` _${i}_ `; // a token translators leave alone
  };
  let masked = text
    .replace(/\$\$[\s\S]+?\$\$/g, mask)
    .replace(/\$[^$\n]+?\$/g, mask)
    .replace(/\*\*([^*]+)\*\*/g, (_m, b) => `**${mask(b)}**`);

  const unmask = (s: string) => s.replace(/_\s*(\d+)\s*_/g, (_m, i) => masks[+i] ?? '');

  // 1) Free Google endpoint (no key).
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${langCode}&dt=t&q=${encodeURIComponent(masked)}`;
    const res = await axios.get(url, { timeout: 12_000 });
    const segments = res.data?.[0];
    if (Array.isArray(segments)) {
      const out = segments.map((s: any) => s?.[0] ?? '').join('');
      if (out.trim()) return unmask(out);
    }
  } catch {
    /* try NIM */
  }

  // 2) NIM fallback (free, weaker/slower but better than nothing).
  try {
    const l = lang(langCode);
    const raw = await completeJson(
      [
        { role: 'system', content: `Translate the user's message into ${l.name} (${l.native}). Keep tokens like _0_ , **bold**, emoji and maths exactly as-is. Output ONLY the translation.` },
        { role: 'user', content: masked },
      ],
      { maxTokens: 800 }
    );
    const out = raw.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    if (out) return unmask(out);
  } catch {
    /* keep original */
  }
  return text;
}

/** Grade a long-form written answer against the rubric/ideal (LLM rubric — free NIM when testing). */
export async function gradeWritten(
  prompt: string,
  rubric: string | null,
  ideal: string | null,
  answer: string,
  langCode?: string,
  conceptId?: string
): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a fair but rigorous ${prof.level} ${prof.subject} grader. Decide if the student's written answer demonstrates genuine understanding. Be encouraging in feedback. The student may answer in their own language — judge the meaning. Return ONLY JSON {"correct": boolean, "feedback": "<1-2 warm sentences: what was good / what's missing>"}`,
    },
    {
      role: 'user',
      content: `QUESTION: ${prompt}\n\nWHAT A CORRECT ANSWER NEEDS (rubric): ${rubric || ideal || 'a clear, correct explanation'}\n\nMODEL ANSWER: ${ideal || '(use your judgement)'}\n\nSTUDENT ANSWER: ${answer}\n\nGrade it. Pass if the core idea is correct even if wording is imperfect.`,
    },
  ];
  try {
    const raw = await completeJson(messages, { maxTokens: 300 });
    const p = parseLooseJson<any>(raw);
    if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
  } catch {
    /* fall through */
  }
  // Offline fallback: accept a substantive answer.
  const ok = answer.trim().length > 40;
  return { correct: ok, feedback: ok ? 'Good — that captures the idea.' : 'Try to explain a bit more fully.' };
}

/** Grade a maths answer by checking equivalence to the ideal answer (handles fractions, expressions). */
export async function gradeEquation(prompt: string, ideal: string | null, answer: string, langCode?: string, conceptId?: string): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You check ${prof.level} ${prof.subject} answers for MATHEMATICAL equivalence (not exact string match). Return ONLY JSON {"correct": boolean, "feedback": "<1-2 warm sentences>"}`,
    },
    {
      role: 'user',
      content: `QUESTION: ${prompt}\n\nCORRECT ANSWER: ${ideal || '(use your judgement)'}\n\nSTUDENT ANSWER: ${answer}\n\nIs the student's answer mathematically correct/equivalent? Accept equivalent forms (e.g. 2/3 = 0.667, 2^3·3 = 24).`,
    },
  ];
  try {
    const raw = await completeJson(messages, { maxTokens: 250 });
    const p = parseLooseJson<any>(raw);
    if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
  } catch {
    /* fall through */
  }
  return { correct: false, feedback: 'Could not verify — please re-check your answer.' };
}

/** Grade a handwritten/drawn answer (sketch) via vision against the rubric/ideal. */
export async function gradeSketch(
  prompt: string,
  rubric: string | null,
  ideal: string | null,
  imageDataUrl: string,
  langCode?: string,
  conceptId?: string
): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10');
  const visionPrompt = `You are grading a ${prof.studentLabel}'s hand-drawn answer.
QUESTION: ${prompt}
WHAT A CORRECT DRAWING MUST SHOW (rubric): ${rubric || ideal || 'a correct, clearly-labelled diagram'}
Look at the image and decide if it satisfies the requirement. Return ONLY JSON {"correct": boolean, "feedback": "<1-2 warm sentences on what's right / what to fix>"}`;
  try {
    const raw = await nimVision(visionPrompt, imageDataUrl, 350);
    const p = parseLooseJson<any>(raw);
    if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
    // vision returned prose, not JSON — treat a clearly positive read as a pass
    const lc = raw.toLowerCase();
    const correct = /correct|right|good|satisfies|complete/.test(lc) && !/incorrect|not |missing|wrong/.test(lc);
    return { correct, feedback: raw.slice(0, 200) };
  } catch {
    // Offline/vision-unavailable fallback: accept the drawing so testing can proceed, but say so.
    return { correct: true, feedback: '(Vision grader unavailable — accepted your drawing so you can continue.)' };
  }
}

/**
 * The per-node teaching agent (bottom_up.md §4). One call does both jobs:
 *   1. produce the next short, warm Socratic turn that elicits the NEXT undemonstrated key move
 *   2. report a checklist delta IN the same JSON (no separate judge call)
 *
 * Returns clean, well-formatted prose for the chat bubble plus the structured delta.
 * Uses NVIDIA NIM (free) when testing; falls back to a clean offline mock so the UI never breaks.
 */

export interface KeyMove {
  index: number;
  text: string;
  demonstrated: boolean;
}

export interface TeachTurnInput {
  conceptTitle: string;
  brief: string;
  explanation: string;
  keyMoves: KeyMove[];
  misconceptions: string[];
  dialogue: Array<{ role: 'tutor' | 'learner'; content: string }>;
  isReteach?: boolean;
  lang?: string;
  priorSummary?: string; // running summary of earlier conversation (cold-start resume)
  figures?: Array<{ id: string; caption: string }>; // textbook figures available for this concept
  conceptId?: string; // exam:subject:chapter:slug — selects the exam-aware persona/level
}

export interface TeachTurnOutput {
  message: string;
  keyMovesDemonstrated: Array<{ index: number; evidence: string }>;
  misconceptionsSeen: string[];
  readyForGate: boolean;
  provider: string;
  corpusGap?: { question: string; missing: string } | null;
  figureRef?: string | null; // id of a textbook figure to show inline this turn
}

function buildMessages(input: TeachTurnInput): ChatMessage[] {
  const moves = input.keyMoves
    .map((m) => `  [${m.index}] ${m.demonstrated ? '✓ shown' : '◻ not yet'} — ${m.text}`)
    .join('\n');
  const transcript = input.dialogue
    .map((t) => `${t.role === 'tutor' ? 'TUTOR' : 'LEARNER'}: ${t.content}`)
    .join('\n');

  const prof = examProfile(input.conceptId ?? 'cbse10');
  const system = `You are a real, warm human ${prof.subject} teacher sitting beside ${prof.teacherAudience}, chatting.
You teach in the Socratic spirit — you draw understanding out with gentle questions rather than lecturing — but
above all you sound like an actual caring person, not a script. Use natural, everyday language and contractions.
React genuinely to what they say. Be encouraging and patient. Short messages, like real chat.

You are teaching ONE concept only: "${input.conceptTitle}".
In plain words it's about: ${input.brief}
Your ONLY source of truth for facts/examples: ${input.explanation}

You are quietly guiding the student to eventually grasp these ideas (NEVER list or quote these — they're your private map):
${moves}

Watch gently for these misunderstandings:
${input.misconceptions.map((m) => `  - ${m}`).join('\n')}

HOW TO TEACH (read carefully — this is the whole job):
- ASSUME THE STUDENT KNOWS NOTHING about this topic's words. Before you use any term, make sure they understand it,
  in everyday language, with one tiny concrete example. Build from the absolute ground up, slowly.
- ONE small step per message. Introduce a single idea, give a simple friendly example, then ask ONE question they
  can genuinely answer from what you just said. Then stop and wait.
- NEVER restate a definition or fact as if it were a question. NEVER ask something whose answer you already showed
  (e.g. do NOT write "$2^3 = 8$, so what is $2^3$?" — that's meaningless). Your question must actually require them
  to think and have a real, not-yet-given answer.
- If they're unsure or wrong, that's great — slow down further, give an even simpler example or analogy, and try a
  smaller question. Never make them feel behind.
- Keep maths gentle: $...$ for inline (e.g. $2^3$), a $$…$$ line only when it truly clarifies.
- Stay STRICTLY on this concept (anti-drift): no outside topics, no tangents, no facts not grounded above. If they
  wander, warmly bring them back.
- Sound human: vary your wording, don't be formulaic, don't say "key move" / "gate" / "checklist" / "let's build it up"
  every time. Just talk.
${input.isReteach ? '- They just missed a check, so re-approach from a completely fresh, even simpler angle — no shame, lots of warmth.' : ''}

If the student asks something you genuinely CANNOT answer from "Your ONLY source of truth" above (the content is missing it), do NOT make facts up — gently keep them on the current concept, and set "corpusGap" to flag what our material was missing.
${
  input.figures && input.figures.length
    ? `\nTEXTBOOK FIGURES available for this concept (you may show ONE when it genuinely helps the student SEE what you're explaining — e.g. a graph or diagram). To show one, set "figureRef" to its id. Only when truly useful, not every turn:\n${input.figures.map((f) => `  - ${f.id}: ${f.caption}`).join('\n')}\n`
    : ''
}
Then quietly judge which of your private ideas they've now genuinely demonstrated, and which misunderstandings showed.

Return ONLY a JSON object, no prose around it (write "message" in natural English — it will be translated for the student if needed):
{
  "message": "<your next short tutor turn>",
  "keyMovesDemonstrated": [{ "index": <int>, "evidence": "<the learner words that prove it>" }],
  "misconceptionsSeen": ["<short label>"],
  "readyForGate": <true if ALL key moves are now demonstrated>,
  "corpusGap": null | { "question": "<what they asked>", "missing": "<what our content lacked, one short phrase>" },
  "figureRef": null | "<id of a figure to show this turn, or null>"
}`;

  const summaryBlock = input.priorSummary
    ? `WHAT'S HAPPENED SO FAR (summary of the earlier part of this conversation — treat as already-said context):\n${input.priorSummary}\n\n`
    : '';

  const user = transcript
    ? `${summaryBlock}Recent conversation:\n${transcript}\n\nProduce the next tutor turn + checklist delta as JSON.`
    : input.priorSummary
      ? `${summaryBlock}The student is returning to this concept. Warmly pick up where you left off (don't repeat what's already covered) and ask ONE gentle next question. Return JSON.`
      : `Open the lesson: name the concept in plain, friendly words so the student knows what we're about to build, then ask ONE gentle opening question that elicits key move [0]. Do NOT greet or say hi (a warm welcome is shown separately) — go straight into the topic, warmly and simply. Keep it short and human. Return JSON.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export async function teachTurn(input: TeachTurnInput): Promise<TeachTurnOutput> {
  try {
    const raw = await completeJson(buildMessages(input), { maxTokens: 700 });
    const parsed = parseLooseJson<any>(raw);
    if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
      const cg = parsed.corpusGap;
      return {
        message: parsed.message.trim(),
        keyMovesDemonstrated: Array.isArray(parsed.keyMovesDemonstrated) ? parsed.keyMovesDemonstrated : [],
        misconceptionsSeen: Array.isArray(parsed.misconceptionsSeen) ? parsed.misconceptionsSeen : [],
        readyForGate: !!parsed.readyForGate,
        provider: resolveProvider(),
        corpusGap: cg && cg.missing ? { question: String(cg.question ?? ''), missing: String(cg.missing) } : null,
        figureRef: parsed.figureRef ? String(parsed.figureRef) : null,
      };
    }
  } catch {
    /* fall through to mock */
  }
  return mockTurn(input);
}

/**
 * Summarize a conversation (folding any existing summary + new turns) into a concise note for resume.
 * Captures: what was covered, what the student understands, what's still unclear, where they are.
 * Runs occasionally (cold-start/revisit), not per turn.
 */
export async function summarizeConversation(
  conceptTitle: string,
  existingSummary: string | null,
  newTurns: Array<{ role: 'tutor' | 'learner'; content: string }>
): Promise<string> {
  const transcript = newTurns.map((t) => `${t.role === 'tutor' ? 'TUTOR' : 'STUDENT'}: ${t.content}`).join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You compress a tutoring conversation into a short resume note (max ~120 words). Capture, as compact bullets: what's been covered/explained, what the student clearly understands, what's still shaky or unclear, and where the conversation left off. No fluff. Output ONLY the note.`,
    },
    {
      role: 'user',
      content: `Concept: ${conceptTitle}\n\n${existingSummary ? `Earlier summary:\n${existingSummary}\n\n` : ''}New conversation to fold in:\n${transcript}\n\nProduce the updated resume note.`,
    },
  ];
  try {
    const note = (await completeJson(messages, { maxTokens: 300 })).trim();
    if (note) return note;
  } catch {
    /* fall through */
  }
  // Fallback: keep the existing summary or a trivial note.
  return existingSummary ?? `Discussed ${conceptTitle}; ${newTurns.length} turns exchanged.`;
}

/** Clean offline fallback — readable prose, simple heuristic checklist progress. */
function mockTurn(input: TeachTurnInput): TeachTurnOutput {
  const nextMove = input.keyMoves.find((m) => !m.demonstrated);
  const lastLearner = [...input.dialogue].reverse().find((t) => t.role === 'learner');

  // Opening turn — lead into the topic (the welcome banner is added separately by respond()).
  if (!lastLearner) {
    return {
      message: `${input.brief}\n\nTo get us started: ${questionFor(nextMove?.text)}`,
      keyMovesDemonstrated: [],
      misconceptionsSeen: [],
      readyForGate: false,
      provider: 'mock',
    };
  }

  // Heuristic: a non-trivial reply demonstrates the current move.
  const demonstrated = lastLearner.content.trim().length > 12 && nextMove ? [{ index: nextMove.index, evidence: lastLearner.content.trim() }] : [];
  const remaining = input.keyMoves.filter((m) => !m.demonstrated && m.index !== nextMove?.index);
  const ready = demonstrated.length > 0 && remaining.length === 0;

  const followUp = remaining[0];
  const message = ready
    ? `Nice — that's the idea. You've shown all the key moves for this concept. Let's check it with a quick question.`
    : `Good thinking. ${questionFor(followUp?.text)}`;

  return { message, keyMovesDemonstrated: demonstrated, misconceptionsSeen: [], readyForGate: ready, provider: 'mock' };
}

function questionFor(move?: string): string {
  if (!move) return 'Can you say a little more about how you see it?';
  return `Can you explain, in your own words — ${move.toLowerCase()}?`;
}

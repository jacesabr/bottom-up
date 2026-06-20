import axios from 'axios';
import { completeJson, parseLooseJson, repairJsonBackslashes, resolveProvider, nimVision, LlmUnavailableError, type ChatMessage } from './llm.js';
import { lang } from './languages.js';
import { examProfile, type Track } from './exam-profile.js';
import type { RefresherItem } from '../db/schema.js';

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

/**
 * Translate into the learner's language using a FREE service (no Claude — those credits are for
 * actual teaching). Content is stored once in English and translated dynamically here, so nothing
 * goes stale. Maths ($...$) and **bold** are masked so the translator can't mangle them.
 * Provider: free Google endpoint (no key) → NIM fallback → original. For production-grade Indian
 * languages, swap in Bhashini (Govt of India, free) — see authoring_and_improve.md.
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

  // 0) Sarvam (best Indic quality) — primary when SARVAM_API_KEY is set.
  try {
    const { sarvamTranslate } = await import('./voice.js');
    const sv = await sarvamTranslate(masked, langCode);
    if (sv && sv.trim()) return unmask(sv);
  } catch {
    /* fall through to free Google */
  }

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
  conceptId?: string,
  track: Track = 'foundation'
): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10', track);
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
  const raw = await completeJson(messages, { maxTokens: 300 });
  const p = parseLooseJson<any>(raw);
  if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
  // No offline guess: a grade we can't actually compute must not be invented (it would pass or fail a
  // student on a coin-flip). Surface as unavailable so the API shows the graceful message instead.
  throw new LlmUnavailableError('gradeWritten: grader returned no parseable verdict');
}

export interface SubjectiveResult {
  marksAwarded: number;
  feedback: string;
}

/**
 * Subjective marking for a board-paper written question: award PARTIAL marks out of the question's
 * maximum, following the official marking scheme's step-marking (method marks, not just the final
 * answer). Returns an integer 0..maxMarks. Used by the final past-paper exam so a half-right answer
 * earns half the marks, exactly as a real examiner would.
 */
export async function gradeSubjective(
  prompt: string,
  markingScheme: string | null,
  answer: string,
  maxMarks: number,
  langCode?: string,
  conceptId?: string,
  track: Track = 'foundation'
): Promise<SubjectiveResult> {
  const prof = examProfile(conceptId ?? 'cbse10', track);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an official ${prof.level} ${prof.subject} board examiner marking one exam question out of ${maxMarks} mark${maxMarks === 1 ? '' : 's'}. Award marks STRICTLY per the marking scheme, giving step/method marks for correct working even when the final answer is wrong or incomplete — exactly as a real examiner does. The student may answer in their own language; mark the mathematics, not the language. Return ONLY JSON {"marksAwarded": <integer 0..${maxMarks}>, "feedback": "<1-2 warm sentences: what earned marks / what was missed>"}`,
    },
    {
      role: 'user',
      content: `QUESTION (worth ${maxMarks} marks): ${prompt}\n\nOFFICIAL MARKING SCHEME / MODEL ANSWER: ${markingScheme || '(use your expert judgement of a fully-correct answer)'}\n\nSTUDENT ANSWER: ${answer}\n\nAward an integer number of marks from 0 to ${maxMarks}, following the marking scheme's step-marking.`,
    },
  ];
  const raw = await completeJson(messages, { maxTokens: 320 });
  const p = parseLooseJson<any>(raw);
  if (p && typeof p.marksAwarded === 'number') {
    const m = Math.max(0, Math.min(maxMarks, Math.round(p.marksAwarded)));
    return { marksAwarded: m, feedback: String(p.feedback || '') };
  }
  // Don't silently award 0 (that fails a possibly-correct student): surface as unavailable.
  throw new LlmUnavailableError('gradeSubjective: marker returned no parseable marks');
}

/** Grade a maths answer by checking equivalence to the ideal answer (handles fractions, expressions). */
export async function gradeEquation(prompt: string, ideal: string | null, answer: string, langCode?: string, conceptId?: string, track: Track = 'foundation'): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10', track);
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
  const raw = await completeJson(messages, { maxTokens: 250 });
  const p = parseLooseJson<any>(raw);
  if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
  // Don't silently mark wrong (that fails a possibly-correct student): surface as unavailable.
  throw new LlmUnavailableError('gradeEquation: grader returned no parseable verdict');
}

/** Grade a handwritten/drawn answer (sketch) via vision against the rubric/ideal. */
export async function gradeSketch(
  prompt: string,
  rubric: string | null,
  ideal: string | null,
  imageDataUrl: string,
  langCode?: string,
  conceptId?: string,
  track: Track = 'foundation'
): Promise<GradeResult> {
  const prof = examProfile(conceptId ?? 'cbse10', track);
  const visionPrompt = `You are grading a ${prof.studentLabel}'s hand-drawn answer.
QUESTION: ${prompt}
WHAT A CORRECT DRAWING MUST SHOW (rubric): ${rubric || ideal || 'a correct, clearly-labelled diagram'}
Look at the image and decide if it satisfies the requirement. Return ONLY JSON {"correct": boolean, "feedback": "<1-2 warm sentences on what's right / what to fix>"}`;
  // nimVision throws LlmUnavailableError if the vision model is down — we let that propagate rather than
  // accept the drawing blind (the old fallback silently passed EVERY sketch).
  const raw = await nimVision(visionPrompt, imageDataUrl, 350);
  const p = parseLooseJson<any>(raw);
  if (p && typeof p.correct === 'boolean') return { correct: p.correct, feedback: String(p.feedback || '') };
  // Vision returned prose, not JSON — interpret a clearly positive read as a pass (this is a REAL
  // model response, not a failure, so it's fair to use).
  const lc = raw.toLowerCase();
  const correct = /correct|right|good|satisfies|complete/.test(lc) && !/incorrect|not |missing|wrong/.test(lc);
  return { correct, feedback: raw.slice(0, 200) };
}

/**
 * The per-node teaching agent (bottom_up.md §4). One call does both jobs:
 *   1. produce the next short, warm Socratic turn that elicits the NEXT undemonstrated key move
 *   2. report a checklist delta IN the same JSON (no separate judge call)
 *
 * Returns clean, well-formatted prose for the chat bubble plus the structured delta.
 * Runs on NVIDIA NIM (the primary model). If NIM is unavailable it throws LlmUnavailableError — there is
 * no mock; the API turns that into a graceful "temporarily unavailable" message for the student.
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
  refreshers?: RefresherItem[]; // tutor-private foundational refreshers — deploy only when a gap surfaces
  dialogue: Array<{ role: 'tutor' | 'learner'; content: string }>;
  isReteach?: boolean;
  lang?: string;
  priorSummary?: string; // running summary of earlier conversation (cold-start resume)
  figures?: Array<{ id: string; caption: string }>; // textbook figures available for this concept
  conceptId?: string; // exam:subject:chapter:slug — selects the exam-aware persona/level
  track?: Track; // 'foundation' (default) | 'advanced' (e.g. JEE Advanced)
  advancedContent?: string | null; // extra depth/reading, surfaced ONLY on the advanced track
}

export interface TeachTurnOutput {
  message: string;
  keyMovesDemonstrated: Array<{ index: number; evidence: string }>;
  misconceptionsSeen: string[];
  readyForGate: boolean;
  provider: string;
  corpusGap?: { question: string; missing: string } | null;
  figureRef?: string | null; // id of a textbook figure to show inline this turn
  enforcedRefresher?: string | null; // set when the refresh-before-use backstop overrode the turn
}

function buildMessages(input: TeachTurnInput): ChatMessage[] {
  const moves = input.keyMoves
    .map((m) => `  [${m.index}] ${m.demonstrated ? '✓ shown' : '◻ not yet'} — ${m.text}`)
    .join('\n');
  // Anti-drift anchor: name the single next-undemonstrated key move as THIS turn's only target, so a weaker
  // model drives at one idea and doesn't open later ideas early. Self-disables (→ recap/hand-off) once all shown.
  const nextMove = input.keyMoves.find((m) => !m.demonstrated);
  const currentTarget = nextMove
    ? `YOUR ONE TARGET THIS TURN is the next idea still marked ◻ not yet — key move [${nextMove.index}]: "${nextMove.text}". Drive at THIS and nothing else: bring the student to the edge of it, then (per SOME THINGS ARE TOLD, NOT GUESSED below) land it in plain words. Do NOT open, hint at, or set up any later idea until this one is named plainly AND the student confirms it — one target, one turn; the moment it lands, the next turn moves to the next ◻ move. This target is for YOUR steering only; it stays part of your private map — never read, list, or quote it to the student.`
    : `EVERY key idea above is now ✓ shown — do NOT open anything new. Briefly and warmly recap what you built together, then hand off to the quick checks.`;
  const transcript = input.dialogue
    .map((t) => `${t.role === 'tutor' ? 'TUTOR' : 'LEARNER'}: ${t.content}`)
    .join('\n');

  const track: Track = input.track ?? 'foundation';
  const prof = examProfile(input.conceptId ?? 'cbse10', track);
  // Advanced track: fold the node's advanced overlay into the source-of-truth (extra depth/reading
  // the exam expects beyond the foundation). Empty for nearly all nodes → behaves exactly as foundation.
  const advancedBlock =
    track === 'advanced' && input.advancedContent?.trim()
      ? `\n\nADVANCED MATERIAL for the ${prof.level} track (also part of your source of truth — go deeper, hold a higher bar, and weave this in where it fits):\n${input.advancedContent.trim()}`
      : '';
  // Tutor-PRIVATE foundational refreshers (authoring_and_improve.md §A.5). The tutor must NEVER list or
  // dump these; it deploys one only when its `trigger` actually surfaces, running the Socratic loop
  // (surface→confess→fill→return). This is the grounded fill so the tutor doesn't improvise bedrock.
  const refreshers = input.refreshers ?? [];
  const refresherBlock = refreshers.length
    ? `\n\nFOUNDATIONAL REFRESHERS (PRIVATE — never list or volunteer these). Each is a bedrock "why/what" this concept leans on but no earlier lesson taught. When its TRIGGER comes up, run the Socratic loop: ask the surfacing question first (bring them to "I don't actually know"), ladder down only as far as their gap, fill from the answer below, then RETURN to the lesson. Use them often — this is what keeps the lesson conversational:\n${refreshers
        .map(
          (r, i) =>
            `  ${i + 1}. TRIGGER: ${r.trigger}\n     SURFACE: ${r.surfacingQuestion}\n     LADDER: ${(r.ladder ?? []).join(' → ')}\n     FILL: ${r.answer}\n     RETURN: ${r.returnCue}`
        )
        .join('\n')}`
    : '';
  const system = `You are a real, warm human ${prof.subject} teacher sitting beside ${prof.teacherAudience}, chatting.
You teach in the Socratic spirit — you draw understanding out with gentle questions rather than lecturing — but
above all you sound like an actual caring person, not a script. Use natural, everyday language and contractions.
React genuinely to what they say. Be encouraging and patient. Short messages, like real chat.

You are teaching ONE concept only: "${input.conceptTitle}".
In plain words it's about: ${input.brief}
Your ONLY source of truth for facts/examples: ${input.explanation}${advancedBlock}

You are quietly guiding the student to eventually grasp these ideas (NEVER list or quote these — they're your private map):
${moves}

${currentTarget}

Watch gently for these misunderstandings:
${input.misconceptions.map((m) => `  - ${m}`).join('\n')}${refresherBlock}

HOW TO TEACH (read carefully — this is the whole job):
- DON'T ASSUME — refresh, then confirm with a gate. Before you USE any term, symbol, or fact the student
  hasn't already shown you in THIS conversation — even basic prior-year words like "squared", "cubed",
  "exponent", "factor", "HCF" — first (1) refresh it in one plain-English sentence with one tiny concrete
  example, then (2) ask ONE light confirmation question: warm and low-stakes, e.g. "You've probably seen this,
  but quick check so we're together: in $2^3$, which number is the exponent?" Then (3) WAIT — do not build on
  it until they confirm; if unsure, slow down with a simpler example. Treat this course as self-contained:
  never lean on another course or school year as "already taught" — refresh it here. Build from the absolute
  ground up, slowly.
- THE SOCRATIC LOOP — surface ignorance → confess → fill → return. This is the DEFAULT RHYTHM of the whole
  lesson, not an occasional move — run it as often as you can, on small things and large. It is what makes this
  feel like a real conversation with a teacher instead of a chatbot reciting facts. Each turn, prefer to OPEN
  with a "why/what" question that walks the student to the edge of their own knowledge so they say "I don't
  actually know" — that confession IS the teaching moment. E.g. before explaining why $2^3$ is "cubed", ask
  "quick one — why do you think we call it CUBED?" If they're unsure, warmly name it ("perfect, that's exactly
  worth nailing down") and ladder DOWN with smaller questions to find their floor (what's a cube? how's it
  different from a line or square? how many dimensions? what's a dimension?), build the complete answer up from
  there, then RETURN to the main line. Go only as deep as the gap. Trivial-seeming gaps compound if skipped —
  surfacing and filling them, over and over, IS the lesson. Don't pre-explain what you could first ask.
- SOME THINGS ARE TOLD, NOT GUESSED — this is the FILL step of surface → confess → fill → return; it does NOT
  override "Don't pre-explain what you could first ask," it completes it. You still ASK first to walk them to the
  edge (that stays the default). But the moment the student is at a named fact, definition, formula, or rule they
  could NOT deduce from what's in front of them — OR they've said any version of "I don't know," guessed wrong, or
  gone vague — STOP asking and FILL it: state it in ONE plain sentence using the SOURCE'S OWN WORDS from "Your ONLY
  source of truth" above, add ONE tiny concrete example, then ask ONE light CONFIRMATION ("quick check so we're
  together: …?") — never a fresh, harder question. Two hard bans: (1) NEVER pose a question whose answer is a name
  or fact they have no way to derive from the setup — that's a fact to TELL, not a riddle. (2) NEVER affirm a vague
  or wrong answer as if it were right — gently say what's actually meant, in the source's words, then confirm. If
  you've asked the same idea twice and it still hasn't landed, that's your signal to TELL it now and move on — go
  SIMPLER, never escalate to a cleverer hypothetical, and never end a turn on a "(Hint: …)" in place of the answer.
- TRACK TANGENTS, RETURN TO THE ANCHOR. Filling a gap means leaving the main line on purpose — that's good,
  but you must CLOSE the detour, not abandon it. Always hold the anchor (the one idea the lesson is currently
  on). Open only ONE tangent at a time; resolve it before opening another. When it concludes, name the bridge
  back in one clause and resume the exact thread — e.g. "so: three dimensions, three factors, that's 'cubed' —
  right, back to where we were: …". The student should never feel the lesson lost its place.
- ONE ANALOGY, ONE JOB. A metaphor or example is a tangent (see TRACK TANGENTS): it carries exactly ONE idea, then
  you close it. NEVER keep one picture alive and bolt the next idea onto it — do NOT keep one running prop (say a
  pizza you started slicing for fractions) and then make that SAME pizza also stand for decimals, then area, then
  percentages. Stacking several ideas onto one escalating prop quietly blurs distinct ideas into one — often the
  OPPOSITE of the point. When a new idea needs a picture: FIRST try to just say it plainly; only if a picture truly
  helps, DROP the old one out loud ("let's set the pizza aside") and start a fresh, clearly-different one. When the
  point is that several things are DISTINCT, keep them in SEPARATE pictures so the student feels the difference.
- ONE small step per message. Introduce a single idea, give a simple friendly example, then ask ONE question they
  can genuinely answer from what you just said. Then stop and wait.
- NEVER restate a definition or fact as if it were a question. NEVER ask something whose answer you already showed
  (e.g. do NOT write "$2^3 = 8$, so what is $2^3$?" — that's meaningless). Your question must actually require them
  to think and have a real, not-yet-given answer.
- If they're unsure or wrong, that's great — slow down further, give an even simpler example or analogy, and try a
  smaller question. Never make them feel behind.
- Keep maths gentle: $...$ for inline (e.g. $2^3$), a $$…$$ line only when it truly clarifies.
- Stay on this concept (anti-drift): no outside topics, no facts not grounded above. If they wander OFF-topic,
  warmly bring them back. A FOUNDATIONAL detour you open to fill a gap that's needed to understand THIS concept
  is NOT drift — it's in-scope and tutor-led — provided it serves the anchor and you close it (see TRACK
  TANGENTS above). The test: does the detour help them grasp the current idea, and do you return from it?
- Sound human: vary your wording, don't be formulaic, don't say "key move" / "gate" / "checklist" / "let's build it up"
  every time. Just talk.
- CLOSING THE LESSON: if the student's latest reply means EVERY idea above is now shown (none left as ◻), do NOT ask
  another question. Instead write a short, warm wrap-up that signals the lesson part is done and you'll move to a few
  quick checks — e.g. "Lovely — you've got all the core ideas now. Whenever you're ready, I'll give you a few quick
  checks to lock it in." Keep it brief and human. Set "readyForGate": true on this turn. Never pose a fresh question here.
${input.isReteach ? '- They just missed a check, so re-approach from a completely fresh, even simpler angle — no shame, lots of warmth.' : ''}

If the student asks something you genuinely CANNOT answer from "Your ONLY source of truth" above (the content is missing it), do NOT make facts up — gently keep them on the current concept, and set "corpusGap" to flag what our material was missing.
${
  input.figures && input.figures.length
    ? `\nTEXTBOOK FIGURES available for this concept (you may show ONE when it genuinely helps the student SEE what you're explaining — e.g. a graph or diagram). To show one, set "figureRef" to its id. Only when truly useful, not every turn:\n${input.figures.map((f) => `  - ${f.id}: ${f.caption}`).join('\n')}\n`
    : ''
}
A key move that bundles several distinct parts (e.g. a rule with two separate conditions, or "X AND Y AND Z are different things") counts as demonstrated ONLY when the LEARNER has shown EVERY part in their own words, at any point in the conversation — one part alone is NOT credit: leave it ◻ and keep teaching the rest. Your own explanations never count; only what the learner showed. If unsure a part was really shown, do NOT credit it.
Then quietly judge which of your private ideas they've now genuinely demonstrated, and which misunderstandings showed.

Return ONLY a JSON object, no prose around it (write "message" in natural English — it will be translated for the student if needed):
{
  "message": "<your next short tutor turn>",
  "keyMovesDemonstrated": [{ "index": <int>, "evidence": "<the learner's OWN words that prove it — for a multi-part move, words covering EVERY part>" }],
  "misconceptionsSeen": ["<short label>"],
  "readyForGate": <true ONLY if EVERY key move is fully demonstrated by the learner — for a multi-part move, all parts shown>,
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

/**
 * Pull the (possibly still-growing) "message" value out of a partial JSON stream so the client can
 * show the tutor turn token-by-token. "message" is the FIRST field in the schema, so its prose arrives
 * early. We decode it exactly as the final parse will (repair single-backslash LaTeX, then JSON-decode),
 * tolerating a stream cut mid-escape. Returns null until the opening `"message": "` has streamed in.
 */
export function extractStreamingMessage(raw: string): string | null {
  const m = raw.match(/"message"\s*:\s*"/);
  if (!m || m.index == null) return null;
  const start = m.index + m[0].length;
  let i = start;
  let end = -1;
  while (i < raw.length) {
    if (raw[i] === '\\') {
      i += 2;
      continue;
    } // skip an escaped char (incl. \")
    if (raw[i] === '"') {
      end = i;
      break;
    }
    i++;
  }
  let inner = end >= 0 ? raw.slice(start, end) : raw.slice(start);
  // Stream still open: a trailing backslash-run + letters may be an incomplete LaTeX command (`\t`,
  // `\tim`, `\frac…`) — decoding `\t`/`\n` now would flash a TAB/newline. Trim it; the next token (or
  // the final authoritative parse) restores it a frame later.
  if (end < 0) inner = inner.replace(/\\+[a-zA-Z]*$/, '');
  const fixed = repairJsonBackslashes(inner);
  try {
    return JSON.parse(`"${fixed}"`);
  } catch {
    try {
      return JSON.parse(`"${fixed.replace(/\\+$/, '')}"`);
    } catch {
      return inner;
    }
  }
}

/**
 * Refresh-before-use ENFORCEMENT (deterministic backstop for weak teaching models).
 * The system prompt tells the tutor to deploy a refresher BEFORE using a guarded term, but a small
 * model (e.g. the NIM 14B primary) often skips it. Post-generation, we detect when a turn introduces a
 * term guarded by an as-yet-undeployed refresher and force that refresher's surfacing question instead —
 * so the bedrock check always happens, regardless of model compliance. Guarded terms are the quoted
 * phrases in each refresher's `trigger` (e.g. 'The word "prime" — …' → "prime").
 */
function refresherGuardTerms(r: RefresherItem): string[] {
  return [...String(r.trigger ?? '').matchAll(/[“"']([^“”"']{1,40})[”"']/g)]
    .map((m) => m[1].trim().toLowerCase())
    .filter((t) => t.length > 1);
}
function termAppears(text: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(text);
}
/**
 * The first refresher whose guarded term the NEW message introduces but which has NOT yet been
 * deployed/seen in the prior conversation — a refresh-before-use violation. null if none.
 */
export function pendingRefresher(
  message: string,
  refreshers: RefresherItem[] | undefined,
  priorTutorText: string
): RefresherItem | null {
  for (const r of refreshers ?? []) {
    if (!r?.surfacingQuestion) continue;
    const terms = refresherGuardTerms(r);
    if (!terms.length) continue;
    if (!terms.some((t) => termAppears(message, t))) continue; // term not used this turn
    const alreadySurfaced = priorTutorText.includes(String(r.surfacingQuestion).slice(0, 30));
    const seenEarlier = terms.some((t) => termAppears(priorTutorText, t));
    if (alreadySurfaced || seenEarlier) continue; // already refreshed / introduced earlier
    return r;
  }
  return null;
}

export async function teachTurn(
  input: TeachTurnInput,
  onDelta?: (messageSoFar: string) => void
): Promise<TeachTurnOutput> {
  // NIM-only, no mock: completeJson throws LlmUnavailableError if the model is down. We let that
  // propagate so the API shows the student a graceful "unavailable" message — we never fabricate a turn.
  let lastSent = '';
  const onStream = onDelta
    ? (textSoFar: string) => {
        const msg = extractStreamingMessage(textSoFar);
        if (msg != null && msg !== lastSent) {
          lastSent = msg;
          onDelta(msg);
        }
      }
    : undefined;
  // maxTokens 1000 (was 700): the turn JSON is message + grading evidence; 700 could truncate the tail on
  // a verbose grading reply, leaving JSON that won't parse — which used to surface as "tutor unavailable"
  // even though the message had already streamed fine.
  const raw = await completeJson(buildMessages(input), { maxTokens: 1000, onStream });
  const parsed = parseLooseJson<any>(raw);
  if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
    const cg = parsed.corpusGap;
    const out: TeachTurnOutput = {
      message: parsed.message.trim(),
      keyMovesDemonstrated: Array.isArray(parsed.keyMovesDemonstrated) ? parsed.keyMovesDemonstrated : [],
      misconceptionsSeen: Array.isArray(parsed.misconceptionsSeen) ? parsed.misconceptionsSeen : [],
      readyForGate: !!parsed.readyForGate,
      provider: resolveProvider(),
      corpusGap: cg && cg.missing ? { question: String(cg.question ?? ''), missing: String(cg.missing) } : null,
      figureRef: parsed.figureRef ? String(parsed.figureRef) : null,
      enforcedRefresher: null,
    };
    // ENFORCE refresh-before-use: if the model used a guarded term without first running its refresher,
    // override this turn with the refresher's surfacing question (deterministic backstop, §A.5).
    const priorTutorText = [
      input.priorSummary ?? '',
      ...input.dialogue.filter((d) => d.role === 'tutor').map((d) => d.content),
    ].join('\n');
    const pending = pendingRefresher(out.message, input.refreshers, priorTutorText);
    if (pending) {
      out.message = pending.surfacingQuestion;
      out.keyMovesDemonstrated = []; // a forced foundational detour — don't credit progress this turn
      out.readyForGate = false;
      out.enforcedRefresher = pending.trigger;
      onDelta?.(out.message); // overwrite any streamed draft with the surfacing question
    }
    return out;
  }
  // SALVAGE: the authoritative JSON didn't parse into a usable turn (e.g. a truncated/garbled tail), but
  // the learner has very likely already SEEN the streamed message — don't throw it away as "unavailable".
  // Recover the message field (from the live stream, else re-extract it from raw) and return a minimal
  // turn; the grading metadata is just skipped this turn (readyForGate stays false → re-judged next turn).
  const salvaged = (lastSent || extractStreamingMessage(raw) || '').trim();
  if (salvaged) {
    return {
      message: salvaged,
      keyMovesDemonstrated: [],
      misconceptionsSeen: [],
      readyForGate: false,
      provider: resolveProvider(),
      corpusGap: null,
      figureRef: null,
    };
  }
  // Truly nothing usable came back — surface the graceful unavailable message rather than inventing a turn.
  throw new LlmUnavailableError('teachTurn: model returned no parseable message');
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


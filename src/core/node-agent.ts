import { completeJson, parseLooseJson, resolveProvider, type ChatMessage } from './llm.js';

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
}

export interface TeachTurnOutput {
  message: string;
  keyMovesDemonstrated: Array<{ index: number; evidence: string }>;
  misconceptionsSeen: string[];
  readyForGate: boolean;
  provider: string;
}

function buildMessages(input: TeachTurnInput): ChatMessage[] {
  const moves = input.keyMoves
    .map((m) => `  [${m.index}] ${m.demonstrated ? '✓ shown' : '◻ not yet'} — ${m.text}`)
    .join('\n');
  const transcript = input.dialogue
    .map((t) => `${t.role === 'tutor' ? 'TUTOR' : 'LEARNER'}: ${t.content}`)
    .join('\n');

  const system = `You are a warm, encouraging maths tutor teaching ONE concept bottom-up to a CBSE Class 10 student.
Concept: "${input.conceptTitle}".
What it means: ${input.brief}
Background: ${input.explanation}

You must guide the student to demonstrate these KEY MOVES (the checklist):
${moves}

Common misconceptions to watch for:
${input.misconceptions.map((m) => `  - ${m}`).join('\n')}

RULES:
- Keep each turn SHORT: 1–3 sentences. Ask ONE question that elicits the next not-yet-shown key move.
- Be warm and plain. Use $...$ for any maths (e.g. $\\sqrt{2}$, $2^3 \\cdot 3^2$).
- Do NOT lecture all key moves at once. Move one step at a time.
${input.isReteach ? '- This is a RE-TEACH after a missed check: gently re-explain from a fresh angle, do not shame.' : ''}

After reading the latest learner reply, judge which key moves they have now clearly demonstrated and which misconceptions appeared.

Return ONLY a JSON object, no prose around it:
{
  "message": "<your next short tutor turn>",
  "keyMovesDemonstrated": [{ "index": <int>, "evidence": "<the learner words that prove it>" }],
  "misconceptionsSeen": ["<short label>"],
  "readyForGate": <true if ALL key moves are now demonstrated>
}`;

  const user = transcript
    ? `Conversation so far:\n${transcript}\n\nProduce the next tutor turn + checklist delta as JSON.`
    : `Open the lesson warmly: a one-line friendly greeting, name the concept in plain words so the student knows what we're about to build, then ask ONE gentle opening question that elicits key move [0]. Keep it short and human. Return JSON.`;

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
      return {
        message: parsed.message.trim(),
        keyMovesDemonstrated: Array.isArray(parsed.keyMovesDemonstrated) ? parsed.keyMovesDemonstrated : [],
        misconceptionsSeen: Array.isArray(parsed.misconceptionsSeen) ? parsed.misconceptionsSeen : [],
        readyForGate: !!parsed.readyForGate,
        provider: resolveProvider(),
      };
    }
  } catch {
    /* fall through to mock */
  }
  return mockTurn(input);
}

/** Clean offline fallback — readable prose, simple heuristic checklist progress. */
function mockTurn(input: TeachTurnInput): TeachTurnOutput {
  const nextMove = input.keyMoves.find((m) => !m.demonstrated);
  const lastLearner = [...input.dialogue].reverse().find((t) => t.role === 'learner');

  // Opening turn — warm greeting that leads into the topic.
  if (!lastLearner) {
    const topic = input.conceptTitle.charAt(0).toLowerCase() + input.conceptTitle.slice(1);
    return {
      message: `Hi! 👋 Let's work through ${topic} together — no rush, we'll build it up step by step. ${input.brief}\n\nTo get us started: ${questionFor(nextMove?.text)}`,
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

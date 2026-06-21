import axios from 'axios';
import { recordLlmCall } from './llm-log.js';
import { MODELS } from './models.js';

/**
 * ModelRouter — model policy (2026-06-20, user directive):
 *   - ALL traffic (students + tests) → NVIDIA NIM (free) — the PRIMARY model.
 *   - Claude is opt-in only (LLM_PROVIDER=claude) for a manual override; never under the test runner.
 *   - There is NO mock provider and NO silent offline fallback anymore. If NIM fails, the call throws
 *     `LlmUnavailableError`; the API surfaces a plain "app is temporarily down, admin notified" message
 *     to the student and the failure (with the provider's full error body) is recorded in bu_llm_call,
 *     visible in the admin panel's Errors view. We never fabricate a tutor turn or a grade.
 */
export type Provider = 'nvidia' | 'claude';

/**
 * Thrown when the live model can't produce a result (provider error, timeout, missing key, or an
 * unparseable reply). The API layer catches this and shows the student a graceful "unavailable"
 * message instead of a broken/blank turn. `detail` is the full diagnostic (already logged).
 */
export class LlmUnavailableError extends Error {
  detail: string;
  constructor(detail: string) {
    super('The tutor is temporarily unavailable.');
    this.name = 'LlmUnavailableError';
    this.detail = detail;
  }
}

/** Full, loggable diagnostic for a failed provider call — INCLUDING the provider's error body
 *  (an Anthropic/NIM 400 carries its real reason in response.data, which a bare axios message drops). */
function errorDetail(err: unknown): string {
  const e = err as { message?: string; code?: string; response?: { status?: number; data?: unknown } };
  const parts: string[] = [];
  if (e?.response?.status) parts.push(`HTTP ${e.response.status}`);
  if (e?.code) parts.push(String(e.code));
  if (e?.message) parts.push(e.message);
  if (e?.response?.data != null) {
    let body: string;
    try {
      body = typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data);
    } catch {
      body = String(e.response.data);
    }
    parts.push(`body: ${body.slice(0, 1000)}`);
  }
  return parts.join(' · ') || String(err);
}

/** Re-wrap any failure as LlmUnavailableError (carrying the full diagnostic), unless it already is one. */
function asLlmUnavailable(err: unknown): LlmUnavailableError {
  return err instanceof LlmUnavailableError ? err : new LlmUnavailableError(errorDetail(err));
}

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
// Thinking/reasoning OFF (opt-in via NIM_NO_THINK): our prompt supplies the structure and does the
// scaffolding, so chain-of-thought is wasted latency AND its <think> preamble corrupts the streamed
// JSON turn. Setting this lets us run big hybrid-reasoning models (qwen3.x / nemotron) as fast plain
// responders, and is a safe defensive default on plain models (they ignore it). NIM accepts
// chat_template_kwargs for hybrid models; plain-instruct models ignore it.
const NIM_EXTRA: Record<string, unknown> = process.env.NIM_NO_THINK
  ? { chat_template_kwargs: { thinking: false } }
  : {};
// All model ids live in ./models.ts (MODELS) — the single place to swap a model. Live = NIM.

/** Claude completion for translation (opt-in only; the live translate path uses Sarvam/Google/NIM). */
export async function claudeTranslate(messages: ChatMessage[], maxTokens = 1000): Promise<string> {
  return claudeComplete(messages, maxTokens, MODELS.claude, 'translate');
}

export function resolveProvider(): Provider {
  const isTestRunner = process.env.NODE_ENV === 'test';
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase();
  // Claude is opt-in only (manual override / authoring parity) and never under the test runner.
  if (!isTestRunner && (explicit === 'claude' || explicit === 'haiku')) return 'claude';
  // PRIMARY for everything else (all student traffic + tests): free NVIDIA NIM. No mock fallback.
  return 'nvidia';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Should a primary-provider (Claude) failure trigger the free-NIM fallback for LIVE student
 * continuity? Yes for exhaustion/transient/availability failures — rate-limit & quota (429),
 * overloaded (529), server (5xx), auth/credit exhaustion (401/403), and any network/timeout
 * (no HTTP response, incl. a missing/empty ANTHROPIC_API_KEY). NOT for genuine client bugs
 * (400/404/422) — NIM would reject those too, and silently masking them hides a real defect.
 */
function shouldFallbackToNim(err: unknown): boolean {
  const e = err as { response?: { status?: number }; code?: string };
  const status = e?.response?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 429 || status === 529) return true;
    if (status === 401 || status === 403) return true; // credit/quota exhaustion often surfaces here
    return status >= 500; // 5xx → fall back; 4xx client bugs → surface
  }
  return true; // no HTTP response: network/DNS/timeout/missing-key → fall back
}

/**
 * Call the active provider for a JSON completion. Returns raw text (caller parses).
 *
 * PRIMARY = NVIDIA NIM (free meta/llama-3.3-70b-instruct). It has NO fallback — it is the free floor,
 * and there is no mock anymore. A NIM failure throws `LlmUnavailableError` (with the full diagnostic),
 * which the API turns into a graceful "temporarily unavailable, admin notified" message.
 * The only fallback that remains is for the OPT-IN Claude override (LLM_PROVIDER=claude): a transient
 * Anthropic failure still drops to free NIM so a manually-Claude session isn't left stranded.
 */
export async function completeJson(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; onStream?: (textSoFar: string) => void; model?: string; modelFallback?: string }
): Promise<string> {
  const provider = resolveProvider();
  const maxTokens = opts?.maxTokens ?? 1024;
  // Stream from NIM when the caller wants live tokens (the tutor turn). Claude's own streaming isn't
  // wired here — a forced-Claude session just completes normally, then NIM streams on fallback.
  const callNim = (model: string) =>
    opts?.onStream ? nimCompleteStream(messages, maxTokens, opts.onStream, model) : nimComplete(messages, maxTokens, true, model);
  // PRIMARY NIM model, then the fallback NIM model (a DIFFERENT id) if the primary errors transiently —
  // a busy/down/missing primary shouldn't strand a student when another free model can answer. The
  // dynamic router (nim-router.ts) passes a per-session `model` it speed-probed; otherwise use the default.
  const primary = opts?.model || MODELS.text;
  const fallback = opts?.modelFallback || MODELS.textFallback;
  const nim = async () => {
    try {
      return await callNim(primary);
    } catch (err) {
      if (fallback && fallback !== primary && isModelRetryable(err)) {
        return await callNim(fallback);
      }
      throw err;
    }
  };
  try {
    if (provider === 'claude') {
      try {
        return await claudeComplete(messages, maxTokens);
      } catch (err) {
        if (process.env.NVIDIA_API_KEY && shouldFallbackToNim(err)) {
          return await nim(); // free NIM keeps a forced-Claude session served
        }
        throw err;
      }
    }
    return await nim();
  } catch (err) {
    throw asLlmUnavailable(err); // never leak a raw error / never fabricate — surface as unavailable
  }
}

/** Should a failed PRIMARY NIM model fall through to the fallback NIM model? Yes for anything transient
 *  or availability-related (429/5xx/timeout/network/empty/404-deprovisioned); NO for a request-level bug
 *  (400/422) or auth failure (401/403) — the fallback model would reject those identically. The error may
 *  arrive raw or already wrapped as LlmUnavailableError, so we inspect the diagnostic string either way. */
function isModelRetryable(err: unknown): boolean {
  const d = err instanceof LlmUnavailableError ? err.detail : errorDetail(err);
  return !/HTTP (400|401|403|422)\b/.test(d);
}

async function nimComplete(messages: ChatMessage[], maxTokens: number, json: boolean, model: string = MODELS.text): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY missing');
  // NOTE: no response_format json_object — on NIM it strands content as null for several models.
  // We instead instruct "Return ONLY JSON" in the prompt and use parseLooseJson on the reply.
  void json;
  const t0 = Date.now();
  try {
    const res = await axios.post(
      `${NIM_BASE}/chat/completions`,
      {
        model,
        messages,
        temperature: 0.6,
        max_tokens: maxTokens,
        ...NIM_EXTRA,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        // Free NIM tier can have high first-token latency under load; give it room before falling back.
        timeout: 60_000,
      }
    );
    const content = res.data?.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) throw new Error('Empty NIM content');
    recordLlmCall({
      provider: 'nvidia', model, purpose: 'tutor', messages,
      response: String(content), ms: Date.now() - t0,
      promptTokens: res.data?.usage?.prompt_tokens, completionTokens: res.data?.usage?.completion_tokens,
    });
    return String(content);
  } catch (err) {
    recordLlmCall({ provider: 'nvidia', model, purpose: 'tutor', messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
    throw asLlmUnavailable(err);
  }
}

/**
 * Streaming variant of nimComplete: posts with `stream: true` and parses the OpenAI-style SSE chunks,
 * calling `onText` with the FULL accumulated text after each delta (so the caller can extract the
 * growing tutor message and forward it). Returns the complete reply once the stream ends — the caller
 * still parses that authoritatively. Same 60s patience + error/logging contract as the non-stream path.
 */
async function nimCompleteStream(
  messages: ChatMessage[],
  maxTokens: number,
  onText: (textSoFar: string) => void,
  model: string = MODELS.text
): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY missing');
  const t0 = Date.now();
  let full = '';
  try {
    const res = await axios.post(
      `${NIM_BASE}/chat/completions`,
      { model, messages, temperature: 0.6, max_tokens: maxTokens, stream: true, ...NIM_EXTRA },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: 60_000,
      }
    );
    await new Promise<void>((resolve, reject) => {
      let buf = '';
      const stream = res.data as NodeJS.ReadableStream;
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        // SSE frames are newline-delimited "data: {json}" lines, terminated by "data: [DONE]".
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (piece) {
              full += piece;
              try {
                onText(full);
              } catch {
                /* a listener error must never break the stream */
              }
            }
          } catch {
            /* ignore keep-alive / partial JSON frames */
          }
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', (e: unknown) => reject(e));
    });
    if (!full.trim()) throw new Error('Empty NIM stream content');
    recordLlmCall({ provider: 'nvidia', model, purpose: 'tutor', messages, response: full, ms: Date.now() - t0 });
    return full;
  } catch (err) {
    recordLlmCall({ provider: 'nvidia', model, purpose: 'tutor', messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
    throw asLlmUnavailable(err);
  }
}

/**
 * Vision turn for the scratchpad "Help me" and sketch grading: NIM's vision model reads the learner's
 * handwritten working (a JPEG data URL). On failure it throws `LlmUnavailableError` (no offline fallback).
 */
export async function nimVision(prompt: string, jpegDataUrl: string, maxTokens = 400): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY missing');
  const model = MODELS.vision;
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: jpegDataUrl } },
      ],
    },
  ];
  const t0 = Date.now();
  try {
    const res = await axios.post(
      `${NIM_BASE}/chat/completions`,
      { model, messages, max_tokens: maxTokens, temperature: 0.4 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60_000 }
    );
    const content = res.data?.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) throw new Error('Empty vision content');
    recordLlmCall({
      provider: 'nvidia', model, purpose: 'vision', messages, response: String(content), ms: Date.now() - t0,
      promptTokens: res.data?.usage?.prompt_tokens, completionTokens: res.data?.usage?.completion_tokens,
    });
    return String(content);
  } catch (err) {
    recordLlmCall({ provider: 'nvidia', model, purpose: 'vision', messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
    throw asLlmUnavailable(err);
  }
}

/** Author a JSON completion (offline curated-authoring tools only — NOT teaching traffic, NOT a test
 *  suite). Defaults to MODELS.claude; pass a model to override (e.g. 'claude-opus-4-8' for curated
 *  first-node authoring) or set MODEL_AUTHOR / MODEL_CLAUDE. Small-batch, human-in-the-loop. */
export async function claudeAuthor(messages: ChatMessage[], maxTokens = 2000, model: string = MODELS.claude): Promise<string> {
  return claudeComplete(messages, maxTokens, model, 'author');
}

/** Claude Haiku VISION: caption/classify an image (base64). Used by the figure-captioning pass. */
export async function claudeVision(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mediaType = 'image/png',
  maxTokens = 400
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: userText },
      ],
    },
  ];
  const t0 = Date.now();
  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: MODELS.claudeVision, max_tokens: maxTokens, system: systemPrompt, messages },
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 40_000 }
    );
    const text = res.data?.content?.[0]?.text;
    if (!text) throw new Error('Empty Claude vision content');
    recordLlmCall({
      provider: 'claude', model: MODELS.claudeVision, purpose: 'figure',
      messages: [{ role: 'system', content: systemPrompt }, ...messages], response: String(text), ms: Date.now() - t0,
      promptTokens: res.data?.usage?.input_tokens, completionTokens: res.data?.usage?.output_tokens,
    });
    return String(text);
  } catch (err) {
    recordLlmCall({ provider: 'claude', model: MODELS.claudeVision, purpose: 'figure', messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
    throw err;
  }
}

async function claudeComplete(messages: ChatMessage[], maxTokens: number, model: string = MODELS.claude, purpose = 'tutor'): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const t0 = Date.now();
  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model, max_tokens: maxTokens, system, messages: rest },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    const text = res.data?.content?.[0]?.text;
    if (!text) throw new Error('Empty Claude content');
    // Capture the FULL request messages (incl. system) + response — the replay corpus for the NIM study.
    recordLlmCall({
      provider: 'claude', model, purpose, messages, response: String(text), ms: Date.now() - t0,
      promptTokens: res.data?.usage?.input_tokens, completionTokens: res.data?.usage?.output_tokens,
    });
    return String(text);
  } catch (err) {
    recordLlmCall({ provider: 'claude', model, purpose, messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
    throw err;
  }
}

// Known LaTeX commands that start with "n" — the one escape letter that's also a real line break.
// (Only these protect a backslash; any other "\n…" is treated as a genuine newline, see below.)
const N_LATEX = /^(?:nabla|neq|ne|neg|ni|notin|nmid|nleq|ngeq|nu|nearrow|nwarrow|nparallel|nsubseteq|nsupseteq|nrightarrow|nleftarrow)$/;

/**
 * Repair single-backslash LaTeX in an LLM's JSON reply so JSON.parse keeps the maths intact.
 *
 * Models routinely emit JSON-illegal LaTeX — `"$2\times2$"` instead of the legal `"$2\\times2$"`.
 * JSON.parse then either (a) SILENTLY corrupts it, because `\t \n \r \b \f` are valid JSON escapes
 * (so `\times` → TAB+"imes" — the "2imes2imes2" bug, in chat AND read-aloud), or (b) THROWS, because
 * `\s \c \a \p …` are INVALID escapes (so `\sqrt \cdot \pi \alpha` kill the whole tutor turn).
 *
 * Fix: double every backslash that begins a LaTeX command, while leaving genuine JSON escapes
 * (`\" \\ \/ \uXXXX` and real `\n` line breaks) untouched. Already-correct `\\times` is preserved,
 * so this is a no-op on well-formed JSON. A LaTeX command is always `\`+letters, so a control escape
 * (`\t \r \b \f`) followed by a NON-letter is kept as-is; only when a letter follows is it LaTeX.
 */
export function repairJsonBackslashes(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; ) {
    if (raw[i] !== '\\') {
      out += raw[i];
      i++;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      out += '\\\\'; // trailing lone backslash
      break;
    }
    if (next === '\\') {
      out += '\\\\'; // already-escaped pair — keep, don't reinterpret what follows
      i += 2;
      continue;
    }
    if (next === '"' || next === '/') {
      out += '\\' + next; // genuine JSON escapes — must survive verbatim
      i += 2;
      continue;
    }
    if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6); // \uXXXX unicode escape — keep (a \underline etc. falls through)
      i += 6;
      continue;
    }
    if (next === 'n') {
      // `\n` is the only escape models really use for line breaks. Keep it as a newline UNLESS the
      // following lowercase run is EXACTLY a known LaTeX command (\neq, \nabla, \nu …), which we protect.
      const run = (raw.slice(i + 1).match(/^[a-z]+/) || [''])[0];
      if (N_LATEX.test(run)) {
        out += '\\\\';
        i++;
      } else {
        out += '\\n';
        i += 2;
      }
      continue;
    }
    if (next === 't' || next === 'r' || next === 'b' || next === 'f') {
      // \times \rho \beta \frac … (a command: backslash + LETTERS) → double the backslash.
      // A real \t \r \b \f escape (followed by a non-letter) stays a control char.
      if (/[A-Za-z]/.test(raw[i + 2] || '')) {
        out += '\\\\';
        i++;
      } else {
        out += '\\' + next;
        i += 2;
      }
      continue;
    }
    // Any other char after the backslash is LaTeX, never a valid/intended JSON escape here:
    //   a letter → \sqrt \cdot \pi \alpha \Delta …   a non-letter → \( \[ \{ \, \; (delims/spacing).
    out += '\\\\';
    i++;
  }
  return out;
}

/** Tolerant JSON extraction from an LLM reply (handles code fences / surrounding prose). */
export function parseLooseJson<T = any>(raw: string): T | null {
  // Repair single-backslash LaTeX FIRST: on the silent-corruption case JSON.parse(raw) would
  // "succeed" with garbled maths, so we must not try the raw string before repairing it.
  const fixed = repairJsonBackslashes(raw);
  try {
    return JSON.parse(fixed) as T;
  } catch {
    const m = fixed.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

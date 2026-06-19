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
export async function completeJson(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
  const provider = resolveProvider();
  const maxTokens = opts?.maxTokens ?? 1024;
  try {
    if (provider === 'claude') {
      try {
        return await claudeComplete(messages, maxTokens);
      } catch (err) {
        if (process.env.NVIDIA_API_KEY && shouldFallbackToNim(err)) {
          return await nimComplete(messages, maxTokens, true); // free NIM keeps a forced-Claude session served
        }
        throw err;
      }
    }
    return await nimComplete(messages, maxTokens, true);
  } catch (err) {
    throw asLlmUnavailable(err); // never leak a raw error / never fabricate — surface as unavailable
  }
}

async function nimComplete(messages: ChatMessage[], maxTokens: number, json: boolean): Promise<string> {
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
        model: MODELS.text,
        messages,
        temperature: 0.6,
        max_tokens: maxTokens,
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
      provider: 'nvidia', model: MODELS.text, purpose: 'tutor', messages,
      response: String(content), ms: Date.now() - t0,
      promptTokens: res.data?.usage?.prompt_tokens, completionTokens: res.data?.usage?.completion_tokens,
    });
    return String(content);
  } catch (err) {
    recordLlmCall({ provider: 'nvidia', model: MODELS.text, purpose: 'tutor', messages, ms: Date.now() - t0, ok: false, error: errorDetail(err) });
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

/** Tolerant JSON extraction from an LLM reply (handles code fences / surrounding prose). */
export function parseLooseJson<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
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

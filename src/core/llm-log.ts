import { db } from '../db/index.js';
import { buLlmCall } from '../db/schema.js';
import type { ChatMessage } from './llm.js';

/**
 * Fire-and-forget capture of every production model call into bu_llm_call — the replay corpus for
 * the NIM model study. NEVER throws into the hot path: a logging failure must not break tutoring.
 * Base64 image data URLs are stripped to a marker so vision calls don't bloat the DB (the study
 * uses a small curated image set for vision, not stored scratchpad captures).
 */

export interface LlmCallRecord {
  provider: 'claude' | 'nvidia';
  model: string;
  purpose?: string;
  messages: unknown; // ChatMessage[] or provider-shaped messages (vision)
  response?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  ms?: number | null;
  ok?: boolean;
  error?: string | null;
}

// Replace long base64 data URLs (data:image/...;base64,XXXX) with a short marker.
function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, '[image omitted]');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

export function recordLlmCall(rec: LlmCallRecord): void {
  // Intentionally not awaited by callers. Swallow all errors.
  void db
    .insert(buLlmCall)
    .values({
      provider: rec.provider,
      model: rec.model,
      purpose: rec.purpose ?? null,
      messages: sanitize(rec.messages) as object,
      response: rec.response ?? null,
      promptTokens: rec.promptTokens ?? null,
      completionTokens: rec.completionTokens ?? null,
      ms: rec.ms ?? null,
      ok: rec.ok ?? true,
      error: rec.error ?? null,
    })
    .catch((e) => console.error('recordLlmCall failed (non-fatal):', e?.message ?? e));
}

export type { ChatMessage };

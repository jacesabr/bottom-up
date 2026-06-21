/**
 * Dynamic NIM model router. Free NIM endpoints swing in speed/availability through the day (a model
 * that's snappy now can time out 30 min later), so we don't hardcode one. Instead: each session we
 * SPEED-PROBE a curated pool of candidates (thinking OFF) and pick the best by a 50/50 blend of live
 * speed and a precomputed QUALITY score. The winner serves that session's calls; `models.ts` stays the
 * fallback default. Quality is seeded from the 2026-06-20 NIM benchmark and refined by tools/nim-bench.
 */
import axios from 'axios';
import { MODELS } from './models.js';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

export interface Candidate { id: string; quality: number; } // quality: 0..1, precomputed

/** Pool the router may pick from — PLAIN-INSTRUCT, JSON-clean only (reasoning models corrupt the
 *  streamed JSON turn; gated ids 404). Env-overridable via NIM_CANDIDATES_TEXT / _VISION (comma list). */
// Quality from tools/nim-bench (2026-06-21, thinking-off, deterministic battery). deepseek-v4-pro is kept
// despite no measured quality (it kept timing out) — it's a strong model WHEN up, and the live probe drops
// it automatically when it's slow that minute, so it costs nothing to keep as an aspirational candidate.
// llama-3.3-70b dropped (consistently times out, no edge over qwen/llama-8b); the 404 ids removed.
export const CANDIDATES: { text: Candidate[]; vision: Candidate[] } = {
  text: [
    { id: 'qwen/qwen3-next-80b-a3b-instruct', quality: 0.75 },
    { id: 'mistralai/ministral-14b-instruct-2512', quality: 0.63 },
    { id: 'meta/llama-3.1-8b-instruct', quality: 0.63 },
    { id: 'deepseek-ai/deepseek-v4-pro', quality: 0.9 }, // unmeasured (timeouts); probe-gated to fast windows
  ],
  vision: [
    { id: 'nvidia/nemotron-nano-12b-v2-vl', quality: 0.83 }, // tools/nim-vision-bench (2026-06-21, fastest)
    { id: 'meta/llama-3.2-11b-vision-instruct', quality: 0.83 },
    { id: 'meta/llama-3.2-90b-vision-instruct', quality: 0.83 }, // reliable but ~2x slower
  ],
};

export interface ProbeResult { model: string; ok: boolean; latencyMs: number; quality: number; score: number; }
export interface RouteResult { kind: 'text' | 'vision'; ranked: ProbeResult[]; winner: string; fallback: string; probedAt: number; }

// Thinking OFF for probes (and ideally all turns) — hybrid models otherwise emit <think> that both slows
// the probe and corrupts JSON. Matches the NIM_NO_THINK switch used elsewhere.
const THINK_OFF = process.env.NIM_NO_THINK ? { chat_template_kwargs: { thinking: false } } : {};
// 1×1 transparent PNG — a vision probe must send an image (text-only would 400 on some VL models), but it
// only needs to measure latency/availability, so the smallest possible image keeps the probe fast.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function probeOne(model: string, key: string, timeoutMs: number, kind: 'text' | 'vision'): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  const content: any = kind === 'vision'
    ? [{ type: 'text', text: 'Reply with the single word: ready' }, { type: 'image_url', image_url: { url: TINY_PNG } }]
    : 'Reply with the single word: ready';
  try {
    await axios.post(
      `${NIM_BASE}/chat/completions`,
      { model, messages: [{ role: 'user', content }], max_tokens: 4, temperature: 0, ...(kind === 'vision' ? {} : THINK_OFF) },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: timeoutMs }
    );
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

/**
 * Speed-probe every candidate in parallel and rank by 0.5·speed + 0.5·quality (speed normalized so the
 * fastest healthy probe = 1). Returns the ranked list + winning model id. Falls back to the models.ts
 * default if there's no key or every probe fails — so a probe outage never strands a session.
 */
export async function routeModels(kind: 'text' | 'vision' = 'text', timeoutMs = 8000): Promise<RouteResult> {
  const fallback = kind === 'text' ? MODELS.text : MODELS.vision;
  const key = process.env.NVIDIA_API_KEY;
  const cands = CANDIDATES[kind];
  const probedAt = Date.now();
  if (!key || !cands.length) return { kind, ranked: [], winner: fallback, fallback, probedAt };

  const probes = await Promise.all(cands.map((c) => probeOne(c.id, key, timeoutMs, kind).then((p) => ({ ...c, ...p }))));
  const oks = probes.filter((p) => p.ok);
  // Failed candidates kept for display (the popup shows the full race, incl. ✗ timeouts) — never selected.
  const failedRows: ProbeResult[] = probes.filter((p) => !p.ok).map((p) => ({ model: p.id, ok: false, latencyMs: p.latencyMs, quality: p.quality, score: 0 }));
  if (!oks.length) return { kind, ranked: failedRows, winner: fallback, fallback, probedAt };

  // Absolute speed score, NOT min-max over the tiny live set (that crushes the 2nd-fastest to 0 even when
  // it's only ~300ms slower, making 50/50 behave like speed-only). ≤FAST_FLOOR ms = full marks; ≥SLOW_CEIL
  // = 0 — so a slightly-slower but higher-quality model can still win, which is the balance we want.
  const FAST_FLOOR = 350, SLOW_CEIL = 4000;
  const speedNorm = (ms: number) => Math.max(0, Math.min(1, 1 - (ms - FAST_FLOOR) / (SLOW_CEIL - FAST_FLOOR)));
  const okRanked: ProbeResult[] = oks
    .map((p) => ({ model: p.id, ok: true, latencyMs: p.latencyMs, quality: p.quality, score: 0.5 * speedNorm(p.latencyMs) + 0.5 * p.quality }))
    .sort((a, b) => b.score - a.score);
  return { kind, ranked: [...okRanked, ...failedRows], winner: okRanked[0].model, fallback, probedAt };
}

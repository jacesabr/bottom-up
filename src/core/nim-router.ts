/**
 * Dynamic NIM model router. Free NIM endpoints swing in speed/availability through the day (a model
 * that's snappy now can time out 30 min later), so we don't hardcode one. Instead: each session we
 * SPEED-PROBE a curated pool of candidates (thinking OFF) and pick the best by a 50/50 blend of speed
 * and a precomputed QUALITY score. For TEXT, speed is the live probe latency (representative + captures
 * current congestion). For VISION, the live probe only gates availability and speed comes from the bench
 * (a 1×1 probe can't measure real per-image time), so it's 50/50 of precomputed speed × precomputed
 * quality, gated by live up/down. The winner serves that session's calls; `models.ts` stays the fallback
 * default. Quality + vision speed are measured by tools/nim-bench.ts + tools/nim-vision-bench.ts.
 */
import axios from 'axios';
import { MODELS } from './models.js';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// quality: 0..1, precomputed. speedMs: realistic per-call inference time from the bench — used for VISION
// only, because a vision probe sends a 1×1 image and so returns in ~300ms regardless of model, telling us
// nothing about real per-image speed (which is 7–17s). Text uses the live probe latency instead (it IS
// representative and captures current congestion), so speedMs is omitted there.
export interface Candidate { id: string; quality: number; speedMs?: number; }

/** Pool the router may pick from — PLAIN-INSTRUCT, JSON-clean only (reasoning models corrupt the
 *  streamed JSON turn; gated ids 404). Env-overridable via NIM_CANDIDATES_TEXT / _VISION (comma list). */
// Quality from the FULL-catalog sweep (tools/nim-bench, 2026-06-21): 121 NIM models → 90 chat-text
// candidates → 36 responded → 27 passed the floor. This pool is EVERY genuinely-good responder (quality ≥
// 0.75 = ≥6/8 on the reasoning battery), so the learner sees the full good-models race — NOT just a frontier.
// Three principled exclusions keep a weak/unstable model from ever reaching a learner: (1) reasoning /
// experimental families that emit <think> and corrupt the streamed JSON turn (gpt-oss*, *-reasoning,
// diffusiongemma); (2) models too slow to serve a text turn — avg > ~7s would only time out the probe
// (qwen3.5-397b ~20s, qwen3.5-122b ~12s, minimax-m3 ~7.3s); (3) the 0.63 tier (5/8 — borderline, not "good"),
// except the two battle-tested fast fallbacks at the end. Full results: .audit-tmp/nim-bench.json.
export const CANDIDATES: { text: Candidate[]; vision: Candidate[] } = {
  text: [
    { id: 'deepseek-ai/deepseek-v4-pro', quality: 1.0 },                // 8/8 · top reasoning (~3.6s)
    { id: 'deepseek-ai/deepseek-v4-flash', quality: 1.0 },              // 8/8 · fast deepseek (~2.3s)
    { id: 'nvidia/nemotron-3-super-120b-a12b', quality: 1.0 },          // 8/8 · large (~5.2s)
    { id: 'mistralai/mistral-nemotron', quality: 0.88 },                // 7/8 · fast (~0.7s)
    { id: 'meta/llama-3.3-70b-instruct', quality: 0.88 },               // 7/8 (~2.1s)
    { id: 'meta/llama-4-maverick-17b-128e-instruct', quality: 0.75 },   // 6/8 · fast (~0.8s)
    { id: 'nvidia/nemotron-3-nano-30b-a3b', quality: 0.75 },            // 6/8 · fastest good (~0.8s)
    { id: 'mistralai/mistral-small-4-119b-2603', quality: 0.75 },       // 6/8 (~1.0s)
    { id: 'abacusai/dracarys-llama-3.1-70b-instruct', quality: 0.75 },  // 6/8 (~1.2s)
    { id: 'qwen/qwen3-next-80b-a3b-instruct', quality: 0.75 },          // 6/8 · proven in prod (~1.4s)
    { id: 'meta/llama-3.1-70b-instruct', quality: 0.75 },               // 6/8 (~4s)
    { id: 'mistralai/ministral-14b-instruct-2512', quality: 0.63 },     // 5/8 · fast fallback (~1.2s)
    { id: 'meta/llama-3.1-8b-instruct', quality: 0.63 },                // 5/8 · fastest fallback (~0.5s)
  ],
  vision: [
    { id: 'meta/llama-3.2-90b-vision-instruct', quality: 1.0, speedMs: 17500 },        // best (6/6) but slow
    { id: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1', quality: 0.83, speedMs: 7000 },    // good + fastest VLM
    { id: 'nvidia/nemotron-nano-12b-v2-vl', quality: 0.83, speedMs: 11700 },
    { id: 'meta/llama-3.2-11b-vision-instruct', quality: 0.67, speedMs: 10100 },
  ],
};

// Quality is a PREREQUISITE GATE, not a co-equal factor: a model must be "good" (precomputed quality ≥
// QUALITY_FLOOR, from tools/nim-bench) to even ENTER the pool. Below-floor models are never probed and never
// served — we never want a weak model in front of a learner, and a smaller pool is cheaper to probe. Among
// the qualified (good) models, the live speed probe decides. Env-tunable via NIM_QUALITY_FLOOR.
export const QUALITY_FLOOR = Number(process.env.NIM_QUALITY_FLOOR ?? 0.6);

// Allow-list of ids the router may serve, per kind (the quality-gated pool). Used to VALIDATE a model id
// that arrives from the client's browser cache before we honor it: the browser is the source of truth for
// WHICH of our good models to use this session, but it must never be able to name a model outside the pool.
const ALLOWED: Record<'text' | 'vision', Set<string>> = {
  text: new Set(CANDIDATES.text.filter((c) => c.quality >= QUALITY_FLOOR).map((c) => c.id)),
  vision: new Set(CANDIDATES.vision.filter((c) => c.quality >= QUALITY_FLOOR).map((c) => c.id)),
};
export function isAllowedModel(kind: 'text' | 'vision', id?: string): boolean {
  return !!id && ALLOWED[kind].has(id);
}

export interface ProbeResult { model: string; ok: boolean; latencyMs: number; quality: number; score: number; }
export interface RouteResult { kind: 'text' | 'vision'; ranked: ProbeResult[]; winner: string; fallback: string; probedAt: number; }

// Thinking OFF for probes (and ideally all turns) — hybrid models otherwise emit <think> that both slows
// the probe and corrupts JSON. Matches the NIM_NO_THINK switch used elsewhere.
const THINK_OFF = process.env.NIM_NO_THINK ? { chat_template_kwargs: { thinking: false } } : {};
// 1×1 transparent PNG — a vision probe must send an image (text-only would 400 on some VL models), but it
// only needs to measure latency/availability, so the smallest possible image keeps the probe fast.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Bounded-concurrency map so a large pool doesn't fire all probes at once and self-429 the free key (which
// would falsely mark good models as ✗ timed out). Cap is env-tunable; default 8. Runs ⌈pool/8⌉ small waves.
const PROBE_CONCURRENCY = Number(process.env.NIM_PROBE_CONCURRENCY ?? 8);
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

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
export async function routeModels(kind: 'text' | 'vision' = 'text', timeoutMs = 8000, exclude: string[] = []): Promise<RouteResult> {
  const fallback = kind === 'text' ? MODELS.text : MODELS.vision;
  const key = process.env.NVIDIA_API_KEY;
  let cands = CANDIDATES[kind].filter((c) => c.quality >= QUALITY_FLOOR); // quality gate — only "good" models
  // On a re-probe AFTER a mid-lesson failure, drop the model that just failed so we don't re-select it. A
  // model can pass the trivial 4-token probe yet fail real ~1000-token turns (partial outage); without this
  // the dead model could win the race again and the retry would hit it. Skip the prune if it empties the pool.
  if (exclude.length) { const pruned = cands.filter((c) => !exclude.includes(c.id)); if (pruned.length) cands = pruned; }

  const probedAt = Date.now();
  if (!key || !cands.length) return { kind, ranked: [], winner: fallback, fallback, probedAt };

  const probes = await mapLimit(cands, PROBE_CONCURRENCY, (c) => probeOne(c.id, key, timeoutMs, kind).then((p) => ({ ...c, ...p })));
  const oks = probes.filter((p) => p.ok);
  // Effective speed for scoring + display. The live probe gates AVAILABILITY (ok/fail), but its latency only
  // means something for text — a vision probe sends a 1×1 image so it returns ~300ms for every model, hiding
  // the real 7–17s per-image cost. So vision scores on the precomputed bench time (speedMs), which is also
  // what we show the learner — a realistic "this is how long image grading takes", not a misleading 300ms.
  const effMs = (p: any) => (kind === 'vision' && typeof p.speedMs === 'number' ? p.speedMs : p.latencyMs);
  // Failed candidates kept for display (the popup shows the full race, incl. ✗ timeouts) — never selected.
  const failedRows: ProbeResult[] = probes.filter((p) => !p.ok).map((p) => ({ model: p.id, ok: false, latencyMs: effMs(p), quality: p.quality, score: 0 }));
  if (!oks.length) return { kind, ranked: failedRows, winner: fallback, fallback, probedAt };

  // Score = wSpeed·speedNorm + (1−wSpeed)·quality; QUALITY-DOMINANT, with sub-threshold speed treated as a
  // tie so a noisy probe delta can't flip the pick between two equally-good models. ≤FAST_FLOOR ms = full
  // speed marks; ≥SLOW_CEIL = 0 (absolute, not min-max over the tiny live set).
  // TEXT: FAST_FLOOR=1000ms — a 4-token probe's sub-second delta is NOISE, so anything under ~1s ties on
  // speed and the higher reasoning score decides; exact ties fall to the curated pool order (deepseek-v4-pro
  // first) via the tiebreak below — the proven model wins, not a 0.2s probe flip. Only a genuinely slow
  // model (>1s) is penalised. VISION: speed is NOT a bottleneck (only the occasional handwriting turn, never
  // the text hot path), so quality dominates (wSpeed 0.15) → we pick the most ACCURATE reader; speed only
  // breaks ties between equal-quality VLMs. Wider vision band (3–25s) since VLM inference is inherently 7–17s.
  const [FAST_FLOOR, SLOW_CEIL] = kind === 'vision' ? [3000, 25000] : [1000, 4000];
  const wSpeed = kind === 'vision' ? 0.15 : 0.5;
  const speedNorm = (ms: number) => Math.max(0, Math.min(1, 1 - (ms - FAST_FLOOR) / (SLOW_CEIL - FAST_FLOOR)));
  // `oks` is in curated CANDIDATES order; carry that rank so exact score ties resolve to our preference
  // (best/proven first) rather than to whichever probe happened to be a few ms faster.
  const okRanked: ProbeResult[] = oks
    .map((p, rank) => { const ms = effMs(p); return { model: p.id, ok: true, latencyMs: ms, quality: p.quality, score: wSpeed * speedNorm(ms) + (1 - wSpeed) * p.quality, rank }; })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map(({ rank, ...r }) => r);
  return { kind, ranked: [...okRanked, ...failedRows], winner: okRanked[0].model, fallback, probedAt };
}

/**
 * NIM model benchmark — measures QUALITY (deterministic pass-rate) + SPEED (latency) for EVERY chat model
 * NIM exposes, so the dynamic router (src/core/nim-router.ts) can be built from real numbers.
 *
 * Models are pulled live from GET /v1/models (so "all available models" stays current). Non-chat ids
 * (embeddings, rerank, vision, audio, image-gen, guard) are excluded by pattern; vision models are bench'd
 * separately by nim-vision-bench.ts. To keep ~90 models tractable: STAGE 1 fast parallel availability probe
 * → STAGE 2 full battery only on the responders. Quality is graded WITHOUT an LLM judge (JSON validity,
 * exact answers, instruction-following, no <think> leakage). Thinking forced OFF. Hits only free NIM.
 *
 * Usage:  tsx tools/nim-bench.ts            # sweep all available chat models
 *         tsx tools/nim-bench.ts --reps 2
 */
import 'dotenv/config';
import axios from 'axios';
import { promises as fs } from 'fs';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const KEY = process.env.NVIDIA_API_KEY!;
const REPS = (() => { const i = process.argv.indexOf('--reps'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : 1; })();
// --models a,b,c : bench EXACTLY these ids (skip the catalog sweep) — used to re-score the current router pool.
const MODELS_ARG = (() => { const i = process.argv.indexOf('--models'); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null; })();
const THINK_OFF = { chat_template_kwargs: { thinking: false } };

// Exclude non-chat / non-text ids: embeddings, rerank, retrieval, guard/safety, audio, image-gen, CLIP,
// parsing, and VISION (vision is bench'd in nim-vision-bench.ts).
const EXCLUDE = /embed|rerank|retriev|guard|safety|nemoguard|ocdr|parakeet|riva|tts|asr|whisper|nvclip|\bclip\b|deplot|parse|reward|sana|stable-?diffusion|flux|consistory|maxine|audio2face|fastpitch|hifigan|bigvgan|-vl\b|vision|vlm|neva|cosmos-reason|paligemma|florence|llava/i;

async function listModels(): Promise<string[]> {
  const r = await axios.get(`${NIM_BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 30000 });
  return (r.data?.data || []).map((d: any) => d.id).filter(Boolean);
}

type Item = { name: string; messages: { role: string; content: string }[]; check: (out: string) => boolean };
const J = (s: string) => { try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const noThink = (s: string) => !/<think>|<\/think>/i.test(s);
// Deterministic numeric/string graders: JSON {"answer": …} equal (tolerant of string-vs-number).
const ans = (x: number) => (o: string) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === x; };
const ansStr = (x: string) => (o: string) => { const j = J(o); return noThink(o) && !!j && String(j.answer).toLowerCase().trim() === x; };
// HARDER battery (2026-06-22): multi-step inference-systems + math reasoning where wrong reasoning yields a
// wrong final NUMBER (so it can't be guessed), plus the structural JSON-turn checks the live app needs. Sized
// + difficulty chosen to DISCRIMINATE frontier models — the old 8-item battery saturated at 8/8, a meaningless
// "100%". All answers verified by hand. Grading stays deterministic (exact value / exact string), no LLM judge.
const BATTERY: Item[] = [
  // — structural: the JSON tutor-turn contract the live app relies on (a model failing these is unusable) —
  { name: 'json-turn', messages: [{ role: 'user', content: 'Return ONLY JSON, no prose: {"message":"hello","readyForGate":false}' }], check: (o) => { const j = J(o); return noThink(o) && !!j && typeof j.message === 'string' && j.readyForGate === false; } },
  { name: 'json-nested', messages: [{ role: 'user', content: 'Return ONLY JSON: {"message":"ok","keyMovesDemonstrated":[{"index":0,"evidence":"x"}],"readyForGate":true}' }], check: (o) => { const j = J(o); return noThink(o) && !!j && Array.isArray(j.keyMovesDemonstrated) && j.keyMovesDemonstrated[0]?.index === 0 && j.readyForGate === true; } },
  { name: 'instruction', messages: [{ role: 'user', content: 'Reply with exactly the single lowercase word: ready — nothing else.' }], check: (o) => noThink(o) && o.trim().toLowerCase().replace(/[^a-z]/g, '') === 'ready' },
  { name: 'strict-number', messages: [{ role: 'user', content: 'Output only the number 42 — no words, no punctuation, no JSON, no quotes.' }], check: (o) => noThink(o) && o.trim() === '42' },
  // — inference-systems quantitative reasoning (multi-step; the actual subject) —
  { name: 'kv-cache-bytes', messages: [{ role: 'user', content: 'A transformer: 32 layers, hidden size 4096, FP16 (2 bytes). The KV cache stores one key vector and one value vector per layer, each of length = hidden size. How many BYTES does one token occupy across all layers? Return ONLY JSON {"answer": <number>}.' }], check: ans(524288) },
  { name: 'matmul-macs', messages: [{ role: 'user', content: 'Multiply a 512×1024 matrix by a 1024×256 matrix. How many multiply-accumulate operations (MACs)? Return ONLY JSON {"answer": <number>}.' }], check: ans(134217728) },
  { name: 'weights-fp16-gb', messages: [{ role: 'user', content: 'A 7-billion-parameter model in FP16 (2 bytes/param). Weight size in GB (1 GB = 1e9 bytes)? Return ONLY JSON {"answer": <number>}.' }], check: ans(14) },
  { name: 'weights-int4-gb', messages: [{ role: 'user', content: 'Same 7-billion-parameter model quantized to 4-bit (0.5 bytes/param). Weight size in GB (1e9 bytes)? Return ONLY JSON {"answer": <number>}.' }], check: ans(3.5) },
  { name: 'decode-latency-ms', messages: [{ role: 'user', content: 'Prefill takes 200 ms; each decoded token takes 20 ms. Total ms to produce a 100-token completion (prefill + 100 decode steps)? Return ONLY JSON {"answer": <number>}.' }], check: ans(2200) },
  { name: 'throughput-tpm', messages: [{ role: 'user', content: 'A server makes 50 tokens/sec per request and serves 8 concurrent requests at that rate. Total tokens per MINUTE across all requests? Return ONLY JSON {"answer": <number>}.' }], check: ans(24000) },
  { name: 'kv-fit-concurrency', messages: [{ role: 'user', content: 'An 80 GB GPU: weights take 14 GB, and the KV cache takes 0.5 GB per concurrent request. Max number of concurrent requests that fit (integer)? Return ONLY JSON {"answer": <number>}.' }], check: ans(132) },
  { name: 'arithmetic-intensity', messages: [{ role: 'user', content: 'A kernel does 1e9 FLOPs and moves 5e8 bytes. Its arithmetic intensity (FLOPs per byte)? Return ONLY JSON {"answer": <number>}.' }], check: ans(2) },
  { name: 'decode-bound', messages: [{ role: 'user', content: 'In LLM inference, which phase is memory-bandwidth bound: prefill or decode? Return ONLY JSON {"answer":"prefill" or "decode"}.' }], check: ansStr('decode') },
  { name: 'cont-batch-finished', messages: [{ role: 'user', content: 'Continuous batching: three requests decode together with 10, 3, and 20 tokens left. After 3 more decode steps, how many have finished? Return ONLY JSON {"answer": <number>}.' }], check: ans(1) },
  // — math multi-step (wrong steps ⇒ wrong final number) —
  { name: 'maths-primepow', messages: [{ role: 'user', content: 'Compute 2^3 × 3^2 × 5. Return ONLY JSON {"answer": <number>}.' }], check: ans(360) },
  { name: 'maths-modpow', messages: [{ role: 'user', content: 'Compute (2^10 − 1) mod 7. Return ONLY JSON {"answer": <number>}.' }], check: ans(1) },
  { name: 'maths-percent', messages: [{ role: 'user', content: 'A model went from 40 tokens/sec to 50 tokens/sec. What percent FASTER is it (integer)? Return ONLY JSON {"answer": <number>}.' }], check: ans(25) },
  { name: 'maths-pythag', messages: [{ role: 'user', content: 'A right triangle has legs 9 and 12. Hypotenuse length? Return ONLY JSON {"answer": <number>}.' }], check: ans(15) },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function callOnce(model: string, messages: any[], timeoutMs: number) {
  const t0 = Date.now();
  const post = (body: any) => axios.post(`${NIM_BASE}/chat/completions`, body, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: timeoutMs });
  try { const r = await post({ model, messages, max_tokens: 200, temperature: 0, ...THINK_OFF }); return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' }; }
  catch (e: any) {
    if (e?.response?.status === 400) { try { const r = await post({ model, messages, max_tokens: 200, temperature: 0 }); return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' }; } catch (e2: any) { return { ok: false, ms: Date.now() - t0, text: '', status: e2?.response?.status ?? 'err' }; } }
    return { ok: false, ms: Date.now() - t0, text: '', status: e?.response?.status ?? 'timeout/err' };
  }
}
async function call(model: string, messages: any[], timeoutMs = 30000, tries = 4) {
  let last: any = { ok: false, ms: 0, text: '', status: 'err' };
  // Patient retry/backoff: free-tier models (esp. slow ones like deepseek) 429 under burst; we must not record
  // that as a wrong answer. 404/401/403 are permanent → don't retry. Longer backoff gives the endpoint room.
  for (let i = 0; i < tries; i++) { last = await callOnce(model, messages, timeoutMs); if (last.ok) return last; if ([404, 401, 403].includes(last.status)) return last; if (i < tries - 1) await sleep(1200 * (i + 1)); }
  return last;
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }));
  return out;
}

async function benchModel(model: string) {
  let correct = 0, responded = 0; const lats: number[] = []; const per: Record<string, 'pass' | 'wrong' | 'noresp'> = {};
  for (const item of BATTERY) {
    let anyOk = false, anyPass = false; const itemLats: number[] = [];
    for (let r = 0; r < REPS; r++) { const res = await call(model, item.messages); if (res.ok) { anyOk = true; itemLats.push(res.ms); if (item.check(res.text)) anyPass = true; } await sleep(500); }
    per[item.name] = anyPass ? 'pass' : anyOk ? 'wrong' : 'noresp';
    if (anyOk) responded++; if (anyPass) correct++;
    if (itemLats.length) lats.push(itemLats.reduce((a, b) => a + b, 0) / itemLats.length);
  }
  // QUALITY = correctness among items the model actually ANSWERED. A 429/timeout (noresp) is an AVAILABILITY
  // gap, not a reasoning failure — and the LIVE speed probe already gates availability — so it must NOT count
  // as a wrong answer (that's what unfairly tanked slow free-tier models). Pacing + retry keeps noresp ~0 so
  // quality is effectively over the full battery; `responded` is reported so any throttling stays visible.
  const quality = responded ? correct / responded : 0;
  return { model, available: responded > 0, quality, correct, responded, total: BATTERY.length, avgMs: Math.round(lats.reduce((a, b) => a + b, 0) / (lats.length || 1)), per };
}

async function main() {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  let all: string[] = [], candidates: string[] = [], live: string[];
  if (MODELS_ARG) {
    live = MODELS_ARG;
    console.log(`Benching ${live.length} specified models (skipping catalog sweep) · reps=${REPS}\n`);
  } else {
    all = await listModels();
    candidates = all.filter((m) => !EXCLUDE.test(m));
    console.log(`Catalog: ${all.length} models · ${candidates.length} chat-text candidates (vision/embed/audio excluded) · reps=${REPS}\n`);
    // STAGE 1 — fast parallel availability probe (short timeout, no retry) over ALL candidates.
    process.stdout.write(`Stage 1 — availability probe of ${candidates.length} models … `);
    live = (await mapLimit(candidates, 12, async (m) => ({ m, r: await callOnce(m, [{ role: 'user', content: 'hi' }], 12000) })))
      .filter((x) => x.r.ok).map((x) => x.m);
    console.log(`${live.length} responded.\n`);
  }

  // STAGE 2 — full battery only on responders.
  const results = [];
  for (const m of live) { process.stdout.write(`  ${m} … `); const r = await benchModel(m); results.push(r); console.log(`q=${(r.quality * 100).toFixed(0)}% (${r.correct}/${r.responded} answered, ${r.total} total)  ${r.avgMs}ms`); }

  results.sort((a, b) => b.quality - a.quality || a.avgMs - b.avgMs);
  console.log('\n=== RANKING (quality, then speed) — top 25 ===');
  console.log('  rank quality   avgMs   model');
  results.slice(0, 25).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}.  ${(r.quality * 100).toFixed(0).padStart(3)}%  ${String(r.avgMs).padStart(6)}   ${r.model}`));
  console.log(`\nbenched ${results.length} live models of ${candidates.length} candidates (${all.length} in catalog).`);
  await fs.mkdir('.audit-tmp', { recursive: true });
  await fs.writeFile('.audit-tmp/nim-bench.json', JSON.stringify({ catalog: all.length, candidates: candidates.length, live: live.length, results }, null, 2));
  console.log('wrote .audit-tmp/nim-bench.json');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

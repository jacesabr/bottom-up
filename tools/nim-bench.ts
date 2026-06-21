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
const BATTERY: Item[] = [
  { name: 'json-turn', messages: [{ role: 'user', content: 'Return ONLY JSON, no prose: {"message":"hello","readyForGate":false}' }], check: (o) => { const j = J(o); return noThink(o) && !!j && typeof j.message === 'string' && j.readyForGate === false; } },
  { name: 'instruction', messages: [{ role: 'user', content: 'Reply with exactly the single lowercase word: ready — nothing else.' }], check: (o) => noThink(o) && o.trim().toLowerCase().replace(/[^a-z]/g, '') === 'ready' },
  { name: 'maths-primepow', messages: [{ role: 'user', content: 'Compute 2^3 × 3^2 × 5. Return ONLY JSON {"answer": <number>}.' }], check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 360; } },
  { name: 'maths-hcf', messages: [{ role: 'user', content: 'What is the HCF of 12 and 18? Return ONLY JSON {"answer": <number>}.' }], check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 6; } },
  { name: 'maths-word', messages: [{ role: 'user', content: 'A kite string makes 30° with the ground; the kite is at height 60 m. Exact string length in metres? Return ONLY JSON {"answer": <number>}.' }], check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 120; } },
  { name: 'ie-decode', messages: [{ role: 'user', content: 'In LLM inference, which phase is memory-bandwidth bound: prefill or decode? Return ONLY JSON {"answer":"prefill" or "decode"}.' }], check: (o) => { const j = J(o); return noThink(o) && !!j && String(j.answer).toLowerCase() === 'decode'; } },
  { name: 'ie-kv', messages: [{ role: 'user', content: 'Does the KV cache memory grow with sequence length (yes/no)? Return ONLY JSON {"answer":"yes" or "no"}.' }], check: (o) => { const j = J(o); return noThink(o) && !!j && String(j.answer).toLowerCase() === 'yes'; } },
  { name: 'json-nested', messages: [{ role: 'user', content: 'Return ONLY JSON: {"message":"ok","keyMovesDemonstrated":[{"index":0,"evidence":"x"}],"readyForGate":true}' }], check: (o) => { const j = J(o); return noThink(o) && !!j && Array.isArray(j.keyMovesDemonstrated) && j.keyMovesDemonstrated[0]?.index === 0 && j.readyForGate === true; } },
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
async function call(model: string, messages: any[], timeoutMs = 30000, tries = 3) {
  let last: any = { ok: false, ms: 0, text: '', status: 'err' };
  for (let i = 0; i < tries; i++) { last = await callOnce(model, messages, timeoutMs); if (last.ok) return last; if ([404, 401, 403].includes(last.status)) return last; if (i < tries - 1) await sleep(700 * (i + 1)); }
  return last;
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }));
  return out;
}

async function benchModel(model: string) {
  let passed = 0; const lats: number[] = []; const per: Record<string, boolean> = {};
  for (const item of BATTERY) {
    let anyPass = false; const itemLats: number[] = [];
    for (let r = 0; r < REPS; r++) { const res = await call(model, item.messages); if (res.ok) { itemLats.push(res.ms); if (item.check(res.text)) anyPass = true; } }
    per[item.name] = anyPass; if (anyPass) passed++;
    if (itemLats.length) lats.push(itemLats.reduce((a, b) => a + b, 0) / itemLats.length);
  }
  return { model, available: true, quality: passed / BATTERY.length, passed, total: BATTERY.length, avgMs: Math.round(lats.reduce((a, b) => a + b, 0) / (lats.length || 1)), per };
}

async function main() {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  const all = await listModels();
  const candidates = all.filter((m) => !EXCLUDE.test(m));
  console.log(`Catalog: ${all.length} models · ${candidates.length} chat-text candidates (vision/embed/audio excluded) · reps=${REPS}\n`);

  // STAGE 1 — fast parallel availability probe (short timeout, no retry) over ALL candidates.
  process.stdout.write(`Stage 1 — availability probe of ${candidates.length} models … `);
  const live = (await mapLimit(candidates, 12, async (m) => ({ m, r: await callOnce(m, [{ role: 'user', content: 'hi' }], 12000) })))
    .filter((x) => x.r.ok).map((x) => x.m);
  console.log(`${live.length} responded.\n`);

  // STAGE 2 — full battery only on responders.
  const results = [];
  for (const m of live) { process.stdout.write(`  ${m} … `); const r = await benchModel(m); results.push(r); console.log(`q=${(r.quality * 100).toFixed(0)}% (${r.passed}/${r.total})  ${r.avgMs}ms`); }

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

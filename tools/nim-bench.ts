/**
 * NIM model benchmark — measures QUALITY (deterministic pass-rate) + SPEED (latency) for each candidate
 * text model, so the dynamic router (src/core/nim-router.ts) can rank on real numbers instead of guesses.
 *
 * Quality is graded WITHOUT an LLM judge: every battery item has a deterministic checker (JSON validity,
 * exact numeric/string answer, instruction-following, no <think> leakage). Score = fraction passed.
 * Thinking is forced OFF (NIM_NO_THINK) — hybrid models otherwise emit <think> that corrupts JSON.
 *
 * Usage:  tsx tools/nim-bench.ts            # all candidates, full battery
 *         tsx tools/nim-bench.ts --reps 2   # average latency over N reps
 * Writes .audit-tmp/nim-bench.json and prints a ranked table.
 */
import 'dotenv/config';
import axios from 'axios';
import { promises as fs } from 'fs';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const KEY = process.env.NVIDIA_API_KEY!;
const REPS = (() => { const i = process.argv.indexOf('--reps'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : 1; })();
const THINK_OFF = { chat_template_kwargs: { thinking: false } }; // tests always run thinking-off

// Candidate text models to rank — the router pool + a few extras to compare. Unavailable ids surface as
// 'unavailable' (404) rather than breaking the run.
const CANDIDATES = [
  'mistralai/ministral-14b-instruct-2512',
  'qwen/qwen3-next-80b-a3b-instruct',
  'deepseek-ai/deepseek-v4-pro',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'mistralai/mistral-small-24b-instruct-2501',
  'qwen/qwen2.5-7b-instruct',
];

type Item = { name: string; messages: { role: string; content: string }[]; check: (out: string) => boolean };
const J = (s: string) => { try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const noThink = (s: string) => !/<think>|<\/think>/i.test(s);

const BATTERY: Item[] = [
  { name: 'json-turn', messages: [{ role: 'user', content: 'Return ONLY JSON, no prose: {"message":"hello","readyForGate":false}' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && typeof j.message === 'string' && j.readyForGate === false; } },
  { name: 'instruction-follow', messages: [{ role: 'user', content: 'Reply with exactly the single lowercase word: ready — nothing else.' }],
    check: (o) => noThink(o) && o.trim().toLowerCase().replace(/[^a-z]/g, '') === 'ready' },
  { name: 'maths-primepow', messages: [{ role: 'user', content: 'Compute 2^3 × 3^2 × 5. Return ONLY JSON {"answer": <number>}.' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 360; } },
  { name: 'maths-hcf', messages: [{ role: 'user', content: 'What is the HCF of 12 and 18? Return ONLY JSON {"answer": <number>}.' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 6; } },
  { name: 'maths-word', messages: [{ role: 'user', content: 'A kite string makes 30° with the ground; the kite is at height 60 m. Exact string length in metres? Return ONLY JSON {"answer": <number>}.' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && Number(j.answer) === 120; } },
  { name: 'ie-decode-bound', messages: [{ role: 'user', content: 'In LLM inference, which phase is memory-bandwidth bound: prefill or decode? Return ONLY JSON {"answer":"prefill" or "decode"}.' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && String(j.answer).toLowerCase() === 'decode'; } },
  { name: 'ie-kv-grows', messages: [{ role: 'user', content: 'Does the KV cache memory grow with sequence length (yes/no)? Return ONLY JSON {"answer":"yes" or "no"}.' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && String(j.answer).toLowerCase() === 'yes'; } },
  { name: 'json-nested', messages: [{ role: 'user', content: 'Return ONLY JSON: {"message":"ok","keyMovesDemonstrated":[{"index":0,"evidence":"x"}],"readyForGate":true}' }],
    check: (o) => { const j = J(o); return noThink(o) && !!j && Array.isArray(j.keyMovesDemonstrated) && j.keyMovesDemonstrated[0]?.index === 0 && j.readyForGate === true; } },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One NIM call. Tries thinking-off; if the model 400s on chat_template_kwargs, retries WITHOUT it so a
 *  param incompatibility isn't mistaken for low quality. Returns the raw result (no cross-call retry). */
async function callOnce(model: string, messages: any[], timeoutMs: number): Promise<{ ok: boolean; ms: number; text: string; status?: number }> {
  const t0 = Date.now();
  const post = (body: any) => axios.post(`${NIM_BASE}/chat/completions`, body,
    { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: timeoutMs });
  try {
    const r = await post({ model, messages, max_tokens: 200, temperature: 0, ...THINK_OFF });
    return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' };
  } catch (e: any) {
    if (e?.response?.status === 400) { // param/template incompatibility → retry plain
      try { const r = await post({ model, messages, max_tokens: 200, temperature: 0 }); return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' }; } catch (e2: any) { return { ok: false, ms: Date.now() - t0, text: '', status: e2?.response?.status ?? 'err' }; }
    }
    return { ok: false, ms: Date.now() - t0, text: '', status: e?.response?.status ?? 'timeout/err' };
  }
}

/** Retry transient failures (timeout/5xx/429/network) so free-tier flakiness doesn't mark a healthy model
 *  unavailable. 404/401/403 are permanent → no retry. Separates AVAILABILITY from QUALITY. */
async function call(model: string, messages: any[], timeoutMs = 30000, tries = 3): Promise<{ ok: boolean; ms: number; text: string; status?: number }> {
  let last: any = { ok: false, ms: 0, text: '', status: 'err' };
  for (let i = 0; i < tries; i++) {
    last = await callOnce(model, messages, timeoutMs);
    if (last.ok) return last;
    if ([404, 401, 403].includes(last.status)) return last; // permanent — don't retry
    if (i < tries - 1) await sleep(800 * (i + 1));
  }
  return last;
}

async function benchModel(model: string) {
  // availability probe
  const probe = await call(model, [{ role: 'user', content: 'hi' }], 25000, 2);
  if (!probe.ok) return { model, available: false, status: probe.status ?? 'timeout/err', quality: 0, passed: 0, total: BATTERY.length, avgMs: 0, perItem: {} as Record<string, boolean> };
  let passed = 0; const lats: number[] = []; const perItem: Record<string, boolean> = {};
  for (const item of BATTERY) {
    let anyPass = false; const itemLats: number[] = [];
    for (let r = 0; r < REPS; r++) {
      const res = await call(model, item.messages);
      if (res.ok) { itemLats.push(res.ms); if (item.check(res.text)) anyPass = true; }
    }
    perItem[item.name] = anyPass; if (anyPass) passed++;
    if (itemLats.length) lats.push(itemLats.reduce((a, b) => a + b, 0) / itemLats.length);
  }
  return { model, available: true, status: 200, quality: passed / BATTERY.length, passed, total: BATTERY.length, avgMs: Math.round(lats.reduce((a, b) => a + b, 0) / (lats.length || 1)), perItem };
}

async function main() {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  console.log(`Benchmarking ${CANDIDATES.length} models · ${BATTERY.length} items · reps=${REPS} · thinking OFF\n`);
  const results = [];
  for (const m of CANDIDATES) { process.stdout.write(`  ${m} … `); const r = await benchModel(m); results.push(r); console.log(r.available ? `q=${(r.quality * 100).toFixed(0)}% (${r.passed}/${r.total})  ${r.avgMs}ms` : `UNAVAILABLE (${r.status})`); }
  const avail = results.filter((r) => r.available);
  // rank: quality desc, then latency asc
  avail.sort((a, b) => b.quality - a.quality || a.avgMs - b.avgMs);
  console.log('\n=== RANKING (quality, then speed) ===');
  console.log('  rank  quality   avgMs   model');
  avail.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}.   ${(r.quality * 100).toFixed(0).padStart(3)}%   ${String(r.avgMs).padStart(6)}   ${r.model}`));
  const unavail = results.filter((r) => !r.available);
  if (unavail.length) console.log('\n  unavailable:', unavail.map((r) => `${r.model} (${r.status})`).join(', '));
  console.log('\n=== per-item pass (available models) ===');
  console.log('  ' + 'model'.padEnd(44) + BATTERY.map((b) => b.name.slice(0, 9).padStart(10)).join(''));
  for (const r of avail) console.log('  ' + r.model.padEnd(44) + BATTERY.map((b) => (r.perItem[b.name] ? '✓' : '✗').padStart(10)).join(''));
  await fs.mkdir('.audit-tmp', { recursive: true });
  await fs.writeFile('.audit-tmp/nim-bench.json', JSON.stringify(results, null, 2));
  console.log('\nwrote .audit-tmp/nim-bench.json');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

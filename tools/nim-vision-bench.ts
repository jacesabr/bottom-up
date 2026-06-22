/**
 * NIM VISION model benchmark — ranks candidate NIM vision models on reading real handwritten math, so the
 * router (src/core/nim-router.ts) can score vision quality on measured numbers instead of a seed.
 *
 * Test set: pages from the public HF dataset `HumynLabs/English-Handwritten-Math-Notes-Dataset`, rasterized
 * to PNG (see tools/fetch-vision-set.mjs). Ground truth was annotated by Opus 4.8 vision (Claude Code) —
 * each item lists tokens that MUST appear in a correct transcription. Score = fraction of items the model
 * reads correctly. The PNGs are watermarked third-party notes → kept LOCAL (.audit-tmp, gitignored), not
 * committed; re-fetch with fetch-vision-set.mjs. Hits only free NIM endpoints (no paid API).
 *
 * Usage:  tsx tools/nim-vision-bench.ts
 */
import 'dotenv/config';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const KEY = process.env.NVIDIA_API_KEY!;
const SET_DIR = '.audit-tmp/vision-set';
// --models a,b : bench EXACTLY these vision ids (skip the live catalog list) — used to re-score the router pool.
const MODELS_ARG = (() => { const i = process.argv.indexOf('--models'); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null; })();

// Vision chat-VLMs (image+text → text) pulled live from the catalog. Excludes CLIP/embeddings/parse/chart
// models, which aren't chat graders. So "all available" vision models get tested, current as NIM changes.
const V_INCLUDE = /-vl\b|vision|neva|cosmos-reason/i;
const V_EXCLUDE = /embed|nvclip|\bclip\b|parse|deplot|retriev|rerank|ocdr/i;
async function listVisionModels(): Promise<string[]> {
  const r = await axios.get(`${NIM_BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 30000 });
  return (r.data?.data || []).map((d: any) => d.id).filter((id: string) => V_INCLUDE.test(id) && !V_EXCLUDE.test(id));
}

// Ground truth (annotated 2026-06-22 by reading each page). `expect`: lowercase tokens that MUST ALL appear
// in a correct reading. HARDER than the old battery (which needed ONE topic word — trivially passed by naming
// the subject): each page now requires MULTIPLE distinct section terms AND/OR specific computed values, so a
// model only passes if it genuinely READ the page rather than guessing the topic. Substring match (lenient on
// spacing/inflection: 'symmetric' ⊂ 'skew-symmetric', 'diagonal' ⊂ 'diagonalizable'). All tokens hand-verified.
const ITEMS = [
  { img: 'img-01.png', topic: 'classification of matrices', expect: ['hermitian', 'symmetric', 'diagonal', 'scalar'] },
  { img: 'img-02.png', topic: 'vector norms of u=(1,2,3,-1): ‖·‖₁=7, ‖·‖₂=√15', expect: ['7', '15'] },
  { img: 'img-03.png', topic: 'function norms + n-dim vector space, orthogonal basis', expect: ['function', 'dimensional', 'orthogonal', 'basis'] },
  { img: 'img-05.png', topic: 'orthogonal/unitary/symmetric + similar matrices', expect: ['orthogonal', 'unitary', 'symmetric', 'similar'] },
  { img: 'img-06.png', topic: 'characteristic & minimal polynomial, diagonalizable', expect: ['characteristic', 'minimal', 'diagonalizable'] },
  { img: 'img-08.png', topic: 'vector space axioms', expect: ['vector space', 'scalar', 'identity', 'inverse'] },
  { img: 'img-09.png', topic: 'polynomial spaces, closure property', expect: ['polynomials', 'degree', 'closure'] },
  { img: 'img-10.png', topic: 'R²(R) abelian group, not a V.S.', expect: ['abelian', 'group', 'vector space'] },
  { img: 'img-11.png', topic: 'matrix/function spaces: symmetric, diagonal, triangular, differentiable', expect: ['symmetric', 'diagonal', 'triangular', 'differentiable'] },
  { img: 'img-12.png', topic: 'subspace definition', expect: ['subspace', 'subset', 'vector space'] },
  { img: 'img-14.png', topic: 'linear combination, trivial / linearly independent', expect: ['subspace', 'combination', 'trivial', 'independent'] },
  { img: 'img-15.png', topic: 'check LI/LD (rank=3), span of S', expect: ['rank', 'span', 'subspace'] },
  { img: 'img-16.png', topic: 'span = smallest subspace containing S', expect: ['subspace', 'smallest', 'containing'] },
];

const PROMPT =
  'This is a photo of handwritten mathematics notes. Transcribe it as accurately as you can — the headings/topics, the definitions, and the key equations, values and results — as plain text. Be precise; do not invent content.';

async function dataUrl(img: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(SET_DIR, img));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function askOnce(model: string, url: string): Promise<{ ok: boolean; ms: number; text: string; status?: any }> {
  const t0 = Date.now();
  try {
    const r = await axios.post(
      `${NIM_BASE}/chat/completions`,
      { model, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url } }] }], max_tokens: 400, temperature: 0 },
      { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 70000 }
    );
    return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, text: '', status: e?.response?.status ?? 'timeout/err' };
  }
}
// Real VLM reads of dense scans are slow (90b ~30s) and the free tier 429s under burst — so retry with
// backoff and a generous 70s timeout, and (in main) never count a no-response as a wrong READING.
async function ask(model: string, url: string, tries = 3): Promise<{ ok: boolean; ms: number; text: string; status?: any }> {
  let last: any = { ok: false, ms: 0, text: '', status: 'err' };
  for (let i = 0; i < tries; i++) { last = await askOnce(model, url); if (last.ok) return last; if ([404, 401, 403].includes(last.status)) return last; if (i < tries - 1) await sleep(2000 * (i + 1)); }
  return last;
}

async function main() {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  const CANDIDATES = MODELS_ARG ?? await listVisionModels();
  const urls: Record<string, string> = {};
  for (const it of ITEMS) { const u = await dataUrl(it.img); if (u) urls[it.img] = u; }
  const present = ITEMS.filter((it) => urls[it.img]);
  console.log(`Vision bench · ${CANDIDATES.length} models · ${present.length} handwritten-math images (GT: Opus 4.8 vision)\n`);
  if (!present.length) { console.error(`No images in ${SET_DIR} — run tools/fetch-vision-set.mjs first.`); process.exit(1); }

  const results = [];
  for (const model of CANDIDATES) {
    process.stdout.write(`  ${model} … `);
    let responded = 0; const recalls: number[] = []; const lats: number[] = []; const per: Record<string, any> = {};
    for (const it of present) {
      const res = await ask(model, urls[it.img]);
      if (res.ok) {
        responded++; lats.push(res.ms);
        const low = res.text.toLowerCase();
        const found = it.expect.filter((t) => low.includes(t.toLowerCase())).length;
        const recall = found / it.expect.length; // PARTIAL CREDIT — fraction of required tokens actually read
        recalls.push(recall);
        per[it.img] = { recall: Number(recall.toFixed(2)), found, of: it.expect.length };
      } else { per[it.img] = { recall: 0, noresp: true }; }
      await sleep(400);
    }
    if (!responded) { console.log(`UNAVAILABLE`); results.push({ model, available: false, quality: 0, responded: 0, total: present.length, avgMs: 0, per }); continue; }
    // QUALITY = mean token-RECALL over the images the model actually ANSWERED (a timeout/429 is availability,
    // gated live — never a reading failure). Partial credit per image → discriminating, not all-or-nothing.
    const quality = recalls.reduce((a, b) => a + b, 0) / recalls.length;
    const avgMs = Math.round(lats.reduce((a, b) => a + b, 0) / (lats.length || 1));
    console.log(`q=${(quality * 100).toFixed(0)}% recall (${responded}/${present.length} answered)  ${avgMs}ms`);
    results.push({ model, available: true, quality, responded, total: present.length, avgMs, per });
  }

  const avail = results.filter((r) => r.available).sort((a, b) => b.quality - a.quality || a.avgMs - b.avgMs);
  console.log('\n=== VISION RANKING (quality, then speed) ===');
  avail.forEach((r, i) => console.log(`  ${i + 1}. ${(r.quality * 100).toFixed(0).padStart(3)}%  ${String(r.avgMs).padStart(6)}ms  ${r.model}`));
  const un = results.filter((r) => !r.available);
  if (un.length) console.log('  unavailable:', un.map((r) => r.model).join(', '));
  console.log('\n=== per-image (available) ===');
  console.log('  ' + 'model'.padEnd(42) + present.map((it) => it.img.replace('img-', '').replace('.png', '')).map((s) => s.padStart(4)).join(''));
  for (const r of avail) console.log('  ' + r.model.padEnd(42) + present.map((it) => { const p = r.per[it.img]; return (p?.noresp ? '—' : String(Math.round((p?.recall ?? 0) * 100))).padStart(4); }).join('') + '  (recall %, — = no response)');
  await fs.writeFile(`${SET_DIR}/bench-results.json`, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${SET_DIR}/bench-results.json`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

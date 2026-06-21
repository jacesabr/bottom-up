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

const CANDIDATES = [
  'nvidia/nemotron-nano-12b-v2-vl',
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'microsoft/phi-3.5-vision-instruct',
  'qwen/qwen2.5-vl-72b-instruct',
];

// Ground truth (Opus 4.8 vision annotation). `expect`: lowercase tokens that MUST all appear in a correct
// reading of the page. Chosen to be unambiguous (headings + distinctive values), tolerant of OCR spacing.
const ITEMS = [
  { img: 'img-01.png', topic: 'Hermitian matrices', expect: ['hermitian'] },
  { img: 'img-02.png', topic: 'vector norms of u=(1,2,3,-1)', expect: ['7', '15'] }, // ‖u‖₁=7, ‖u‖₂=√15
  { img: 'img-03.png', topic: 'n-dimensional vector space / norms', expect: ['dimension'] },
  { img: 'img-05.png', topic: 'orthogonal & unitary matrices', expect: ['orthogonal'] },
  { img: 'img-06.png', topic: 'characteristic polynomial / eigenvalues 2,3', expect: ['characteristic'] },
  { img: 'img-08.png', topic: 'vector space axioms', expect: ['vector space'] },
];

const PROMPT =
  'This is a photo of handwritten mathematics notes. Transcribe what you see: the main heading/topic and the key equations or results, as plain text. Be accurate and concise.';

async function dataUrl(img: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(SET_DIR, img));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function ask(model: string, url: string): Promise<{ ok: boolean; ms: number; text: string; status?: any }> {
  const t0 = Date.now();
  try {
    const r = await axios.post(
      `${NIM_BASE}/chat/completions`,
      { model, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url } }] }], max_tokens: 400, temperature: 0 },
      { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 40000 }
    );
    return { ok: true, ms: Date.now() - t0, text: r.data?.choices?.[0]?.message?.content ?? '' };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, text: '', status: e?.response?.status ?? 'timeout/err' };
  }
}

async function main() {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  const urls: Record<string, string> = {};
  for (const it of ITEMS) { const u = await dataUrl(it.img); if (u) urls[it.img] = u; }
  const present = ITEMS.filter((it) => urls[it.img]);
  console.log(`Vision bench · ${CANDIDATES.length} models · ${present.length} handwritten-math images (GT: Opus 4.8 vision)\n`);
  if (!present.length) { console.error(`No images in ${SET_DIR} — run tools/fetch-vision-set.mjs first.`); process.exit(1); }

  const results = [];
  for (const model of CANDIDATES) {
    process.stdout.write(`  ${model} … `);
    let passed = 0; const lats: number[] = []; const per: Record<string, boolean> = {}; let anyOk = false;
    for (const it of present) {
      const res = await ask(model, urls[it.img]);
      if (res.ok) { anyOk = true; lats.push(res.ms); const low = res.text.toLowerCase(); const ok = it.expect.every((t) => low.includes(t)); per[it.img] = ok; if (ok) passed++; }
      else per[it.img] = false;
    }
    if (!anyOk) { console.log(`UNAVAILABLE`); results.push({ model, available: false, quality: 0, passed: 0, total: present.length, avgMs: 0, per }); continue; }
    const quality = passed / present.length, avgMs = Math.round(lats.reduce((a, b) => a + b, 0) / (lats.length || 1));
    console.log(`q=${(quality * 100).toFixed(0)}% (${passed}/${present.length})  ${avgMs}ms`);
    results.push({ model, available: true, quality, passed, total: present.length, avgMs, per });
  }

  const avail = results.filter((r) => r.available).sort((a, b) => b.quality - a.quality || a.avgMs - b.avgMs);
  console.log('\n=== VISION RANKING (quality, then speed) ===');
  avail.forEach((r, i) => console.log(`  ${i + 1}. ${(r.quality * 100).toFixed(0).padStart(3)}%  ${String(r.avgMs).padStart(6)}ms  ${r.model}`));
  const un = results.filter((r) => !r.available);
  if (un.length) console.log('  unavailable:', un.map((r) => r.model).join(', '));
  console.log('\n=== per-image (available) ===');
  console.log('  ' + 'model'.padEnd(42) + present.map((it) => it.img.replace('img-', '').replace('.png', '')).map((s) => s.padStart(4)).join(''));
  for (const r of avail) console.log('  ' + r.model.padEnd(42) + present.map((it) => (r.per[it.img] ? '✓' : '✗').padStart(4)).join(''));
  await fs.writeFile(`${SET_DIR}/bench-results.json`, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${SET_DIR}/bench-results.json`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

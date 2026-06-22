/**
 * Fetch the handwritten-math VISION test set for tools/nim-vision-bench.ts.
 * Source: public HF dataset `HumynLabs/English-Handwritten-Math-Notes-Dataset` (scanned PDFs); we pull the
 * first N rows, rasterize page 1 of each to PNG (needs `pdftoppm`), and drop them in .audit-tmp/vision-set/.
 * The pages are watermarked third-party notes → kept LOCAL (gitignored), NOT committed. Ground-truth
 * annotations live in nim-vision-bench.ts (annotated by Opus 4.8 vision). Re-run anytime to refresh the set.
 *
 * Usage:  node tools/fetch-vision-set.mjs
 */
import fs from 'fs';
import { execSync } from 'child_process';

const DS = 'HumynLabs/English-Handwritten-Math-Notes-Dataset';
const DIR = '.audit-tmp/vision-set';
const N = Number(process.argv[2]) || 16; // harder bench wants more pages to discriminate; override: node fetch-vision-set.mjs 20

fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) if (/^img-\d+\.png$/.test(f) || /^_/.test(f)) fs.unlinkSync(`${DIR}/${f}`);

const r = await (await fetch(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DS)}&config=default&split=train&offset=0&length=${N + 6}`)).json();
let n = 0;
const manifest = [];
for (const wrap of (r.rows || [])) {
  if (n >= N) break;
  const src = wrap.row?.pdf?.src;
  if (!src) continue;
  try {
    fs.writeFileSync(`${DIR}/_tmp.pdf`, Buffer.from(await (await fetch(src)).arrayBuffer()));
    execSync(`pdftoppm -png -r 150 -f 1 -l 1 "${DIR}/_tmp.pdf" "${DIR}/_pg"`, { stdio: 'ignore' });
    const made = fs.readdirSync(DIR).filter((f) => f.startsWith('_pg') && f.endsWith('.png'));
    if (!made.length) continue;
    const name = `img-${String(++n).padStart(2, '0')}.png`;
    fs.renameSync(`${DIR}/${made[0]}`, `${DIR}/${name}`);
    made.slice(1).forEach((f) => fs.unlinkSync(`${DIR}/${f}`));
    manifest.push({ name, source: `HF:${DS}`, rowIndex: wrap.row_idx });
    console.log(`  ${name}  ${Math.round(fs.statSync(`${DIR}/${name}`).size / 1024)}KB`);
  } catch (e) { console.log('  skip:', e.message.slice(0, 50)); }
}
try { fs.unlinkSync(`${DIR}/_tmp.pdf`); } catch {}
fs.writeFileSync(`${DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`\nfetched ${n} pages → ${DIR}/ (gitignored). Now: tsx tools/nim-vision-bench.ts`);

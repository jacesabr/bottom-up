/**
 * Regenerate docs/corpus_gap.md from the bu_corpus_gap table — the persistent, summarized list of places
 * where the tutor couldn't answer from our content. Review occasionally to decide what to research + add.
 *
 *   tsx tools/export-corpus-gaps.ts            # write docs/corpus_gap.md
 *   tsx tools/export-corpus-gaps.ts --open     # also print to stdout
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../src/db/index.js';
import { buCorpusGap, concepts as conceptsTable } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const gaps = await db.select().from(buCorpusGap);
  const conceptRows = await db.select().from(conceptsTable);
  const titleOf = new Map(conceptRows.map((c) => [c.id, c.title]));

  // Group by concept, collapse identical "missing" phrases with a count.
  const byConcept = new Map<string, Map<string, { count: number; resolved: boolean; questions: Set<string> }>>();
  for (const g of gaps) {
    const m = byConcept.get(g.conceptId) ?? new Map();
    const key = (g.missing || '').trim().toLowerCase();
    const entry = m.get(key) ?? { count: 0, resolved: g.resolved ?? false, questions: new Set<string>() };
    entry.count += 1;
    entry.resolved = entry.resolved && (g.resolved ?? false);
    if (g.question) entry.questions.add(g.question);
    m.set(key, entry);
    byConcept.set(g.conceptId, m);
  }

  const totalConcepts = byConcept.size;
  const totalGaps = gaps.length;
  const lines: string[] = [];
  lines.push('# Corpus gaps — content the tutor could not answer from our material');
  lines.push('');
  lines.push(
    `> Auto-generated from \`bu_corpus_gap\` by \`tools/export-corpus-gaps.ts\`. ${totalGaps} flag(s) across ${totalConcepts} concept(s).`
  );
  lines.push('> Review occasionally: for each item decide whether to research + add material to that concept, then mark it resolved.');
  lines.push('');

  if (!totalGaps) {
    lines.push('_No gaps recorded yet._');
  }

  for (const [conceptId, m] of byConcept) {
    lines.push(`## ${titleOf.get(conceptId) ?? conceptId}`);
    lines.push(`\`${conceptId}\``);
    lines.push('');
    const sorted = [...m.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [missing, info] of sorted) {
      const tick = info.resolved ? 'x' : ' ';
      lines.push(`- [${tick}] **${missing}** _(seen ${info.count}×)_`);
      for (const q of [...info.questions].slice(0, 3)) {
        lines.push(`    - asked: “${q}”`);
      }
    }
    lines.push('');
  }

  const out = lines.join('\n');
  const file = path.join(process.cwd(), 'docs', 'corpus_gap.md');
  await fs.writeFile(file, out, 'utf8');
  console.log(`Wrote ${file} (${totalGaps} gaps, ${totalConcepts} concepts).`);
  if (process.argv.includes('--open')) console.log('\n' + out);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

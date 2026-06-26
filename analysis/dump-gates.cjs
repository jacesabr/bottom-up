/* One-off: export authored gates per exam to analysis/data/gates-<exam>.json so the per-paper
 * coverage analysis can judge whether a node's practice questions are hard enough — without
 * routing thousands of rows through the model's context. Reads DATABASE_URL from .env. */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// minimal .env parse (no dotenv dependency assumption)
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const EXAMS = {
  cbse10: 'cbse10:maths:%',
  cbse12: 'cbse12:mathematics:%',
  jee: 'jee:maths:%',
};

(async () => {
  for (const [ex, pat] of Object.entries(EXAMS)) {
    const { rows } = await pool.query(
      `SELECT concept_id, slot, ord, answer_type, grader, tier, prompt, ideal_answer
         FROM gates
        WHERE kind='authored' AND concept_id LIKE $1
        ORDER BY concept_id, ord`,
      [pat]
    );
    const byConcept = {};
    for (const r of rows) (byConcept[r.concept_id] = byConcept[r.concept_id] || []).push({
      slot: r.slot, type: r.answer_type, grader: r.grader, tier: r.tier,
      prompt: r.prompt, ideal: r.ideal_answer,
    });
    fs.writeFileSync(path.join(__dirname, 'data', `gates-${ex}.json`), JSON.stringify(byConcept));
    console.log(`${ex}: ${rows.length} gates across ${Object.keys(byConcept).length} concepts`);
  }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });

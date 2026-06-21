/**
 * SYSTEM AUDIT — a read-only health + quality report over the LIVE database. Run it (or ask Claude Code to)
 * whenever you want to see how the running system is doing and where the problems are. It NEVER writes.
 *
 *   node tools/audit-system.mjs            # last 7 days
 *   node tools/audit-system.mjs --days 1   # window override
 *
 * Sections: LLM health (incl. the dynamic NIM router's recorded probe races), tutor/gate quality, errors,
 * corpus gaps, engagement, and a flagged-issues summary. See docs/SYSTEM_AUDIT.md for how to read it.
 * Every section is independently try/caught so a missing table/column never blanks the whole report.
 */
import fs from 'fs';
import pg from 'pg';

const url = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('No DATABASE_URL in .env'); process.exit(1); }
const DAYS = (() => { const i = process.argv.indexOf('--days'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : 7; })();
const c = new pg.Client({ connectionString: url });
const since = `now() - interval '${DAYS} days'`;
const q = async (sql, params = []) => (await c.query(sql, params)).rows;
const section = async (title, fn) => { console.log(`\n${'='.repeat(64)}\n${title}\n${'='.repeat(64)}`); try { await fn(); } catch (e) { console.log('  (skipped:', e.message.slice(0, 80) + ')'); } };
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

await c.connect();
console.log(`\nSYSTEM AUDIT · window: last ${DAYS} day(s) · ${url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1***@').split('@')[1]?.split('/')[0]}`);

await section('1 · LLM HEALTH — calls by model (last ' + DAYS + 'd)', async () => {
  const rows = await q(`select model, count(*) n, count(*) filter (where error is not null) errs, round(avg(ms)) avg_ms,
    round(avg(ms) filter (where error is null)) ok_ms from bu_llm_call where ts > ${since} group by model order by n desc`);
  if (!rows.length) return console.log('  no calls in window.');
  console.log('  calls  err%   avg_ms  ok_ms  model');
  for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${String(pct(r.errs, r.n)).padStart(3)}%  ${String(r.avg_ms ?? '–').padStart(6)}  ${String(r.ok_ms ?? '–').padStart(5)}  ${r.model}`);
  const tot = rows.reduce((s, r) => s + Number(r.n), 0), err = rows.reduce((s, r) => s + Number(r.errs), 0);
  console.log(`  ── total ${tot} calls, ${pct(err, tot)}% errored`);
});

await section('2 · NIM ROUTER — recorded probe races (which endpoints win / are reliable)', async () => {
  const wins = await q(`select payload->>'kind' kind, payload->>'winner' winner, count(*) n
    from bu_event where type='route_probe' and ts > ${since} group by 1,2 order by 1, n desc`);
  if (!wins.length) return console.log('  no route_probe events yet (none recorded in window).');
  console.log('  winners chosen per session:');
  for (const r of wins) console.log(`    [${r.kind}] ${String(r.n).padStart(4)}×  ${(r.winner || '').split('/').pop()}`);
  const avail = await q(`select e->>'model' model, count(*) probes,
      count(*) filter (where (e->>'ok')::boolean) up, round(avg((e->>'latencyMs')::numeric) filter (where (e->>'ok')::boolean)) avg_ms
    from bu_event, jsonb_array_elements(payload->'ranked') e
    where type='route_probe' and ts > ${since} group by 1 order by probes desc`);
  if (avail.length) { console.log('\n  per-endpoint availability + speed (across probes):');
    console.log('    probed  up%   avg_ms  model');
    for (const r of avail) console.log(`    ${String(r.probes).padStart(6)}  ${String(pct(r.up, r.probes)).padStart(3)}%  ${String(r.avg_ms ?? '–').padStart(6)}  ${(r.model || '').split('/').pop()}`); }
});

await section('3 · TUTOR/GATE QUALITY — worst-passing concepts (≥3 attempts)', async () => {
  const rows = await q(`select concept_id, count(*) n, sum(case when correct then 1 else 0 end) pass
    from bu_gate_attempt where ts > ${since} group by concept_id having count(*) >= 3 order by (sum(case when correct then 1 else 0 end)::float/count(*)) asc limit 15`);
  if (!rows.length) return console.log('  no gate attempts in window.');
  console.log('  pass%  n   concept (lowest pass-rate first — possible hard/broken gates)');
  for (const r of rows) console.log(`  ${String(pct(r.pass, r.n)).padStart(4)}%  ${String(r.n).padStart(2)}  ${r.concept_id.split(':').slice(-1)[0]}`);
});

await section('4 · ERRORS — recent failed model calls (what users saw "unavailable" for)', async () => {
  const rows = await q(`select to_char(ts,'MM-DD HH24:MI') t, provider, model, purpose, left(error, 70) error
    from bu_llm_call where error is not null and ts > ${since} order by ts desc limit 12`);
  if (!rows.length) return console.log('  no errors in window. ✓');
  for (const r of rows) console.log(`  [${r.t}] ${r.provider}/${(r.model || '').split('/').pop()} ${r.purpose || ''} — ${r.error}`);
});

await section('5 · CORPUS GAPS — content the tutor was asked for but lacked', async () => {
  const rows = await q(`select left(coalesce(missing, question), 80) gap, count(*) n from bu_corpus_gap where ts > ${since} group by 1 order by n desc limit 12`);
  if (!rows.length) return console.log('  none logged in window. ✓');
  for (const r of rows) console.log(`  ${String(r.n).padStart(3)}×  ${r.gap}`);
});

await section('6 · ENGAGEMENT', async () => {
  const [a] = await q(`select count(distinct learner_id) learners from bu_event where ts > ${since}`);
  const np = await q(`select status, count(*) n from bu_node_performance group by status order by n desc`);
  console.log(`  active learners (window): ${a?.learners ?? 0}`);
  console.log('  node performance (all-time):'); for (const r of np) console.log(`    ${String(r.n).padStart(5)}  ${r.status}`);
});

await section('7 · FLAGGED ISSUES (act on these)', async () => {
  const zero = await q(`select concept_id, count(*) n from bu_gate_attempt where ts > ${since} group by concept_id having count(*)>=4 and sum(case when correct then 1 else 0 end)=0 limit 10`);
  if (zero.length) { console.log('  ⚠ gates with 0% pass (≥4 attempts) — likely broken/mis-scoped:'); for (const r of zero) console.log(`    ${r.concept_id.split(':').slice(-1)[0]} (${r.n} fails)`); }
  const badModels = await q(`select model, count(*) errs from bu_llm_call where error is not null and ts > ${since} group by model having count(*)>=3 order by errs desc limit 5`);
  if (badModels.length) { console.log('  ⚠ models erroring repeatedly:'); for (const r of badModels) console.log(`    ${(r.model || '').split('/').pop()} — ${r.errs} errors`); }
  if (!zero.length && !badModels.length) console.log('  none flagged. ✓');
});

console.log('\nDone. (read-only — nothing was written.)');
await c.end();
process.exit(0);

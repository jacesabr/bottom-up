/**
 * NIM model study — Haiku (production) vs candidate NVIDIA NIM models.
 *
 * WHY: students currently run on Claude Haiku. The future plan is to self-host a model on our own
 * GPU (an NVIDIA NIM model) once traffic justifies it. Before that switch we need study data: which
 * free NIM model is strongest, where each is weak/strong, json reliability, latency — judged against
 * the REAL prompts our students actually hit.
 *
 * HOW IT RESPECTS THE COST RULE: it NEVER calls a paid API. The Haiku baseline is the response we
 * ALREADY captured during real usage (bu_llm_call, provider='claude'). This harness only calls the
 * FREE NVIDIA NIM endpoints to get the candidate responses for the same prompt. Run it manually from
 * Claude Code — it is not wired into the app and never runs automatically.
 *
 * RUN:  node tools/nim-study.mjs               (uses captured real prompts; falls back to built-in
 *                                               scenarios if none captured yet)
 *       node tools/nim-study.mjs --limit 8     (cap how many captured prompts to replay)
 *       NIM_STUDY_MODELS="meta/llama-3.3-70b-instruct,openai/gpt-oss-120b" node tools/nim-study.mjs
 *
 * OUTPUT: tools/nim-study/results.json  (raw)
 *         tools/nim-study/report.html   (open this to inspect — Haiku vs each NIM, side by side)
 * Then Claude Code reads report.html and writes the verdict into docs/NIM_STUDY.md.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'nim-study');
const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const KEY = process.env.NVIDIA_API_KEY;

// Candidate NIM models to compare. Edit freely (or pass NIM_STUDY_MODELS=a,b,c). Availability on the
// free tier drifts over time — a model that 404s is recorded as an error row, not a crash.
const MODELS = (process.env.NIM_STUDY_MODELS
  ? process.env.NIM_STUDY_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
  : [
      'meta/llama-3.3-70b-instruct', // current default (the one teach-loop falls back to)
      'openai/gpt-oss-120b',
      'qwen/qwen2.5-72b-instruct',
      'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    ]);

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) || 6 : 6;

// Built-in scenarios — used only when no real prompts are captured yet (mirrors socratic's seed set).
const SCENARIO_SYSTEM = `You are a warm, sharp tutor teaching ONE maths concept. Rules:
- Natural conversation, SHORT turns (1-3 sentences). Ask a guiding question; never lecture or dump.
- Stay with the specific example; do not invent new numbers.
- If the learner gives a complete, correct demonstration, acknowledge briefly and signal "mastered".
- If they stall, give exactly ONE conceptual nudge with signal "continue".
- Do NOT state the answer. Return ONLY JSON: {"tutorText": string, "signal": "continue"|"mastered"|"gap"}`;
const SCENARIOS = [
  { system: SCENARIO_SYSTEM, user: 'For x^2 - 5x + 6 = 0 I think x = 5 and x = 6 because those are the numbers.', expect: 'continue (nudge, no answer)' },
  { system: SCENARIO_SYSTEM, user: "Honestly I don't know how to factorise a trinomial at all.", expect: 'gap' },
  { system: SCENARIO_SYSTEM, user: 'I factor it as (x-2)(x-3)=0, so by the zero product property x=2 or x=3.', expect: 'mastered' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looseJson(txt) {
  const c = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = c.indexOf('{');
  const e = c.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(c.slice(s, e + 1)); } catch { /* fall through */ }
  }
  return null;
}
function parseSignal(txt) {
  const j = looseJson(txt);
  if (j && typeof j.signal === 'string') return j.signal;
  const m = txt.match(/"signal"\s*:\s*"(\w+)"/);
  return m ? m[1] : '?';
}

async function callNim(model, messages) {
  const t0 = Date.now();
  const res = await axios.post(
    `${NIM_BASE}/chat/completions`,
    { model, messages, temperature: 0.4, max_tokens: 1500 },
    { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 90_000 }
  );
  const content = (res.data?.choices?.[0]?.message?.content || '').trim();
  return { content, ms: Date.now() - t0, usage: res.data?.usage };
}

// Convert a stored bu_llm_call.messages array (our ChatMessage[]) into OpenAI-style messages.
function toOpenAiMessages(messages) {
  if (!Array.isArray(messages)) return null;
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
}

async function loadPrompts() {
  if (!process.env.DATABASE_URL) return { source: 'scenarios', items: SCENARIOS.map((s, i) => ({
    id: `scenario-${i + 1}`, expect: s.expect, baselineModel: null, baseline: null,
    messages: [{ role: 'system', content: s.system }, { role: 'user', content: s.user }],
  })) };

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id, model, messages, response, ms FROM bu_llm_call
       WHERE provider='claude' AND purpose='tutor' AND ok=true AND response IS NOT NULL
       ORDER BY ts DESC LIMIT $1`,
      [LIMIT]
    );
    if (rows.length) {
      return {
        source: 'captured',
        items: rows.map((r) => ({
          id: r.id, expect: null, baselineModel: r.model, baseline: r.response, baselineMs: r.ms,
          messages: r.messages,
        })),
      };
    }
  } finally {
    await pool.end();
  }
  // No captured prompts yet — fall back to the seed scenarios so the harness is runnable immediately.
  return { source: 'scenarios', items: SCENARIOS.map((s, i) => ({
    id: `scenario-${i + 1}`, expect: s.expect, baselineModel: null, baseline: null,
    messages: [{ role: 'system', content: s.system }, { role: 'user', content: s.user }],
  })) };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderHtml(study) {
  const modelCols = study.models;
  const rows = study.items.map((it) => {
    const userMsg = (it.messages || []).filter((m) => m.role !== 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    const baselineCell = it.baseline
      ? `<div class="resp"><div class="meta">Haiku · ${esc(it.baselineModel)} · ${it.baselineMs ?? '?'}ms · signal=<code>${esc(parseSignal(it.baseline))}</code></div><pre>${esc(it.baseline)}</pre></div>`
      : `<div class="resp muted">${it.expect ? `expected: <b>${esc(it.expect)}</b> (seed scenario — no captured Haiku baseline)` : 'no baseline'}</div>`;
    const cells = modelCols.map((m) => {
      const r = it.results[m];
      if (!r) return '<td class="resp muted">—</td>';
      if (r.error) return `<td class="resp err"><div class="meta">ERROR</div><pre>${esc(r.error)}</pre></td>`;
      const json = r.validJson ? 'OK' : 'BAD-JSON';
      return `<td class="resp"><div class="meta">${r.ms}ms · signal=<code>${esc(r.signal)}</code> · json=${json}</div><pre>${esc(r.content)}</pre></td>`;
    }).join('');
    return `<tr><td class="prompt"><div class="meta">${esc(it.id)}</div><pre>${esc(userMsg)}</pre>${baselineCell}</td>${cells}</tr>`;
  }).join('\n');

  const head = ['<th>Prompt + Haiku baseline</th>', ...modelCols.map((m) => `<th>${esc(m)}</th>`)].join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>NIM study — ${esc(study.generatedAt)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;margin:24px;color:#1c1b19;background:#fbfaf8}
 h1{font-size:1.3rem} .sub{color:#6b6a66;margin-bottom:18px}
 table{border-collapse:collapse;width:100%;table-layout:fixed}
 th,td{border:1px solid #e7e4df;vertical-align:top;padding:8px;text-align:left;width:1%}
 th{background:#f3efe9;position:sticky;top:0}
 .prompt{background:#faf7f2}
 .meta{font-size:11px;color:#6b6a66;margin-bottom:4px}
 pre{white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,monospace;margin:0 0 8px;max-height:320px;overflow:auto}
 code{background:#eee;padding:1px 4px;border-radius:3px}
 .err pre{color:#a23028} .muted{color:#9b968d}
 .resp{border-top:1px dashed #e7e4df;padding-top:6px;margin-top:6px}
</style></head><body>
<h1>NIM model study — Haiku vs candidate NVIDIA NIM models</h1>
<div class="sub">Generated ${esc(study.generatedAt)} · prompt source: <b>${esc(study.source)}</b> · ${study.items.length} prompts · ${modelCols.length} candidate models.
Haiku column = the response captured in production (no re-call). Candidate columns = fresh free-NIM calls. Inspect, then write the verdict in docs/NIM_STUDY.md.</div>
<table><thead><tr>${head}</tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}

async function main() {
  if (!KEY) {
    console.error('NVIDIA_API_KEY missing in .env — cannot call NIM endpoints. Aborting.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { source, items } = await loadPrompts();
  console.log(`Prompt source: ${source} · ${items.length} prompts · models: ${MODELS.join(', ')}`);

  for (const it of items) {
    it.results = {};
    const oaMessages = toOpenAiMessages(it.messages);
    for (const model of MODELS) {
      process.stdout.write(`  ${it.id} → ${model} ... `);
      try {
        const { content, ms, usage } = await callNim(model, oaMessages);
        it.results[model] = { content, ms, usage, signal: parseSignal(content), validJson: !!looseJson(content) };
        console.log(`${ms}ms signal=${it.results[model].signal} json=${it.results[model].validJson ? 'OK' : 'BAD'}`);
      } catch (e) {
        const msg = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : String(e?.message ?? e).slice(0, 200);
        it.results[model] = { error: msg };
        console.log(`ERROR: ${msg.slice(0, 80)}`);
      }
      await sleep(2500); // space calls: mimic real pacing, dodge the free-tier ~40 rpm throttle
    }
  }

  const study = { generatedAt: new Date().toISOString(), source, models: MODELS, items };
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(study, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'report.html'), renderHtml(study));
  console.log(`\nWrote tools/nim-study/results.json and tools/nim-study/report.html`);
  console.log('Open report.html to inspect, then record the verdict in docs/NIM_STUDY.md.');
}

main().catch((e) => { console.error(e); process.exit(1); });

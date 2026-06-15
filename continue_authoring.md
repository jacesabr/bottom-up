# continue_authoring.md — handoff for the next chat window

Working state as of 2026-06-15. This is a **standalone, working, deployed** product. Read
`README.md` → `bottom_up.md` → `change_log.md` for the original spec; this file is the
"where we are / what's next" for continuing the gate-authoring work.

---

## Live now (verified)

- **App (frontend):** https://bottom-up-web.onrender.com
- **API:** https://bottom-up-api.onrender.com  (`/health` → `{"status":"ok"}`)
- **Repo:** https://github.com/jacesabr/bottom-up  (branch `master`)
- Free Render tier → the API **sleeps after ~15 min idle**; first hit wakes it (~30–50s).

Flow that works end-to-end: **Exam (CBSE 10) → Subject (Maths) → 14-chapter map →
in-chapter node map → teaching chat → in-chat gate checks → pass unlocks dependents.**

---

## Services & credentials (all in `.env`, NOT committed)

| Thing | Value / location |
|---|---|
| **Neon DB** | project `fragrant-fire-62588797`, db `neondb`. `DATABASE_URL` in `.env`. |
| **Render** | workspace **jae** (`tea-d8e1tae8bjmc73am2g10`, key `RENDER_API_KEY`). API svc `srv-d8nuodbeo5us738ehh9g`, web svc `srv-d8nuom4m0tmc73ehufd0`. Repo webhook is NOT connected → **deploys must be triggered manually** via REST (`POST /v1/services/{id}/deploys`). |
| **NVIDIA NIM** | free, `NVIDIA_API_KEY`. Teaching model `meta/llama-3.3-70b-instruct`; vision `nvidia/nemotron-nano-12b-v2-vl`. |
| **Firecrawl** | `FIRECRAWL_API_KEY` (from socratic) — web research for gate authoring. |
| **Claude** | `ANTHROPIC_API_KEY`. **Use Haiku for bulk authoring** (cheap). Opus only for human-in-the-loop verification. |

### Model cost policy (HARD RULE — keep it)
- Real users → Claude **Haiku** (`LLM_PROVIDER=claude` in prod env).
- All testing / live teaching dev → **NVIDIA NIM** (free) — current prod is `LLM_PROVIDER=nvidia`.
- Gate authoring → **Claude Haiku** via `claudeAuthor()` in `src/core/llm.ts`.
- Never run a test suite on Haiku.

---

## Architecture (key files)

```
src/
  db/schema.ts        Drizzle: concepts, gates (+ slot/ord/ideal_answer/why/rubric/source),
                      bu_event (append-only TRUTH), bu_node_performance / _checklist / _gate_attempt
  db/index.ts         pg pool + initializeDatabase() (loads the seed slice on boot)
  core/
    llm.ts            ModelRouter: resolveProvider(), completeJson() (NIM/Claude), nimVision(),
                      claudeAuthor() (Haiku), parseLooseJson()
    node-agent.ts     teachTurn() (warm Socratic, checklist delta in same JSON);
                      gradeWritten() rubric, gradeSketch() vision, gradeEquation() LLM-equivalence
    teach-loop.ts     enterNode/respond (dialogue reconstructed from bu_event),
                      poseGate()/answerGate() = MULTI-GATE sequence, getNodeDetail()
    sequencer.ts      bottom-up availability (locked/available/passed)
  api/routes.ts       REST endpoints; api/index.ts boots + serves
  web/                React: ExamSelect→SubjectSelect→ChapterList→ChapterMap→NodeView
                      NodeView = Tutor shell (chat | scratchpad), KaTeX MathText, EquationComposer,
                      NodeDetails (tutor's notes + content + progress + gate + pain points)
tools/
  load-content.ts     loads all 14 chapters from content/cbse10/maths into the DB
  generate-gates.ts   THE GATE AUTHORING PIPELINE (Firecrawl research + Haiku author)
content/cbse10/maths  all 14 chapters' content.json/exam.json (271 nodes) — the corpus
content/cbse10/textbooks (gitignored, local only) — the source PDFs
```

---

## Gate authoring — state & how to continue

**Goal (user's spec):** ≥5 gates per concept — **2 sketch (draw), 1 explain (long-form),
1 MCQ, 1 hard equation** — with leeway to skip slots that don't fit. Web-researched,
professional quality, storing **ideal answer + why + rubric + source**.

**Done:** **Chapter 1 (`jemh101`, Real Numbers) — 73 gates across 17 concepts**, authored by
Haiku + Firecrawl, verified quality. The author correctly **skips sketch slots** for purely
algebraic/proof concepts (irrationality proofs etc.) with recorded reasons.

**Remaining: chapters 2–14 (jemh102…jemh114).** Run:

```bash
# one chapter at a time (idempotent; ~2–4 min each, costs Haiku + Firecrawl)
node_modules/.bin/tsx tools/generate-gates.ts cbse10:maths:jemh102
# ... through jemh114
# or a single concept:
node_modules/.bin/tsx tools/generate-gates.ts cbse10:maths:jemh102:<slug> --dry
```

> NOTE: `generate-gates.ts` currently authors with **NIM** by default? No — it calls
> `claudeAuthor()` = **Haiku**. (Research is Firecrawl.) Keep it on Haiku per the cost rule.

**Verify a chapter after authoring:**
```sql
SELECT concept_id, count(*) FILTER (WHERE slot LIKE 'sketch%') sketch,
       count(*) FILTER (WHERE slot='explain') explain,
       count(*) FILTER (WHERE slot='mcq') mcq,
       count(*) FILTER (WHERE slot='equation') eqn
FROM gates WHERE kind='authored' AND concept_id LIKE 'cbse10:maths:jemh102%'
GROUP BY concept_id;
```

**One known gap:** the goal concept `apply-real-number-theorems` may not have authored gates
(it was last in the Ch.1 run) — re-run it if missing.

---

## How the gates work in the app (already wired)

- After all key ideas are demonstrated → `poseGate` returns the **next uncleared** gate in
  slot order. NodeView renders by type: MCQ radios, equation/symbolic input, **written**
  textarea, **sketch** → draw on the scratchpad and "Submit drawing".
- Grading: MCQ exact-match, equation → `gradeEquation` (LLM equivalence to ideal),
  written → `gradeWritten` (rubric), sketch → `gradeSketch` (NIM vision vs rubric).
- A wrong answer gives **targeted feedback and re-poses the same gate** (no hard reset).
  The **node passes only when the whole set is cleared**; passing recomputes availability.

---

## Remaining TODOs (not started)

1. **Scale gates to chapters 2–14** (the main job — see above).
2. **Textbook-PDF reference viewer.** User decision: **do NOT crop figures** (too costly);
   instead make the **actual chapter PDF viewable** as reference (transcription misses figures
   / some info). PDFs are at `content/cbse10/textbooks/math/jemhNNN.pdf` (gitignored). Plan:
   serve them (express static or a Render disk / object store) + add a "📄 Textbook chapter"
   link in NodeView/Details mapping `chapterId → jemhNNN.pdf`.
3. **Use the research to enrich teaching context** (user idea): the Firecrawl breakdowns per
   chapter can feed the node-agent's context, not just gate authoring.
4. **Later milestones (from `bottom_up.md`):** the final past-paper exam; per-learner chapter
   strict-linear unlock (currently chapter list is Ch.1-active/rest-locked static).
5. **Quality pass:** spot-check authored gates for any that drifted; the equation `expected`
   often stores a fraction/expression (graded by LLM-equivalence, not the integer CAS path).

---

## Run locally

```bash
npm install            # (Windows dev used pnpm; Render uses npm --include=dev)
# .env must have DATABASE_URL, NVIDIA_API_KEY, ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, LLM_PROVIDER
node_modules/.bin/tsx src/api/index.ts   # API on :3030
node_modules/.bin/vite                   # web on :5173
```

## Deploy gotchas (learned the hard way)
- Render must use **npm, not pnpm** (pnpm 11 needs Node 22; we pin Node 20). The repo has
  **no `pnpm-lock.yaml`** (gitignored) and **no `packageManager` field** — keep it that way.
- API service: build `npm install --include=dev`, start `npm start` (= `tsx src/api/index.ts`).
  `tsx` MUST resolve locally — don't use `npx tsx` (pulls a cache copy that can't resolve project modules).
- Web service: build `npm install --include=dev && npm run build:web`, publish `dist/web`,
  env `VITE_API_URL=https://bottom-up-api.onrender.com/api`.
- **Deploys don't auto-trigger** (no repo webhook). After `git push`, trigger manually:
  `curl -X POST .../v1/services/{id}/deploys -H "Authorization: Bearer $RENDER_API_KEY" -d '{}'`.

## Scope guard (from the spec)
CBSE 10 Maths only for now. cbse12 + other subjects come later. Don't scale teaching quality
work past what's verified; the teaching loop + gate flow are generic and already handle any
loaded concept.

# NIM model study — de-risking the Haiku → self-hosted-GPU switch

**Goal.** Students currently run on **Claude Haiku**. When traffic grows we want to self-host a model
on our **own NVIDIA GPU** (an NVIDIA NIM model) to cut per-student cost. Before switching we need
study data on the candidate NIM models: which is strongest, where each is weak/strong, JSON
reliability, latency, and vision quality — judged against the **real prompts our students actually hit**,
not toy questions.

This is a **manual review run by Claude Code** (me), occasionally. It is **never** wired into the app
and **never** runs automatically.

## The cost rule this respects

We do **not** re-call any paid API to run the study. The **Haiku baseline is captured during normal
production use** — every real tutoring call is logged to `bu_llm_call` (full request messages + full
response). The study harness only calls the **free NVIDIA NIM endpoints** to get candidate responses
for those same prompts, then puts them side-by-side with the already-captured Haiku answer.

So: Anthropic is called **zero** times by the study. Only free NIM endpoints are hit.

## Live NIM fallback (now wired — 2026-06-19)

Separate from this offline study, a **live Claude→NIM fallback** is now in production. In `src/core/llm.ts`,
`completeJson()` (the live tutoring/grading text path) catches an Anthropic failure — rate-limit/quota (429),
auth/credit (401/403), overload/5xx/529, or network/timeout/missing-key — and retries on the free NIM text
model **`meta/llama-3.3-70b-instruct`**, so a student's turn still completes when Anthropic is exhausted.
Student **vision** already runs on **`nvidia/nemotron-nano-12b-v2-vl`** (`nimVision`), so the agreed text+vision
NIM pair is the effective fallback floor. (4xx client bugs still surface; NIM-primary has no fallback.) This is a
resilience seam, not a cost switch — the study below still informs an eventual deliberate Haiku→NIM migration.

## How conversations are captured

- `src/core/llm.ts` records every model call via `recordLlmCall` (`src/core/llm-log.ts`) into the
  `bu_llm_call` table: `provider`, `model`, `purpose` (`tutor`/`vision`/`translate`/`author`/`figure`),
  the exact `messages` array, the `response`, token counts, and latency.
- Base64 images are stripped to `[image omitted]` so vision turns don't bloat the DB.
- The replay corpus for this study = rows where `provider='claude' AND purpose='tutor'`.

## How to run the study (Claude Code, manually)

```bash
# Replays the most recent captured real prompts through the candidate NIM models.
node tools/nim-study.mjs
# Options:
node tools/nim-study.mjs --limit 10
NIM_STUDY_MODELS="meta/llama-3.3-70b-instruct,openai/gpt-oss-120b" node tools/nim-study.mjs
```

If no real prompts are captured yet, the harness falls back to a small built-in scenario set
(factoring-a-quadratic turns with known expected signals) so it is runnable immediately.

**Outputs** (git-ignored, regenerated each run):
- `tools/nim-study/results.json` — raw side-by-side data.
- `tools/nim-study/report.html` — **open this** to inspect Haiku vs each NIM model, per prompt:
  response text, latency, parsed `signal`, and JSON validity.

## The candidate models

Edit the `MODELS` list at the top of `tools/nim-study.mjs` (or pass `NIM_STUDY_MODELS`). The free
NIM catalog drifts; a model that 404s is recorded as an error cell, not a crash. Start point:
`meta/llama-3.3-70b-instruct` (current fallback), `openai/gpt-oss-120b`,
`qwen/qwen2.5-72b-instruct`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`.

## Vision (separate, manual)

The text harness covers tutoring turns. For vision ("which NIM model reads handwritten working best")
run a small curated image set through the candidate vision models manually and note findings below —
we deliberately do **not** persist student scratchpad images.

## Verdict log

Record each review pass here (newest first): date, models compared, winner, strong/weak points,
JSON reliability, latency, and a go/no-go on switching. _(empty until the first real run)_

<!-- e.g.
### 2026-06-17 — run 1 (3 captured prompts, 4 models)
- Best overall: …
- JSON reliability: …
- Latency: …
- Vision: …
- Decision: stay on Haiku / pilot <model> for <slice>
-->

---

## Outcome: the dynamic NIM router (shipped 2026-06-21)

The study's conclusion was that **no single free NIM model is reliably best** — endpoints swing in speed
and availability through the day (deepseek-v4-pro is high quality but frequently times out; ministral can
400/timeout one minute and answer the next). So instead of a static pick we shipped a **per-session speed
router**.

**How it works**
- `tools/nim-bench.ts` — the study, formalised: a deterministic quality battery (JSON-validity, exact
  answers, instruction-following, no `<think>` leakage), run **thinking-off**, with retries that separate
  *availability* from *quality*. Produces a 0–1 quality score per candidate.
- `src/core/nim-router.ts` — on each node entry, `routeModels()` **speed-probes** the candidate pool in
  parallel (thinking-off), drops dead/slow endpoints, and ranks the rest by **`0.5·speed + 0.5·quality`**.
  Speed is an *absolute budget* (≤floor = 1.0, ≥ceiling = 0) so quality genuinely counts, not speed-only.
  The budget is **kind-aware**: text (≤350 ms…≥4 s) vs **vision** (≤3 s…≥25 s) — vision is inherently 7–17 s,
  so a text budget would zero out every VLM and collapse vision to pure-quality (always the *slowest* best
  model); the wider vision band lets a fast-and-good VLM beat a slow-and-perfect one.
- **The browser is the source of truth.** `RouterPopup` caches the race winners (`{text, textFallback,
  vision}`) in `localStorage` and the client sends them as `models` on *every* turn. The api validates each
  id against the gated pool (`isAllowedModel`) and seeds `route-store.ts` (`setRoutePicks`) before the
  teach/grade path reads it — so picks **survive deploys and work across multiple instances** (any instance
  serves the turn using the learner's own pick), and a client can only ever pick among our good models, never
  name one outside the pool. The in-memory store is now a per-request backstop; empty/invalid → `MODEL_TEXT`.
- `src/core/route-store.ts` — `respond()`/`teachTurn()` read the seeded pick and thread it into
  `completeJson({ model, modelFallback })`. The 2nd-best is the in-call fallback.
- `POST /api/learner/:id/route` — runs the probe, returns the full ranked race; the client caches it.
- `RouterPopup.tsx` — the "finding your fastest tutor" modal at node entry **and after any tutor failure**
  (it stops, names the dead model via `failedModel`, re-probes, retries with the new winner; capped at 3).

**Candidate pool — FULL-catalog sweep (2026-06-21, thinking-off).** `nim-bench.ts` now fetches the entire
`/v1/models` list and tests every chat-text model, not a hand-picked few: **121 models → 90 text candidates
→ 37 responded → 27 cleared the 0.6 quality floor**. The router pool is the **speed×quality frontier** of the
qualified set (not all 27 — a smaller pool is cheaper to probe and every member is worth winning):

| model | quality | speed | role |
|---|---|---|---|
| `deepseek-ai/deepseek-v4-pro` | 1.00 | ~1.4 s | best quality |
| `mistralai/mistral-nemotron` | 0.88 | ~0.6 s | high quality **and** fast |
| `qwen/qwen3-next-80b-a3b-instruct` | 0.75 | ~1.2 s | reliable, proven in prod |
| `nvidia/nemotron-3-nano-30b-a3b` | 0.75 | ~0.4 s | fastest good model |
| `meta/llama-3.1-8b-instruct` | 0.63 | ~0.4 s | fast fallback |
| `mistralai/ministral-14b-instruct-2512` | 0.63 | ~0.8 s | fast fallback |

Below-floor models are excluded entirely (e.g. `mixtral-8x7b` 0.25, `sarvam-m` 0.13) — never probed, never
served. Reasoning models still excluded (break JSON). The 0.6 floor is well-tuned to the real distribution:
the lowest kept model is 0.63, the highest excluded 0.25 — a clean gap.

**Live verification:** `/route` returns HTTP 200 on both prod APIs and adapts run-to-run (e.g. picked qwen
on bottom-up and deepseek on IE in the same minute) — auto-routing around whatever is slow that moment.

**Vision** (`tools/nim-vision-bench.ts`): same full-catalog idea for the sketch-grading model. Test set =
real handwritten math pages from the public HF dataset `HumynLabs/English-Handwritten-Math-Notes-Dataset`,
rasterized to PNG (`tools/fetch-vision-set.mjs`), **ground truth annotated by Opus 4.8 vision** (Claude Code).
2026-06-21 sweep of all catalog VLMs:

| model | quality | speed |
|---|---|---|
| `meta/llama-3.2-90b-vision-instruct` | 1.00 (6/6) | ~17 s |
| `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | 0.83 | ~7 s (fastest VLM) |
| `nvidia/nemotron-nano-12b-v2-vl` | 0.83 | ~12 s |
| `meta/llama-3.2-11b-vision-instruct` | 0.67 | ~10 s |

`phi-3-vision`, `cosmos-reason2-8b`, `neva-22b` were unavailable on the free tier. Vision turns are slow
(~7–17 s) — a real constraint, which is exactly why the speed budget is kind-aware (above): without it the
router would always pick the 17 s model. (Watermarked pages kept local, not committed.)

> Cost rule still holds: the bench + probes hit **only free NIM endpoints**; Anthropic is never called.

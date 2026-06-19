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

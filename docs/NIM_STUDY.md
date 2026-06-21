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
  Speed is an *absolute budget* (≤350 ms = 1.0, ≥4 s = 0) so quality genuinely counts, not speed-only.
- `src/core/route-store.ts` — stores the winning model per learner; `respond()`/`teachTurn()` thread it
  into `completeJson({ model, modelFallback })`. The 2nd-best is the in-call fallback; no probe → `MODEL_TEXT`.
- `POST /api/learner/:id/route` — runs the probe, stores the winner, returns the full ranked race.
- `RouterPopup.tsx` — the "finding your fastest tutor" modal at node entry **and after any tutor failure**
  (it stops, names the dead model via `failedModel`, re-probes, retries with the new winner; capped at 3).

**Candidate pool (2026-06-21 bench, thinking-off):** qwen3-next-80b (q 0.75, reliable) · ministral-14b
(0.63) · llama-3.1-8b (0.63, fastest) · deepseek-v4-pro (~0.9, often slow → probe-gated). Reasoning models
excluded (break JSON); `mistral-small-24b` / `qwen2.5-7b` 404 on this account; `llama-3.3-70b` always slow.

**Live verification:** `/route` returns HTTP 200 on both prod APIs and adapts run-to-run (e.g. picked qwen
on bottom-up and deepseek on IE in the same minute) — auto-routing around whatever is slow that moment.

**Vision** (`tools/nim-vision-bench.ts`): same idea for the sketch-grading model. Test set = real handwritten
math pages from the public HF dataset `HumynLabs/English-Handwritten-Math-Notes-Dataset`, rasterized to PNG
(`tools/fetch-vision-set.mjs`), with **ground truth annotated by Opus 4.8 vision** (Claude Code). 2026-06-21:
`nemotron-nano-12b-vl`, `llama-3.2-11b-vision`, `llama-3.2-90b-vision` all read at ~83%; nemotron is fastest
(~11 s) so it leads the vision pool. `phi-3.5-vision` / `qwen2.5-vl-72b` were unavailable on the free tier.
Vision turns are slow (~11 s+) — a real constraint. (Watermarked pages kept local, not committed.)

> Cost rule still holds: the bench + probes hit **only free NIM endpoints**; Anthropic is never called.

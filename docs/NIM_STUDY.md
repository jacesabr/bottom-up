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

## Outcome: the dynamic NIM router (shipped 2026-06-21, re-benched HARD + FAIR 2026-06-22)

The study's conclusion: **no single free NIM model is reliably best** — endpoints swing in speed and
availability through the day (deepseek-v4-pro is high quality but rate-limits/times out under burst;
ministral can 400 one minute and answer the next). So instead of a static pick we ship a **per-session router**
that blends a **live speed probe** with a **precomputed quality** score.

**Why quality is precomputed.** In real time the router can only do a *single speed probe* per model — it
**cannot grade quality live** (there is no orchestrator AI in the loop to judge answers). So quality is benched
**offline** here and combined with live speed. Speed swings hourly (measured live); quality (reasoning/reading
capability) does not, so precomputing it is correct — re-run when the lineup shifts.

**How it works**
- `tools/nim-bench.ts` (text) / `tools/nim-vision-bench.ts` (vision) — the quality batteries. `--models a,b`
  re-scores just the pool; otherwise a full `/v1/models` sweep.
- `src/core/nim-router.ts` — `routeModels()` speed-probes the pool in parallel (thinking-off), drops dead
  endpoints, ranks by a **quality-dominant** blend:
  - **Text:** speed gets full marks under ~1 s (a 4-token probe's sub-second delta is noise), so the higher
    reasoning score decides among the fast models and an exact tie falls to the **curated order** (the proven
    model — no 0.2 s flip). Only a genuinely slow model (>1 s) is penalised.
  - **Vision:** quality-weighted **0.85** (vision is only the occasional handwriting turn, never the text hot
    path) → the most **accurate** reader wins. Vision speed is now **measured live** with a real probe image
    (`src/core/probe-image.ts`); the old 1×1 ping returned ~300 ms for everything and measured nothing.
- **The browser is the source of truth.** `RouterPopup` caches the winners and the client sends them as
  `models` on every turn; the api validates each id (`isAllowedModel`) and seeds `route-store.ts`
  (`setRoutePicks`) before the teach/grade path reads it — picks survive deploys + work across instances, and
  a client can never name a model outside the pool. Empty/invalid → `MODEL_TEXT` default.
- **Self-healing.** Mistral-tokenizer models 400 on `chat_template_kwargs` (sent for `NIM_NO_THINK`) → drop the
  kwarg + retry, learned per-model (`drainErrorBody` reads the streamed error body so the 400 is classifiable).
  Hung model → fast fallback (`NIM_TIMEOUT_MS`, 30 s). A failed *turn* re-probes via the "reconnecting" popup
  and **resumes without wiping the conversation** (re-sends the failed message; capped at 3).

### The HARD, FAIR battery (re-bench 2026-06-22)

The original batteries were too easy and **saturated every model at a meaningless "100%"** (vision "passed" if
ONE topic word appeared anywhere; text was 8 trivial items). Rebuilt, deterministic, no LLM judge:
- **Text:** 18 multi-step items where wrong reasoning ⇒ a wrong final **number** (kv-cache bytes, MACs,
  arithmetic intensity, decode latency, continuous-batch, quantization sizes, modular arithmetic), exact-answer
  graded, plus the structural JSON-turn checks the live app needs.
- **Vision:** 13 dense handwritten pages, each requiring **multiple** specific tokens/values; scored by
  **partial-credit token recall**, not all-or-nothing.
- **Fairness fix (critical).** The bench was rate-limiting slow free-tier models (deepseek 429s under burst)
  and scoring "couldn't answer" as "wrong" — which falsely tanked deepseek to 44%. Now: pace + retry, and
  **quality = correctness among items actually ANSWERED** (a 429/timeout is *availability*, gated live by the
  speed probe, never a capability failure).

### Measured pool (2026-06-22)

**Text** (capability = correct / answered):

| model | quality | note |
|---|---|---|
| `deepseek-ai/deepseek-v4-pro` | 1.00 | perfect on answered incl. hardest quant — slow ~11 s (speed blend rarely picks it) |
| `deepseek-ai/deepseek-v4-flash` | 1.00 | perfect on answered |
| `nvidia/nemotron-3-super-120b-a12b` | 0.89 | missed kv-cache + matmul; slow ~8 s |
| `mistralai/mistral-nemotron` | 0.83 | fast ~0.6 s → **usually the live winner** |
| `qwen/qwen3-next-80b-a3b-instruct` | 0.78 | proven in prod |
| `meta/llama-3.1-70b-instruct` | 0.75 | |
| `meta/llama-3.3-70b-instruct` | 0.72 | |
| `nvidia/nemotron-3-nano-30b-a3b` | 0.67 | fastest good ~0.4 s |
| `abacusai/dracarys-llama-3.1-70b-instruct` | 0.67 | |
| `meta/llama-4-maverick-17b-128e-instruct` | 0.65 | fast |
| `mistralai/ministral-14b-instruct-2512` | 0.61 | just above floor |
| `meta/llama-3.1-8b-instruct` | **0.44** | **dropped** — below the 0.6 floor |
| `mistralai/mistral-small-4-119b-2603` | **0.40** | **dropped** — below the 0.6 floor |

**Vision** (quality = mean token recall, all answered 13/13):

| model | quality | speed (real read) |
|---|---|---|
| `nvidia/nemotron-nano-12b-v2-vl` | **0.90** | ~11 s — best AND fastest → **live winner** |
| `meta/llama-3.2-90b-vision-instruct` | 0.84 | ~38 s — most-accurate-but-slowest (was a fake 1.00) |
| `meta/llama-3.2-11b-vision-instruct` | 0.78 | ~16 s |
| `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | **0.55** | **dropped** — weakest reader (the old live pick!) |

**Honest caveat:** free-tier throttling caps precision on the slow models (deepseek answered fewer items per
run, all correct → genuinely top, just slow); the live probe gates availability regardless. The handwritten
pages (HF `HumynLabs/English-Handwritten-Math-Notes-Dataset`) are watermarked → kept local, not committed.
Re-run: `tsx tools/nim-bench.ts --models <ids>` and `tsx tools/nim-vision-bench.ts --models <ids>` (vision
needs the set first: `node tools/fetch-vision-set.mjs 16`).

> Cost rule still holds: the bench + probes hit **only free NIM endpoints**; Anthropic is never called.

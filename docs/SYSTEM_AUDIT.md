# System audit — analyse the live system's quality & issues

A **read-only** runbook for checking how the running app is actually doing and where the problems are.
Nothing here writes to the DB. Run it whenever, or ask Claude Code to run + interpret it.

```bash
node tools/audit-system.mjs            # last 7 days
node tools/audit-system.mjs --days 1   # tighten the window
```

It reads `DATABASE_URL` from `.env` and prints seven sections. Below: what each means and the red flags.

---

## What's recorded (the data this reads)

Every model call and key event is logged to the DB for quality auditing — we never re-call a paid API to
audit; the live logs ARE the corpus:

- **`bu_llm_call`** — every tutor/grader/vision call: provider, model, purpose, full messages + response,
  tokens, latency, and `error` (null when fine). The replay corpus for `tools/nim-bench.ts`.
- **`bu_event`** — the event log. Includes **`type='route_probe'`** rows: the dynamic NIM router's
  speed×quality race that the learner saw at node entry (the full ranked result, per session) — so the
  "which endpoint did we pick, and how did each perform" stats are auditable after the fact.
- **`bu_gate_attempt`** — every gate answer (correct/incorrect) → pass rates per concept.
- **`bu_node_performance`** — per-learner node status (passed / needs_reteach).
- **`bu_corpus_gap`** — content the tutor was asked for but our material lacked.

---

## How to read the report

| § | Section | Good | Red flag |
|---|---|---|---|
| 1 | **LLM health** (calls by model) | low err%, ok_ms ≲ 2s for text | a model with high err% or ok_ms > 10s → drop/deprioritise it |
| 2 | **NIM router** (probe races) | one or two endpoints win consistently, high up% | an endpoint at low up% is flaky → its quality seed may not be worth keeping |
| 3 | **Gate quality** (worst concepts) | most concepts > 50% pass | a concept near 0% with several attempts → hard or **broken/mis-scoped gate** |
| 4 | **Errors** (recent failures) | empty | repeated same-model errors → that endpoint is down/gated |
| 5 | **Corpus gaps** | empty / rare | a repeated gap → real missing content to author |
| 6 | **Engagement** | — | many `needs_reteach`, few `passed` → a chapter is too hard |
| 7 | **Flagged issues** | "none flagged ✓" | 0%-pass gates + repeatedly-erroring models, called out to act on |

---

## Model quality (the offline half)

Runtime selection is **availability + speed only** (pure code: `nim-router.ts` pings the candidate pool and
ranks by `0.5·speed + 0.5·quality`). The **quality** half is precomputed offline and not re-assessed live:

- `node tools/nim-bench.ts` — sweeps **all chat models** NIM exposes (`/v1/models`), scores each on a
  deterministic battery (JSON validity, exact answers, instruction-following, no `<think>` leak). Writes
  `.audit-tmp/nim-bench.json`.
- `tsx tools/nim-vision-bench.ts` — same for **all vision models**, scored against Opus-4.8-annotated
  handwritten-math pages (`tools/fetch-vision-set.mjs`).

Models **too weak to reason** (below the quality floor) are kept OUT of `nim-router.ts`'s pool entirely —
we never want a weak model serving a user, and a smaller pool is cheaper to probe.

---

## Going deeper (ask Claude Code)

The script is the dashboard; for anything it flags, ask Claude Code to drill in — e.g. *"pull the last 5
`bu_llm_call` rows for model X with their errors"*, *"show every gate attempt + the transcript for the
0%-pass concept Y"*, *"summarise the route_probe winners by hour to see when deepseek is fast"*. All
read-only against the same `DATABASE_URL`.

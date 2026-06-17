# Bottom-Up Exam-Prep

Teach a subject **chapter by chapter, concept by concept, bottom-up** — gate each concept, then finish with a
clean past-paper exam. A standalone product, **separate from the Socratic tutor**: it *copies* the CBSE corpus
and *reuses* the same infra (Render / Neon / Drizzle, graders, node-agent, ModelRouter), but is its own app and
its own screen.

**New here? Read in this order:** this README → `bottom_up.md` (the build spec) → `docs/change_log.md` (decisions).
Open `docs/exam-prep-overview.html` for the one-screen, plain-language explainer (it becomes the in-app
"How it works" documentation page).

## Socratic vs Bottom-Up
- **Socratic** — drop a learner into a hard question and *descend* to the gap.
- **Bottom-Up** — *build the learner up first*, in order, then *measure* with a clean exam.

Same corpus + infra, opposite mechanics, different screen.

## How it works (one screen)
1. Pick exam + subject.
2. Chapters unlock in order (strict).
3. Inside a chapter, concept nodes unlock bottom-up (locked / open / passed) — tap an open one.
4. Inside a concept: the AI teaches, ticks off each key move, then a gate. Pass → next opens; miss → re-teach & retry (same gate).
5. After all chapters: one clean **past board paper**.
6. Weak concepts flagged to revise. Every concept + attempt is recorded.

## First milestone — 3 nodes only
Nail the teaching loop on a 3-node slice of **CBSE 10 · Maths · Ch.1 Real Numbers**, then scale. Seed data is
already imported in `content/jemh101.slice.json`:

1. `know-prime-composite-coprime` (bedrock) → 2. `prime-factorise-integer` → 3. `state-fundamental-theorem-arithmetic`.

## Models & cost policy (HARD RULE)
- **Real user traffic → Claude Haiku.**
- **All testing → NVIDIA NIM (free)** or the offline `mock` provider. **Never run a test suite on Haiku.**
- At most **1–2 Haiku messages** for a manual sanity check — never automated.
- Enforce in the ModelRouter: `prod` profile = Haiku, `test` profile = NVIDIA NIM / mock; refuse Haiku under the test runner.

## Deployment
**Render**, on the **jae** account (same as Socratic) — API service + static web, Neon Postgres. Reuse the infra.

## Repo layout
```
bottom-up/
  README.md                  ← start here
  bottom_up.md               ← the build spec (scope, data, AI flow, models/deploy, done-when)
  authoring_and_improve.md   ← the authoring & content-improvement playbook (single source of truth)
  content/
    jemh101.slice.json       ← imported 3-node seed (concepts + gates) from the Socratic corpus
  docs/                      ← the rest of the docs
    change_log.md            ← running decisions log
    DEPLOYMENT.md            ← deploy guide
    NIM_STUDY.md             ← the Haiku→self-hosted-GPU model study (run via tools/nim-study.mjs)
    corpus_gap.md            ← generated: content the tutor couldn't answer (tools/export-corpus-gaps.ts)
    exam-prep-overview.html  ← plain-language explainer → in-app "How it works" page
  # src/, db/ added by the build — see bottom_up.md §5
```

## Data source
Content is **imported** from the Socratic repo (`socratic-planning/exams/cbse10/maths/jemh101/`), the single
source of truth — don't re-author; re-run the import to refresh.

## Build order
See `bottom_up.md` §5: import → schema → sequencer + availability → teach loop → gate → maps + performance →
offline mock test. Build on the 3 nodes, verify, **then** scale.

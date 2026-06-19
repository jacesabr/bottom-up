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

## Current status (2026-06-19) — maths corpus COMPLETE + live
The 3-node milestone is long past. The full maths corpus is authored, audited, and live:
- **41 maths chapters fully authored** — cbse10 `jemh101`–`jemh114` (14), cbse12 `mathematics-ch01`–`ch13` (13),
  jee `maths-ch01`–`maths-ch14` (14).
- **3236 authored gates** (5-gate sets per concept: `sketch1`/`sketch2`/`explain`/`mcq`/`equation`, with a few
  recorded honest skips). DB-verified clean: 0 null source, 0 social/video source, 0 MCQ encoding defects, 0 null
  sketch/explain rubrics, 0 prerequisite-order violations.
- **Every authored gate carries web-research-verified authoritative source URLs** (per-gate provenance).
- **215 concepts carry tutor-private foundational refreshers** (`§A.5`: `{trigger, surfacingQuestion, ladder[],
  answer, returnCue}`, on `concepts.refreshers`) — surfaced only when a learner's bedrock gap appears.
- **17 §A prerequisite "bridge" bedrock nodes** authored across 9 chapters (e.g. coordinate plane, Pythagoras,
  laws of exponents, mathematical induction, right-hand rule), each with a full 5-gate set, wired upstream of
  their consumers.

Live now: **https://bottom-up-web.onrender.com** (app) · **https://bottom-up-api.onrender.com** (`/health` → ok).
The full authoring/improvement process + the per-chapter ledger live in `authoring_and_improve.md`.

## Models & cost policy (HARD RULE)
- **Real user traffic → Claude Haiku**, with a **live NIM fallback**: if the Anthropic call fails (rate-limit/quota,
  auth/credit, 5xx/overload, network/timeout), `completeJson()` falls back to the free NIM text model
  `meta/llama-3.3-70b-instruct` so the student's turn still completes. Student **vision** already runs on NIM
  `nvidia/nemotron-nano-12b-v2-vl`. NIM-primary has no fallback (it is the free floor). See `src/core/llm.ts`.
- **All testing → NVIDIA NIM (free)** or the offline `mock` provider. **Never run a test suite on Haiku.**
- At most **1–2 Haiku messages** for a manual sanity check — never automated.
- Enforce in the ModelRouter: `prod` profile = Haiku (+NIM fallback), `test` profile = NVIDIA NIM / mock; refuse Haiku under the test runner.
- **Authoring/content** uses a strong model in-session (curated, human-reviewed); never bulk-burned on a frontier model. See `authoring_and_improve.md`.

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
Content lives under `content/<exam>/<subject>/<chapter>/{content.json, exam.json, source/*.txt}` and is loaded
into Neon by `tools/load-content.ts` (bottom-up toposort → chapters, concepts, book gate). The concept *brains*
were originally seeded from the CBSE corpus, but the **5-gate assessment sets, per-gate sources, refreshers, and
§A bridge nodes were authored/improved in-place** — `authoring_and_improve.md` is the single source of truth for
that process. Authored gates live in the DB (`kind='authored'`); `content.json` holds the node brain + prereq
wiring (and is durable across reloads — `load-content.ts` preserves DB-authored refreshers). Note: the
in-memory content cache only refreshes on **API restart** (there is no `/api/admin/reload` route — see
`docs/DEPLOYMENT.md`).

## Build order
See `bottom_up.md` §5: import → schema → sequencer + availability → teach loop → gate → maps + performance →
offline mock test. Build on the 3 nodes, verify, **then** scale.

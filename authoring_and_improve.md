# authoring_and_improve.md — the single source of truth for authoring & improving nodes

How we turn a raw concept node into a **comprehensively authored, prerequisite-complete, gated teaching
node** — the exact, repeatable process proven on **CBSE 10 Maths Ch.1 (`jemh101`)** and generalised to every
math exam in the corpus (cbse10, cbse12, jee).

> **This file supersedes and merges `how_to_author_nodes.md` (the operator's manual) and
> `continue_authoring.md` (the where-we-are/what's-next handoff), retired 2026-06-16.** There is now **one**
> authoring document. Read it with `bottom_up.md` (the living spec — what a node *is* and how it's *used*).

> **Sibling repo — keep them in sync.** **Inference Engineering** (`c:\Users\E Logitech\Desktop\bottom_up_IE`)
> is forked from this codebase and shares its skeleton: schema, teach→gate loop, `NodeDetails`/`App` web shell,
> the PARTS explanation format, and the dev API-proxy setup. When a fix or improvement we make here could
> benefit IE (web rendering, the explanation format, dev-server wiring, grader seams, the prereq-sufficiency
> sweep, etc.), **mirror it there** and note it in IE's `authoring_process.md`. The prereq-sufficiency sweep in
> §A below was **ported back from IE**, where it was first solidified. Examples already mirrored both ways: the
> PART-card Details rendering and the `API_PORT`-following Vite proxy (2026-06-16).

---

## ⚠ Non-negotiable constraints (READ FIRST — these override convenience)

1. **A node is not "done" until its prerequisites are sufficient.** Every load-bearing idea a node's
   explanation, keyMoves, or gates *use* must be taught **upstream first** — in an earlier node of this
   chapter, in an earlier chapter, or in a **bridge node we author**. Running the **§A prereq-sufficiency
   sweep is MANDATORY for every node**, not an optional clean-up. This is the constraint this whole product
   rests on: a learner reaches a node only after passing everything upstream, so the upstream must actually
   contain what the node needs.
2. **MODEL: author on Sonnet 4.6, never Haiku.** `--model claude-sonnet-4-6` is the default for all curated
   authoring/scaling (parity with Opus at ~half cost — §F.8). `--strong` (Opus) only for a hard node or a
   final verify pass. **Haiku is forbidden for authoring** — it produced wrong arithmetic (`2²×3³×5 = 1350`;
   it's 540). This is a *sanctioned exception* to the Haiku cost rule (§E): curated, human-reviewed authoring
   is not teaching traffic and not a test suite.
3. **Ground in real source — never hallucinate.** Every claim and every gate traces to NCERT (the chapter's
   OCR text under `content/<exam>/<subject>/<chapter>/source/*.txt`) + light authoritative web research. A
   bridge node with no real citation is **dropped**, not invented.
4. **Don't batch blind — go incremental and read every word.** Author ONE node, audit it by eye, then widen.
   The worst defects (a self-contradicting model answer, `1350` vs `540`) pass every structural check and are
   only caught by reading. **Never declare a batch good from counts alone.**
5. **Always `--skip-authored` when re-running or batching a chapter.** Without it the tool does a clean-slate
   re-author (deletes + rewrites existing authored gates) — intended only when you deliberately force-rewrite
   one node.
6. **§A applies to EVERY authoring path — no exemptions.** The prereq-sufficiency sweep (#1) is mandatory
   whether a node is authored by `generate-gates.ts`, by a Claude Code session by hand, or by a Sonnet
   sub-agent. **A node authored without its §A sweep is incomplete and goes on the prereq-sweep backlog (§G),
   even if its gates are correct.** Sub-agents/in-session authoring MUST inventory load-bearing terms, prove
   each is taught upstream, and propose any needed bridge node for approval *before* writing it (§A Step 4).
7. **★ MANDATORY Phase-2 research+improve pass before the corpus is "done" (do NOT skip — recorded so it
   cannot be quietly dropped).** Authoring is explicitly **two-phase**, by sanctioned decision (2026-06-17):
   - **Phase 1 (completeness, in progress):** every node gets correct, math-verified, NCERT-*content*-grounded
     5-gate sets + the §A prereq sweep. Speed-justified shortcut: Phase 1 may skip fresh **web research** and
     per-gate `source` provenance (the in-session/sub-agent path has `source = NULL`). High-quality completeness
     is the Phase-1 win.
   - **Phase 2 (research + foundational deepening, REQUIRED, not optional):** once the corpus is complete, do a
     full re-pass over EVERY node that did Phase-1-only authoring: (a) read the chapter's NCERT OCR
     `source/*.txt` (foundational grounding) and Web-research authoritative exam/question-bank sources
     (Claude Code WebSearch/WebFetch is fine — no Firecrawl/API needed), (b) improve content + gates against
     that evidence, (c) **populate `source` on every gate**, and (d) clear the §A prereq-sweep backlog for any
     node that skipped it. **The corpus is NOT "done" until Phase 2 has run on all Phase-1 nodes.** Track the
     Phase-1-only chapters in §G so Phase 2 has a worklist.
   - **Phase 2 is DEFERRED on purpose (decision 2026-06-17): spend NO compute on it now.** Phase 2 is simply
     **a future full re-run of this `authoring_and_improve` process over the entire corpus** — it can be run
     anytime later. During Phase 1 do not do any web research or source-backfill; just keep completing nodes.

---

## ⚠⚠ HARD RULES — model & no-API (these OVERRIDE the §pipeline / §E text below)

> Added 2026-06-17 by explicit, repeated user instruction. Where these conflict with older text in this file
> (which still documents the `generate-gates.ts --model` pipeline), **these win.**

**HR-1 — Claude Code LOCAL work ONLY; NEVER call an external API for authoring.** All authoring happens inside
Claude Code: in-session reasoning + **Sonnet sub-agents** (the Agent tool, `model: sonnet`) writing gates
straight to Neon via the Neon MCP and editing `content.json` with local file tools. **Do NOT call the Anthropic
API, `generate-gates.ts` / `claudeAuthor()` (they spend `ANTHROPIC_API_KEY`), Firecrawl, or any other external
AI/research API for authoring** — those credits are reserved for the live product, never for bulk authoring
(global memory `feedback_no-api-for-ai`). `tools/load-content.ts` (local toposort/upsert) and the Neon MCP are
fine — they are not AI/API spend.

**HR-2 — Author on SONNET; never burn OPUS on bulk.** Generation of explanations + gates runs on **Sonnet
sub-agents**. The orchestrating **Opus** session must **NOT** do massive authoring/processing itself (it burns
Opus usage) — Opus **orchestrates + AUDITS only** (read every gate, recompute arithmetic, run/approve the §A
sweep, fix issues). Opus is sanctioned for the verify/audit pass, **not** the batch authoring. **Haiku is still
forbidden for authoring** (bad arithmetic — constraint #2). So: **Sonnet authors, Opus audits, Haiku never.**

---

## ★ Where we are / what's next (the living log — update every slice)

> Absorbs the old `continue_authoring.md` front matter. Newest status at the top; the detailed per-chapter
> record is §G. Edit this section before you stop.

### Live now (verified)
- **App (frontend):** https://bottom-up-web.onrender.com
- **API:** https://bottom-up-api.onrender.com (`/health` → `{"status":"ok"}`)
- **Repo:** https://github.com/jacesabr/bottom-up (branch `master`)
- Free Render tier → the API **sleeps after ~15 min idle**; first hit wakes it (~30–50s).
- End-to-end flow: **Exam → Subject → chapter map → in-chapter node map → teaching chat → in-chat gate checks
  → pass unlocks dependents → strict-linear chapter unlock → final past-paper exam.**

### Authoring stands at (Phase-1 COMPLETE — 2026-06-17)
**✅ All three maths exams are fully 5-gate authored and Opus-audited.** cbse10 `jemh101`–`jemh114` (14 ch),
cbse12 `mathematics-ch01`–`ch13` (13 ch), jee `maths-ch01`–`maths-ch14` (14 ch) = **41 chapters, 645 concepts,
3151 authored gates.** 0 bad-shape MCQs, 0 null sketch rubrics. See §G for the full per-chapter ledger.

All authoring was done directly in Claude Code sessions (Sonnet sub-agents writing gates straight to Neon via
the Neon MCP + editing `content.json` with local file tools). **`generate-gates.ts` was never used for the bulk
of this corpus** — references to it in §pipeline and §B describe the originally-planned tool-based workflow,
kept for historical context and as a reference for the gate-encoding contract. The actual workflow that produced
the corpus is **HR-1/HR-2 above**: Sonnet sub-agents author, Opus orchestrates + audits, no external API spend.

> **Next work is Phase 2 only** (constraint #7, intentionally deferred): web + NCERT-OCR research, per-gate
> `source` backfill, and the full §A prereq-sweep on Phase-1-only chapters. No compute spent on this now.

### Remaining ideas / TODOs (not yet done)
- **Textbook-PDF reference viewer.** We deliberately do **not** crop figures (too costly); instead, make the
  actual chapter PDF viewable. PDFs live at `content/cbse10/textbooks/math/jemhNNN.pdf` (gitignored). Plan:
  serve via express static / a Render disk / object store, plus a "📄 Textbook chapter" link in NodeView /
  NodeDetails that maps `chapterId → jemhNNN.pdf`.
- **Use research to enrich *teaching* context, not just gate authoring.** The Firecrawl breakdowns gathered per
  chapter could feed the node-agent's teaching context, not only the gate author.
- (Equation `expected` fraction/expression → LLM-equivalence grading is a known caveat — see the `upsertGate`
  note in §D.)

### Services & credentials (all in `.env`, NOT committed)
| Thing | Value / location |
|---|---|
| **Neon DB** | project `fragrant-fire-62588797`, db `neondb`. `DATABASE_URL` in `.env`. |
| **Render** | workspace **jae** (`tea-d8e1tae8bjmc73am2g10`, key `RENDER_API_KEY`). API svc `srv-d8nuodbeo5us738ehh9g`, web svc `srv-d8nuom4m0tmc73ehufd0`. **Deploys must be triggered manually** via REST (`POST /v1/services/{id}/deploys`). |
| **NVIDIA NIM** | free, `NVIDIA_API_KEY`. Teaching model `meta/llama-3.3-70b-instruct`; vision `nvidia/nemotron-nano-12b-v2-vl`. |
| **Firecrawl** | `FIRECRAWL_API_KEY` — web research for gate authoring. |
| **Claude** | `ANTHROPIC_API_KEY`. Authoring → **Sonnet 4.6** (`--model`); real-user teaching → **Haiku**; never a frontier model for teaching/bulk. |

### Architecture (key files)
```
src/
  db/schema.ts        Drizzle: concepts (incl. prereqs[]), gates (slot/ord/ideal_answer/why/rubric/source),
                      bu_event (append-only TRUTH), bu_node_performance / _checklist / _gate_attempt, bu_figure
  db/index.ts         pg pool + initializeDatabase() (loads the seed slice on boot)
  core/
    llm.ts            ModelRouter: resolveProvider(), completeJson() (NIM/Claude), nimVision(),
                      claudeAuthor() (model-selectable), parseLooseJson()
    node-agent.ts     teachTurn() (warm Socratic); gradeWritten() rubric, gradeSketch() vision, gradeEquation()
    teach-loop.ts     enterNode/respond (dialogue from bu_event), poseGate()/answerGate() MULTI-GATE seq, getNodeDetail()
    sequencer.ts      bottom-up availability (locked/available/passed) + strict-linear chapter unlock
    papers.ts         final past-paper exam flow
  api/routes.ts       REST endpoints; api/index.ts boots + serves
  web/                React: ExamSelect→SubjectSelect→ChapterList→ChapterMap→NodeView (+ NodeDetails, Scratchpad)
tools/
  load-content.ts     walks content/, computes bottom-up toposort order, upserts chapters/concepts/book gate
  generate-gates.ts   THE AUTHORING PIPELINE (content pass + Firecrawl research + gate author)
content/<exam>/<subject>/<chapter>/{content.json, exam.json, source/*.txt, figures/*.png}
```

---

## A. ★★ The prerequisite-sufficiency sweep — MANDATORY for every node

**This is the core of "ensure the student has the information to succeed."** A learner only ever reaches a node
after passing everything upstream of it, so the node may safely lean on upstream knowledge — *but only if that
knowledge is genuinely upstream.* The sweep guarantees it. Do it for **every** node, before the node is
declared done; do not rubber-stamp it.

### The two guarantees that make "upstream" sufficient
A node in chapter *N* may rely on an idea if and only if that idea is taught in one of:
1. **An earlier node in the same chapter** — enforced by the in-chapter prereq DAG (`sequencer.ts`: a node is
   `locked` until **all** its `prereqs` are `passed`). `concept.order` (set by `load-content.ts` toposort) is
   the ground truth for "upstream."
2. **An earlier chapter** — enforced by **strict-linear chapter unlock** (`sequencer.computeChapterStatuses`:
   chapter *N* is `locked` until chapters 1…*N*-1 are each `complete`, i.e. every node in them passed). So
   anything taught in any prior chapter is guaranteed already mastered by the time the learner reaches *N*.

If a load-bearing idea is in **neither**, the node has an unmet prerequisite and the sweep must resolve it.

### Step 1 — Inventory the load-bearing terms
Read the node's `explanation`, `keyMoves`, **and every gate**. List every distinct mathematical term or idea
the node *uses* (e.g. `prime factorisation`, `exponent`, `HCF`, `irrational number`, `∩`/`∪`, `discriminant`).
A term is load-bearing if removing it would make the explanation impossible to follow, or if a gate's answer
depends on it.

### Step 2 — For each term, find where it's taught (check upstream chapters too, not just this one)
| Term used in this node | Taught by (node / chapter) | Verdict |
|---|---|---|
| `HCF` | `compute-hcf-by-prime-factorisation` (same chapter, lower order) | ✓ in-chapter upstream |
| `exponent` | introduced in Ch.1 `manipulate-prime-powers` | ✓ earlier-chapter upstream |
| `prime factorisation` | **nowhere upstream** | → resolve in Step 3 |
| `irrational number` | later node `prove-root-2-irrational` | → forward reference (DEFER or remove) |

Build this table before touching any JSON. Use `concept.order` for same-chapter ordering; use chapter index
for cross-chapter ordering. **A term taught in a previous chapter is sufficient — do not re-teach it; just
record the cross-chapter prereq edge (Step 4).**

### Step 3 — Classify every unmet term into exactly one of three outcomes (say which, in writing)
This is the part the old §10 was missing — there are **three** outcomes, not two:

1. **AUTHOR a bridge node** — the term is genuinely required *here* and is taught **nowhere upstream** (not in
   this chapter, not in an earlier one). Author a new, small, grounded upstream node that teaches exactly that
   term (full strict process in §B), and wire this node's `prereqs` to it. Use when the term is load-bearing
   for understanding or for a gate.
2. **DEFER to a later node + soften** — the term is named in passing but is **owned and taught downstream**
   (a later node or chapter). Do **not** teach it here. **Soften the forward reference** so the node does not
   *depend* on it: a name-drop with a one-clause gloss is fine; **a gate may never require a deferred term.**
   Record which downstream node/chapter owns it.
3. **INLINE-GLOSS** — a minor, one-off term not worth its own node and not owned downstream. Add a short
   parenthetical gloss in place (e.g. "a coprime pair — two numbers whose only common factor is 1").

**Rule of thumb (AUTHOR vs DEFER/soften):** mentally remove the term. If removing it makes the explanation
*simpler and clearer*, it was a forward reference → DEFER + soften (or INLINE-GLOSS). If removing it makes the
explanation *impossible to follow*, it's load-bearing and taught nowhere upstream → AUTHOR a bridge.

**The failure mode this prevents:** declaring a node fine because the prose *reads* fine, while a learner who
has only seen the upstream nodes actually hits an undefined term — or worse, a **gate** that relies on it.

### Step 4 — Get approval, then wire and reload
- **Before writing any JSON**, output a plain-text summary in chat: each proposed bridge node (title +
  1-line brief), each DEFER (term + downstream owner + the softened wording), each INLINE-GLOSS. Ask
  *"Does this look right before I write the nodes?"* and wait for confirmation.
- Add bridge-node ids (and any cross-chapter prereq ids) to the consuming node's `prereqs` array.
- Reload: `node_modules/.bin/tsx tools/load-content.ts <exam>:<subject>:<chapter>` — the toposort recomputes
  `order`, placing bridges before consumers automatically. Verify the bridge has a lower `order`.

### Recurring failure modes (prereq-specific)
| Defect | Symptom | Fix |
|---|---|---|
| Bridge authored but `prereqs` not wired | Toposort places the bridge AFTER the consuming node ("you've just seen X" before X exists) | Add bridge id to the consumer's `prereqs`, reload |
| Bridge itself uses an undefined term | Cascading confusion — the bridge needs its own bridge | Inventory the bridge node too before writing |
| Forward reference softened but a gate still needs it | A DEFER term leaks into a gate answer | A gate may never require a deferred/forward term — re-author the gate |
| Cross-chapter prereq dropped | "Taught in Ch.1" assumed but no edge recorded | Add the cross-chapter id to `prereqs` (stored even where inert) so provenance is explicit |
| Bridge too big (teaches 2+ ideas) | Cognitive overload; bridge gates go out of scope | Split into two bridge nodes in dependency order |

---

## A.5 ★ Refresher items — the FOURTH outcome, for bedrock gaps with NO upstream node

**The gap §A's three outcomes miss.** AUTHOR-bridge assumes the idea belongs in this course's DAG; DEFER
assumes a downstream owner; INLINE-GLOSS is a one-clause aside. But the **very first node of the very first
chapter** (`jemh101` node 0) still leans on **pre-curriculum bedrock the syllabus never teaches and never
will** — "assumed school knowledge" that has no earlier node to point at and never gets one. Worked trigger
(real): a node uses $2^3$ and calls it **"2 cubed."** *Why* is it called cubed? There is no upstream node,
this *is* node 0, and we will not add a "what is a dimension" node to a Real Numbers chapter. Yet a student who
can't say why "cubed" is a real gap — trivial-seeming, but the kind that quietly compounds. This is **not**
bridge material and it is **more than a gloss.** It is the fourth §A outcome:

4. **REFRESHER ITEM** — the term is genuine pre-curriculum bedrock (assumed prior-grade common knowledge,
   owned by no node in this course in either direction). Do **not** author a node and do **not** just gloss
   it. Author a small, **tutor-private, fully-scaffolded refresher** the tutor deploys *only when the gap
   surfaces* (§ runtime method in [dont_assume.md](dont_assume.md) §2): it surfaces the gap with a "why/what"
   question, lets the student hit and **confess** the gap, then **fills** it with a laddered explanation, then
   **returns** to the node's main line. Applies **even at node 0 / chapter 0** — "no earlier node" is never an
   excuse to skip it.

### What a refresher item contains (author all five)
For the `2³ = "cubed"` worked example:

1. **Trigger** — the term/symbol/fact that, when the node uses it, should fire the refresher: `"cubed" / xⁿ named as a power`.
2. **Surfacing question** (the "why", asked *before* explaining) — *"Quick one before we go on: why do you think we call $2^3$ '2 **cubed**'?"* Designed to walk the student to the floor of their own ignorance and have them say "I don't actually know."
3. **Sub-question ladder** (smaller and smaller, to *locate* the floor) — *What's a cube? How's a cube different from a line or a square? How many dimensions does a cube have? What's a dimension?* The tutor descends only as far as the student's gap.
4. **Comprehensive answer** (what a complete fill looks like, grounded in elementary truth) — A **dimension** is an independent direction you can move in. A line is **1-D**, a square **2-D**, a cube **3-D**. $2^3 = 2\times2\times2$ is the volume of a cube of side 2 — **three** factors for **three** dimensions — which is exactly *why* we say "cubed"; likewise $2^2 = 2\times2$ is the **area** of a square of side 2, so "**squared**."
5. **Return cue** (the seamless hand-back) — *"So: three dimensions → three factors → 'cubed'. Right, back to where we were —  …"* Returns to the exact key move that was in flight.

### How to produce them while authoring
During the §A inventory (Step 1–3), every load-bearing term you classify as **"assumed prior-grade common
knowledge"** (rather than a course concept) gets a refresher item written for it — not a silent pass. Build
them from elementary truth (no NCERT citation required; this is below the curriculum), keep each to one
foundational idea, and write the four prose parts above. A node is **not done** until its bedrock-assumed
terms each have a refresher item, the same way it is not done until its course-level prereqs are sufficient.

**Author generously.** The runtime **Socratic loop** (`surface ignorance → confess → fill → return`,
[dont_assume.md](dont_assume.md) §2a) is meant to fire **as often as possible** — it's the lesson's heartbeat,
what keeps it conversational instead of chatbot-y. The tutor can only run that loop where it has a grounded,
comprehensive answer ready. So **err toward more refresher items, not fewer**: every "why/what" a curious
student might reasonably ask about a term the node uses (why cubed? why is this prime? what's a factor really?)
is a loop the tutor can run only if you authored the fill. Sparse refreshers → the tutor either bluffs or
skips the gap; rich refreshers → frequent, genuine surface-confess-fill-return turns.

### Where they're stored (the adjustment the next authoring run makes)
Refreshers are **tutor-private** — like `misconceptions`, the tutor must NEVER dump them unprompted; it
deploys one only when that gap actually surfaces. Target shape: a **`refreshers[]` field on the concept,
parallel to `misconceptions`** (each item `{ trigger, surfacingQuestion, ladder[], answer, returnCue }`),
threaded into `TeachTurnInput` and rendered into the tutor system prompt as a private "deploy only when this
gap surfaces" block. That field does not exist yet — **adding it + populating node 0 of `jemh101` with the
`"cubed"` refresher is the canonical first task of the next authoring run.** Until the field lands, hold new
refresher scaffolds in this section so they are not lost. This is exactly the "adjust the node to contain this
information" work; the runtime behaviour that consumes it is already specified in
[dont_assume.md](dont_assume.md) §2.

---

## B. The strict process for authoring a bridge / prereq node (high quality, no shortcuts)

A bridge node is a **normal node** held to the **same bar as any other** — it is not a throwaway stub. Author
it with this process:

1. **Keep it small — one missing idea per bridge.** If two ideas are missing, author two bridge nodes in
   dependency order. A bridge teaches exactly the term that was unmet, nothing more.
2. **Ground every claim in real source.** Use the chapter's NCERT OCR (`content/<exam>/<subject>/<chapter>/
   source/*.txt`) + light web research. If the idea is implicit in NCERT but not its own chapter node (e.g.
   "what a variable is" in an algebra chapter), cite the NCERT chapter/page where it's used. **A bridge with
   no real citation is dropped, not invented.**
3. **PARTS explanation format (§C), one PART per key move.** No forward references, no jargon outside the
   allow-list (the bridge sits at the bottom — its allow-list is small, so its language must be elementary).
4. **`brief` is a distinct 1-sentence hook**, not a copy of PART 1's opening (it renders twice otherwise).
5. **Author its own full 5-gate set** (§D) via `generate-gates.ts` — a bridge node gates like any other node:
   ```bash
   node_modules/.bin/tsx tools/generate-gates.ts <exam>:<subject>:<chapter>:<bridge-slug> \
     --model claude-sonnet-4-6 --improve-content
   ```
6. **Wire + reload + verify** (§A Step 4): bridge id in the consumer's `prereqs`, toposort places it upstream,
   eyeball the bridge's content and every gate.

Node JSON skeleton (placed before the consuming node in `content.json` for readability; true order is derived
by toposort from `prereqs`):
```json
{
  "id": "<exam>:<subject>:<chapter>:<slug>",
  "title": "<concise 3–8 word title>",
  "brief": "<distinct 1-sentence hook — not copied from explanation PART 1>",
  "explanation": "PART 1 — <what it teaches>.\n<2–3 sentences, no jargon outside the allow-list.>\n\nPART 2 — …",
  "keyMoves": ["…"],
  "misconceptions": ["…"],
  "prereqs": [],
  "source": { "ref": "<NCERT chapter/section>", "url": "<ncert.nic.in URL if applicable>" }
}
```

---

## ★ The authoring pipeline — HISTORICAL REFERENCE (tool not used for live corpus)

> **Note (2026-06-17):** The `generate-gates.ts` tool described below was the originally-planned pipeline but
> was NOT used to produce the live Phase-1 corpus (HR-1: no external API spend for authoring). The actual
> workflow is Claude Code in-session + Sonnet sub-agents + Neon MCP. This section is kept because: (a) the
> gate-encoding contract (§D ⛔ callout) and quality rules here are still authoritative; (b) it documents the
> scope-guard, arithmetic self-check, and clean-slate logic that the sub-agent authoring mirrors manually.
> If `generate-gates.ts` is ever revived, these flags remain valid.

After a content audit (§F) exposed bad maths and unimproved content from the old cheap path, the pipeline was
upgraded and proven on cbse10 `manipulate-prime-powers` and cbse12 `relation-definition`. The recipe:

```bash
# ONE curated node, content + gates, NCERT-grounded, Sonnet (default for scaling):
node_modules/.bin/tsx tools/generate-gates.ts <exam:subject:chapter:slug> --model claude-sonnet-4-6 --improve-content
# dry-run first to inspect without writing:  add --dry
# a whole chapter's first 10 nodes:
node_modules/.bin/tsx tools/generate-gates.ts <exam:subject:chapter1> --limit 10 --model claude-sonnet-4-6 --improve-content
# SAFE RE-RUN (skip concepts that already have authored gates — prevents accidental clean-slate re-author):
node_modules/.bin/tsx tools/generate-gates.ts <exam:subject:chapter1> --limit 10 --model claude-sonnet-4-6 --improve-content --skip-authored
```

What each piece does (all in `tools/generate-gates.ts` + `src/core/llm.ts`):

1. **Strong author model (NOT Haiku) — default `--model claude-sonnet-4-6`.** The single biggest quality
   lever. `--strong` = `claude-opus-4-8` for a hard node or a verify pass. Implemented via `MODEL_AUTHOR` /
   the `model` arg of `claudeAuthor()`.
2. **`--improve-content` → the content pass.** Before authoring gates it rewrites the node's
   `brief / explanation / keyMoves / misconceptions`, grounded **strictly in the chapter's NCERT OCR text** +
   light web research, and updates the `concepts` row. Without this, re-running only ever changed the gates and
   the teaching content stayed a thin stub. (cbse10 has no OCR on disk → it refines the existing NCERT-derived
   explanation; cbse12/jee have OCR → stronger grounding.)
3. **Scope-guard.** The author is given the **already-taught** concepts (lower-order, same chapter) as an
   allow-list and told every item must be solvable from THIS node's key moves + those — **never a later
   concept.** This killed the recurring creep (HCF/LCM on a "compare powers" node, proofs on a "what divides
   means" node, ∪/∩ on a "membership" node). **Note:** the scope-guard stops *forward* over-reach; the §A
   sweep is what guarantees the allow-list actually *covers* what the node needs (the other direction). Both
   are required.
4. **Arithmetic self-check + no-false-premise + clean-answer** rules in the prompt: compute and re-verify every
   numeric answer; never ask a student to justify a false statement; `idealAnswer` is the final clean answer
   only (no leaked "Wait…" working).
5. **Honest sketch-skip.** Prefer `skip` for a sketch slot when a drawing would be contrived (logical/
   notational concept) — but keep genuinely useful visuals (factor tree, arrow/grid diagram).
6. **Authoritative-source search.** `research()` over-fetches 10, **drops video/social** and **ranks reputable
   maths-ed domains first** (ncert, cbse, vedantu, byjus, learncbse, toppr…). Sources are stored on every gate.
7. **Clean-slate re-author.** Before writing, the tool deletes the node's existing `authored` gates (book
   gates untouched) so a re-run is deterministic and a now-skipped slot is actually removed.

### The quality loop (do NOT skip the audit)
1. Author **ONE** node with the recipe; run the **§A prereq sweep**; **audit it by eye** (read content + every
   gate; recompute numeric answers; confirm `mcq.correct ∈ options`).
2. Once a node is genuinely good, do **one node per section** (cbse10 + cbse12 + jee node-0) and audit all three.
3. Only when all three hold, scale to the **first 10 nodes per section**.
4. Record any new failure mode in §F and tighten the prompt before scaling further.

---

## C. The PARTS explanation format (required — not auto-generated)

The `--improve-content` pass writes prose; that is **raw material, not the target.** Every explanation must be
restructured into **one PART per key move**, because the AI tutor works directly from the explanation — dense
prose collapses distinct skills into one un-parseable block.

```
PART 1 — <what key move 1 teaches>.
<2–3 sentences. The move itself + one worked example. No forward references.>

PART 2 — <what key move 2 teaches>.
<2–3 sentences. …>
```

**Rules:**
- One PART per entry in `keyMoves`. 3 key moves → exactly 3 PARTs.
- Each PART ≤ 3 sentences. Need a 4th? Split into a new PART.
- No blending — key move 2 does not appear in PART 1. No forward references — PART 1 cannot say "you'll need
  this in PART 3."
- `brief` must be a **distinct 1-sentence hook**, not a copy of the PART 1 opening (else the Details panel
  renders it twice).

**How it renders (load-bearing).** `NodeDetails.tsx → parseParts` detects `PART N —` markers and renders each
PART as a **numbered card** (circled `N` badge + bold heading + body) with a **↓ arrow connector** between
cards (`.d-part*` in `NodeDetails.css`). For this to work: put a **line break after `PART N — Heading.`** (the
text up to the newline is the heading); separate PARTs with a **blank line** (`\n\n`); use the em-dash `—`;
text before `PART 1` is a lead-in paragraph; a node with no markers renders as one plain paragraph (opt-in,
legacy-safe).

**Worked example (`manipulate-prime-powers`, verified 2026-06-16):**
```
PART 1 — What a prime power means.
2³ means 2 multiplied by itself 3 times: 2 × 2 × 2 = 8. It does NOT mean 2 × 3 = 6. The
exponent tells you how many copies of the base to multiply together. So 3² = 3 × 3 = 9, and 5¹ = 5.

PART 2 — Multiplying prime powers into one number.
Once you have evaluated each prime power separately, multiply the results. For 2³ × 3² × 5:
evaluate each — 8, 9, 5 — then multiply: 8 × 9 × 5 = 360.

PART 3 — Comparing exponents of the same prime.
When the same prime appears in two different numbers, line up its exponents and choose one.
For HCF take the SMALLEST exponent; for LCM take the GREATEST.
```
Brief (distinct hook): *"Two arithmetic skills underlie all HCF/LCM work: evaluating a prime power, and
choosing the right exponent when the same prime appears in different numbers."*

---

## D. What "authoring a node" means + the 5-gate set

A loaded concept already has its **brain** (brief, explanation, key moves, misconceptions, prereqs) imported
from the corpus, plus **one book gate** lifted from `exam.json`. That is enough to *teach* — not enough to
*measure mastery well*. Authoring gives a node a **professional, web-researched, 5-gate assessment set**.

| slot | answerType | grader | what it asks |
|---|---|---|---|
| `sketch1` | sketch | vision | draw/construct — a diagram, factor tree, number line, graph, figure |
| `sketch2` | sketch | vision | a **second, different** drawing/visual task |
| `explain` | written | rubric | long-form explanation *in the learner's own words* |
| `mcq` | mcq | mcq | single-best-answer, 4 options |
| `equation` | symbolic | cas | a harder compute/prove problem with an exact answer |

**Leeway:** a slot that genuinely doesn't fit may be **skipped** with a recorded `skipReason` (e.g.
irrationality proofs skip both sketches — nothing meaningful to draw). A skipped slot is a logged decision,
never a silent gap. Each authored gate stores `idealAnswer`, `why`, `rubric` (sketch/explain), and `source`.

**How gates work in the app (already wired):** after all key ideas are demonstrated, `poseGate` returns the
**next uncleared** gate in slot order; NodeView renders by type (MCQ radios, symbolic input, written textarea,
sketch → draw on scratchpad). Grading: MCQ exact-match, equation → `gradeEquation` (LLM equivalence to ideal),
written → `gradeWritten` (rubric), sketch → `gradeSketch` (NIM vision vs rubric). A wrong answer gives
**targeted feedback and re-poses the same gate** (no hard reset). The **node passes only when the whole set is
cleared**; passing recomputes availability and unlocks dependents.

### Gold reference — what "comprehensive" looked like (cbse10 `jemh101`, first 3 nodes)
The bar to match, per gate (these are the proven, in-scope sets — chapter has **18 nodes, 90 authored gates** total):
- **`know-prime-composite-coprime`** — mcq on what *coprime* means; explain *why* HCF of coprimes = 1; sketch =
  Venn / number-line; equation = reduce a fraction to lowest terms.
- **`prime-factorise-integer`** — **sketch1 = factor tree for 360, sketch2 = factor tree for 1260, mcq =
  factorise 2520, equation = factorise 1890.** (Two genuinely different sketches; compute items at increasing size.)
- **`state-fundamental-theorem-arithmetic`** — covers existence + uniqueness; mcq "unique *apart from order* of
  factors"; equation applies it.

### The pipeline at a glance
```
concept (in DB)
  ├─(a) RESEARCH   Firecrawl /v1/search → real exam/question-bank hits, exam-specific search tag
  ├─(b) IMPROVE    content pass rewrites brief/explanation/keyMoves/misconceptions from NCERT OCR
  ├─(c) AUTHOR     Sonnet (claudeAuthor) given the brain + research + already-taught allow-list
  │                → STRICT JSON: { sketch1, sketch2, explain, mcq, equation }
  └─(d) UPSERT     each slot → one gates row (kind='authored'), idempotent on id `<conceptId>:<slot>`
```
### How (a)→(d) work internally (the quality engine)
- **(a) `research(topic, profile)`** — query is literally `"<concept.title> <profile.searchTag>"`, sent to
  Firecrawl `POST /v1/search`. It **over-fetches 10**, drops video/social, ranks reputable maths-ed domains
  first, and **returns up to 4 hits** as `{ title, url, snippet }`. Those hits + their URLs are what get stored
  as each gate's `source`.
- **Per-exam author persona / level / searchTag** (drives both the author system prompt and the query tag):

  | exam | persona (system prompt) | level | searchTag |
  |---|---|---|---|
  | cbse10 | expert CBSE Class 10 Maths assessment author | CBSE Class 10 (NCERT) level | `CBSE class 10 maths exam questions with solutions` |
  | cbse12 | expert CBSE Class 12 Maths assessment author | CBSE Class 12 (NCERT) level | `CBSE class 12 maths board exam questions with solutions` |
  | jee | expert JEE (Main & Advanced) Mathematics problem author | JEE Main/Advanced level | `JEE main advanced maths problems with solutions` |

- **(b) `authorPrompt(concept, hits, profile)` → `claudeAuthor`** — system prompt sets the persona and demands
  **STRICT JSON**; the user prompt hands over the brain + research hits + the five slot specs and asks, per
  slot, for `prompt / idealAnswer / why / rubric / options+correct / expectedValue / skip+skipReason`. Run at
  **`max_tokens` 2600** and parsed with **`parseLooseJson`** (tolerates code fences / stray prose around the
  JSON).
- **(d) `upsertGate(...)`** writes the human-facing columns (`slot`, `ord`, `prompt`, `idealAnswer`, `why`,
  `rubric`, `source`) plus a server-only **`expected`** payload, shaped per type:
  - `mcq` → `{ kind:'mcq', correct, options }`
  - `equation` → `{ kind:'symbolic', equivalentTo: expectedValue, ideal: idealAnswer }`
  - `sketch`/`explain` → `{ kind:<answerType>, ideal: idealAnswer, rubric }`

  Idempotent on id `<conceptId>:<slot>`. **Caveat:** when an equation's `expectedValue` is a fraction or
  expression (not a clean integer), grading falls to LLM-equivalence rather than the integer CAS path — prefer
  a clean exact value, or make the item `written`.

> ### ⛔ GATE ENCODING — EXACT SHAPES THE LIVE GRADERS DEPEND ON (do NOT drift)
> Verified against `src/core/teach-loop.ts` + `src/web/components/NodeView.tsx` (2026-06-17). When authoring
> gates by hand / via sub-agent in raw SQL (not through `upsertGate`), you MUST reproduce these EXACTLY, or the
> gate renders `[object Object]` and never grades correct in the app:
>
> - **`mcq.expected`** = `{"kind":"mcq","correct":"<FULL TEXT of the winning option>","options":["<full text A>","<full text B>","<full text C>","<full text D>"]}`.
>   `options` is an **ARRAY OF PLAIN STRINGS** (the full option text). `correct` is the **EXACT FULL STRING** of
>   the winning option — it must be byte-identical to one element of `options`. **NEVER** use `[{"key","text"}]`
>   objects, and **NEVER** make `correct` a letter ("A"/"B"). The frontend does `options.map(o => radio value=o)`
>   and the grader does `norm(answer) === norm(expected.correct)`; both assume string === option string.
> - **`equation.expected`** = `{"kind":"symbolic","equivalentTo":"<clean integer if possible>","ideal":"<exact answer>"}`
>   AND set the **`ideal_answer` column** to the same exact answer (the CAS/LLM grader reads the COLUMN, not the
>   jsonb, on the non-integer path).
> - **`explain.expected`** = `{"kind":"written","ideal":"<model answer>","rubric":"<criteria>"}` AND set the
>   **`rubric` column** (and ideally `ideal_answer` column) — `gradeWritten` reads the COLUMNS, not the jsonb.
> - **`sketch1`/`sketch2`.expected** = `{"kind":"sketch","ideal":"<what to draw>","rubric":"<criteria>"}` AND set
>   BOTH the **`rubric` and `ideal_answer` columns** — `gradeSketch` (vision) reads the COLUMNS; null columns
>   silently degrade to a generic "is this a correct labelled diagram" rubric.
>
> Self-check after a chapter: every `mcq` row must satisfy `jsonb_typeof(expected->'options')='array'` AND
> `jsonb_typeof(expected->'options'->0)='string'` AND `expected->>'correct'` ∈ the options array; every
> `sketch`/`explain` row must have a non-null `rubric` column. (Diagnostic SQL in §G.)

**`generate-gates.ts` reads concepts from the DB**, so load the corpus first:
```bash
node_modules/.bin/tsx tools/load-content.ts            # every exam/subject under content/
node_modules/.bin/tsx tools/load-content.ts cbse12     # or one exam (prefix filter)
```
`load-content.ts` walks `content/<exam>/<subject>/<chapter>/{content.json,exam.json}`, computes the bottom-up
toposort order (prereqs first, tie-broken by `sec` then title), and upserts chapters, concepts, and the book
gate per node.

---

## E. Cost rule (HARD — with one sanctioned exception)

- **Real-user teaching → Claude Haiku.** All automated testing → NVIDIA NIM (free) / `mock`. **Never run a
  test suite on Haiku**, never a frontier model for teaching traffic or bulk runs. Current prod is
  `LLM_PROVIDER=nvidia`; prod real-user path is `LLM_PROVIDER=claude` (Haiku).
- **Sanctioned exception — curated authoring uses a strong model.** Authoring via `generate-gates.ts`
  (`--model claude-sonnet-4-6`, or `--strong` = Opus) is small-batch, human-reviewed content creation — not
  teaching, not a suite. Default to Sonnet; Opus only for a hard node or verify pass. Applies ONLY to the
  authoring tool when given an explicit `--model`/`--strong`. Default `claudeAuthor()` is still Haiku, so
  nothing changes for any non-curated path.

---

## F. Content audit — failure modes to author against (from the first nodes of each maths exam, 2026-06-16)

The recurring defects to prevent in the author prompt / catch in review. Apply these preemptively.

### F.1 Biggest systemic problem: gates over-reach the node's scope + prereqs
Authors keep writing gates that test **downstream** concepts the node doesn't own (HCF/LCM on a "compare
powers" node; a full `p|a² ⟹ p|a` proof on a "read p|a" node; `A∩B`/`A∪B` on a "membership" node). **Fix:**
every gate must be answerable from THIS node's keyMoves + ideas at or below its bottom-up order — never a later
concept. The scope-guard (§pipeline 3) enforces this; the §A sweep confirms the *other* direction (what it
needs is present).

### F.2 Model answers leak chain-of-thought / self-correct / are wrong (worst defect)
The `cbse12 empty-relation` equation gate's `idealAnswer` opened "$R = \emptyset$", then mid-answer flipped to
"Wait: (5,1) gives 24 ✓. So R = {(5,1)}, non-empty" — self-contradicting, and (for an *empty-relation* node)
resolving to a non-empty relation. **Fix:** `idealAnswer` is the FINAL, clean answer only — no "Wait", no
working you retract. And the worked example must actually exemplify the concept the node teaches.

### F.3 Difficulty mismatched to a foundational node
Proofs/multi-part problems landing on order-0/1 nodes. **Fix:** scale difficulty to `order` — early nodes get
single-step items; save multi-step/proof items for later nodes.

### F.4 Smaller issues
- **MCQ compound options** ("X ∈ M and Y ∉ M") — prefer one assertion per option.
- **`equivalentTo` holding prose, not a value** — silently downgrades CAS grading to LLM-equivalence.
  Proof/derivation items should be `written` (rubric), not `equation`/symbolic.
- **Rubric format drift** — keep rubrics a single `"✓ … ✓ …"` string, not a serialized array.
- **Weak source provenance** — bias the Firecrawl query to past papers / official question banks; prefer
  authoritative domains (source URLs are stored on every gate, so junk is visible).

### F.5 What's already good (emulate)
`cbse12 relation-definition` (every gate in-scope; mcq "which is NOT a valid relation" with a `B×A` distractor;
equation `2⁶`); `jee define-a-well-defined-set` (correctly skips both sketches; equation reuses the concept).

### F.6 Verify after every run
```sql
SELECT concept_id,
       count(*) FILTER (WHERE slot LIKE 'sketch%') AS sketch,
       count(*) FILTER (WHERE slot='explain')      AS explain,
       count(*) FILTER (WHERE slot='mcq')          AS mcq,
       count(*) FILTER (WHERE slot='equation')     AS eqn
FROM gates
WHERE kind='authored' AND concept_id LIKE 'cbse12:mathematics:mathematics-ch01%'
GROUP BY concept_id ORDER BY concept_id;
```
Then **spot-read 2–3 gates by eye** — pull the actual rows for one concept:
```sql
SELECT slot, answer_type, left(prompt,80), left(ideal_answer,60), left(source,50)
FROM gates WHERE concept_id='<conceptId>' AND kind='authored' ORDER BY ord;
```
Check: prompt unambiguous? `idealAnswer` answers it? `mcq.correct` ∈ options? equation's `expectedValue`
matches the worked `idealAnswer`? Skipped slots have a sane `skipReason`?

### F.7 Round 2 root causes (fixed) & re-audit
**Bad maths** = Haiku; **content never improved** = the tool only wrote gates. Both fixed (Sonnet default +
`--improve-content` + scope-guard + arithmetic self-check + no-false-premise + clean-answer + honest
sketch-skip + clean-slate + authoritative search). Re-audit specifics:
- `manipulate-prime-powers` — content rewritten; mcq `2³×3²×5 = 360` **with the wrong 1350 demoted to a
  distractor**; explain reframed as "find the student's error"; sketches = factor tree + exponent tally;
  sources Vedantu / Byjus NCERT-exemplar. (Earlier `2²×3³×5` is **540**, not 1350.)
- `relation-definition` — cites the Class-XI functions link; arrow diagram + 3×3 grid flagging `(2,3)≠(3,2)`;
  mcq with `∅` / all-of-`A×B` distractors; equation `2⁶ = 64`. All in-scope.

### F.8 Opus vs Sonnet — Sonnet is the default
3 fresh order-10 nodes (cbse10 `decide-ends-with-digit-via-primes`, cbse12 `composition-of-functions`, jee
`compute-the-union-of-sets`), audited line-by-line vs Opus — verified answers all correct: `4ⁿ = 2²ⁿ` (FTA
argument), `(g∘f)(2) = 17`, `|{1..6} ∪ {4..9}| = 9` (and it scope-aware-skipped a union Venn — that needs
*intersection*, a different node). Every numeric answer correct, in-scope, clean, **no quality drop at ~half
the cost.** Conclusion: **author with Sonnet by default;** `--strong` (Opus) only for a node that proves shaky
or a final verify pass. Keep auditing as we scale.

### 6a. Advanced tracks (JEE Advanced) — DO NOT author yet
The schema supports an advanced overlay (`concepts.advanced_content`, `gates.tier='advanced'`), surfaced only
on `track='advanced'`. `generate-gates.ts` authors **foundation tier by default.** **Hard rule:** do NOT
author any JEE-Advanced content or advanced gates **until explicitly told** — we are waiting to review the
government-recommended JEE Advanced resources first, which then become the source. Until then the advanced
fields stay empty and JEE Advanced is not a selectable track. Same holds for any "beyond-the-book" section:
fill the overlay only from a real, approved resource — never invent advanced material.

---

## Scope discipline (current milestone)
- **First 10 nodes authored per maths exam** (cbse10, cbse12, jee), **math only.** Everything else is loaded
  (full content + book gate) but not yet 5-gate authored — those nodes still teach and gate on their book
  question. Scale further only after the slices are reviewed and quality holds.

---

## Textbook figures (inline, no cropping) — manual captioning as part of authoring

**Why manual:** captioning must NOT use the Anthropic API (those credits are for live chat only). The agent
views the PNGs directly with the Read tool — **free** — and writes the figure→concept mapping. Do it
incrementally as nodes are authored.

**What exists:** 4 visual chapters have extracted figures + `figures-manifest.json` (~11 MB total, from the
socratic Firecrawl pull): `jemh103` (Linear Eq.), `jemh109` (Trig applications), `jemh110` (Circles), `jemh111`
(Areas), git-tracked under `content/cbse10/maths/<chapter>/figures/*.png`. Named figures (`fig_3.1.png`) are
clean; `pageNNN_imgM.png` are whole-page images (served whole — no cropping). Other chapters have no figures
(they don't need diagrams). The mapping lives in **`bu_figure`** (`id, chapterId, filename, page, caption,
conceptIds[], relevant`); only `relevant=true` rows are served.

**Process per chapter:** (1) list the chapter's concepts —
`node -e "require('./content/cbse10/maths/jemh103/content.json').nodes.forEach(n=>console.log(n.slug,'::',n.title))"`;
(2) view each figure with Read (e.g. `Read content/cbse10/maths/jemh103/figures/fig_3.1.png`); (3) write a
one-line caption + the concept ids it illustrates, INSERT into `bu_figure` (see the seeded `jemh103` rows
`fig_3.1`/`fig_3.2`); (4) done — serving + inline display are wired. **Verified sample:** `jemh103` →
`solve-graphically` shows `fig_3.1.png` when the student asks "show me the graph". **Already wired (don't
rebuild):** `GET /api/figure/:chapterId/:filename`, `GET /api/concept/:conceptId/figures`, tutor `figureRef`
inline display + a deterministic fallback (if the student asks to "show/graph/diagram…" and a figure exists,
it's attached).

---

## Run locally
```bash
npm install            # Windows dev used pnpm; Render uses npm --include=dev
# .env must have DATABASE_URL, NVIDIA_API_KEY, ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, LLM_PROVIDER
node_modules/.bin/tsx src/api/index.ts   # API on :3030
node_modules/.bin/vite                   # web on :5173
```

## Deploy gotchas (learned the hard way)
- Render must use **npm, not pnpm** (pnpm 11 needs Node 22; we pin Node 20). The repo has **no
  `pnpm-lock.yaml`** (gitignored) and **no `packageManager` field** — keep it that way.
- API svc: build `npm install --include=dev`, start `npm start` (= `tsx src/api/index.ts`). `tsx` MUST resolve
  locally — **don't use `npx tsx`** (it pulls a cache copy that can't resolve the project's modules).
- Web svc: build `npm install --include=dev && npm run build:web`, publish `dist/web`, env
  `VITE_API_URL=https://bottom-up-api.onrender.com/api`.
- **Deploys don't auto-trigger** (no repo webhook). After `git push`:
  `curl -X POST .../v1/services/{id}/deploys -H "Authorization: Bearer $RENDER_API_KEY" -d '{}'`.
- After `load-content.ts` against prod, clear the in-memory content cache: `POST /api/admin/reload`.

---

## G. Authored-node progress ledger
Track which chapters are fully authored. Use the §F.6 query to verify counts before marking done. **Always use
`--skip-authored` when re-running or extending a chapter.** Going forward, a node is only "done" once the §A
prereq sweep has been run on it — revisit any pre-2026-06-16-sweep node and apply the three-way decision.

Counts below are live as of **2026-06-17** (DB query). ✅ = every node 5-gate authored. Pipeline rows from
2026-06-16 that were later completed by hand are marked accordingly; "5-gate" = hand-authored full sets,
"3–4 honest-skip" = pipeline sketch-skips.

| chapter | exam | nodes authored | total | date | notes |
|---|---|---|---|---|---|
| `jemh101` | cbse10 | 18 | 18 | 2026-06-17 | ✅ Real Numbers — full |
| `jemh102` | cbse10 | 21 | 21 | 2026-06-17 | ✅ Polynomials — full |
| `jemh103` | cbse10 | 21 | 21 | 2026-06-17 | ✅ Linear Equations (pair) — full |
| `jemh104` | cbse10 | 19 | 19 | 2026-06-17 | ✅ Quadratic Equations — full (hand, 5-gate) |
| `jemh105` | cbse10 | 22 | 22 | 2026-06-17 | ✅ Arithmetic Progressions — full (hand, 5-gate) |
| `jemh106` | cbse10 | 22 | 22 | 2026-06-17 | ✅ Triangles/Similarity — full (Sonnet sub-agent authored, Opus-audited; 1 MCQ defect fixed; §A: no bridges) |
| `jemh107` | cbse10 | 22 | 22 | 2026-06-17 | ✅ Coordinate Geometry — full (Sonnet authored, Opus-audited 44/44; 1 MCQ tightened; §A: no bridges) |
| `jemh108` | cbse10 | 11 | 11 | 2026-06-17 | ✅ Introduction to Trigonometry — full (Sonnet authored, Opus-audited 22/22 clean; §A: no bridges) |
| `jemh109` | cbse10 | 19 | 19 | 2026-06-17 | ✅ Applications of Trigonometry — full (Sonnet authored, Opus-audited 38/38 clean; §A: no bridges) |
| `jemh110` | cbse10 | 20 | 20 | 2026-06-17 | ✅ Circles — full (Sonnet authored, Opus-audited 40/40 clean; §A: no bridges; mcq encoding fixed) |
| `jemh111` | cbse10 | 13 | 13 | 2026-06-17 | ✅ Areas Related to Circles — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 26/26 clean; §A: no bridges) |
| `jemh112` | cbse10 | 24 | 24 | 2026-06-17 | ✅ Surface Areas & Volumes — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 48/48 clean; combination-TSA follows NCERT sum-of-CSA convention; §A: no bridges) |
| `jemh113` | cbse10 | 23 | 23 | 2026-06-17 | ✅ Statistics — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 46/46 clean incl. all grouped-mean/median/mode formulas; §A: no bridges) |
| `jemh114` | cbse10 | 16 | 16 | 2026-06-17 | ✅ Probability — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 32/32; agent self-caught+fixed 3 equal-value-fraction MCQs, verified; §A: no bridges). cbse10 COMPLETE (jemh101-114). |
| `mathematics-ch01` | cbse12 | 14 | 14 | 2026-06-17 | ✅ Relations & Functions — full |
| `mathematics-ch02` | cbse12 | 13 | 13 | 2026-06-17 | ✅ Inverse Trig Functions — full |
| `mathematics-ch03` | cbse12 | 16 | 16 | 2026-06-17 | ✅ Matrices — full |
| `mathematics-ch04` | cbse12 | 13 | 13 | 2026-06-17 | ✅ Determinants — full (hand, 5-gate) |
| `mathematics-ch05` | cbse12 | 16 | 16 | 2026-06-17 | ✅ Continuity & Differentiability — full (hand, 5-gate) |
| `mathematics-ch06` | cbse12 | 12 | 12 | 2026-06-17 | ✅ Application of Derivatives — full (hand, 5-gate) |
| `mathematics-ch07` | cbse12 | 11 | 11 | 2026-06-17 | ✅ Integrals — full (hand + Sonnet finish, audited) |
| `mathematics-ch08` | cbse12 | 8 | 8 | 2026-06-17 | ✅ Application of Integrals — full (Sonnet authored, Opus-audited clean; §A: no bridges) |
| `mathematics-ch09` | cbse12 | 11 | 11 | 2026-06-17 | ✅ Differential Equations — full (Sonnet authored, Opus-audited 22/22 clean; §A: no bridges) |
| `mathematics-ch10` | cbse12 | 13 | 13 | 2026-06-17 | ✅ Vector Algebra — full (Sonnet authored, Opus-audited 26/26 clean; §A: no bridges) |
| `mathematics-ch11` | cbse12 | 10 | 10 | 2026-06-17 | ✅ 3D Geometry (Lines) — full (Sonnet authored, Opus-audited 20/20 clean; §A: no bridges; mcq encoding fixed) |
| `mathematics-ch12` | cbse12 | 15 | 15 | 2026-06-17 | ✅ Linear Programming — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 30/30 clean; §A: no bridges) |
| `mathematics-ch13` | cbse12 | 9 | 9 | 2026-06-17 | ✅ Probability — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 18/18 clean incl. Bayes 70/193, total-prob 0.0345; §A: no bridges). cbse12 COMPLETE. |
| `mathematics-ch11` | cbse12 | 10 | 10 | 2026-06-17 | ✅ Three Dimensional Geometry (Lines) — full (Sonnet in-session, 50 gates; §A: no bridges; 20/20 MCQ+equation answers independently verified) |
| `mathematics-ch12` | cbse12 | 15 | 15 | 2026-06-17 | ✅ Linear Programming — full (Sonnet in-session, 75 gates; §A: no bridges; self-check 0,0) |
| `maths-ch01` | jee | 18 | 18 | 2026-06-17 | ✅ Sets — full |
| `maths-ch02` | jee | 14 | 14 | 2026-06-17 | ✅ Relations & Functions — full |
| `maths-ch03` | jee | 23 | 23 | 2026-06-17 | ✅ Trigonometric Functions — full (hand, 5-gate) |
| `maths-ch04` | jee | 18 | 18 | 2026-06-17 | ✅ Complex Numbers & Quadratics — full (hand, 5-gate) |
| `maths-ch05` | jee | 11 | 11 | 2026-06-17 | ✅ Linear Inequalities — full (hand, 5-gate, audited) |
| `maths-ch06` | jee | 12 | 12 | 2026-06-17 | ✅ Permutations & Combinations — full (Sonnet authored, Opus-audited 24/24 clean; §A: no bridges) |
| `maths-ch07` | jee | 12 | 12 | 2026-06-17 | ✅ Binomial Theorem — full (Sonnet authored, Opus-audited 24/24 clean; §A: no bridges) |
| `maths-ch08` | jee | 12 | 12 | 2026-06-17 | ✅ Sequences & Series — full (Sonnet authored, Opus-audited 24/24 clean; §A: no bridges) |
| `maths-ch09` | jee | 16 | 16 | 2026-06-17 | ✅ Straight Lines — full (Sonnet authored, Opus-audited 32/32 clean; agent self-fixed inclination 2-correct MCQ; §A: no bridges; mcq encoding fixed) |
| `maths-ch10` | jee | 19 | 19 | 2026-06-17 | ✅ Conic Sections — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 38/38 clean incl. eccentricity/latus-rectum; §A: no bridges) |
| `maths-ch11` | jee | 12 | 12 | 2026-06-17 | ✅ Intro to 3D Geometry — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 24/24 clean incl. equidistant-plane derivation; §A: no bridges) |
| `maths-ch12` | jee | 16 | 16 | 2026-06-17 | ✅ Limits & Derivatives — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 32/32; 1 two-correct MCQ fixed [15/10≡3/2]; §A: no bridges) |
| `maths-ch13` | jee | 12 | 12 | 2026-06-17 | ✅ Statistics — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 24/24 incl. variance/SD; 1 ambiguous MCQ fixed [symmetric-vs-spread]; §A: no bridges) |
| `maths-ch14` | jee | 17 | 17 | 2026-06-17 | ✅ Probability — full (Sonnet authored w/ corrected encoding, self-check 0,0; Opus-audited 34/34 clean; agent self-fixed slot-naming sketch→sketch1/2, verified 5 gates/node; §A: no bridges). jee COMPLETE (maths-ch01-14). |
| `maths-ch09` | jee | 16 | 16 | 2026-06-17 | ✅ Straight Lines — full (Sonnet sub-agent authored, Opus-audited 32/32 MCQ+equation; 1 MCQ defect fixed (inclination MCQ had 2 valid options); §A: no bridges — trig/angle/ordered-pair prereqs satisfied by ch01–ch03 upstream; source=NULL Phase-1) |
| `maths-ch11` | jee | 12 | 12 | 2026-06-17 | ✅ Introduction to 3D Geometry — full (Sonnet sub-agent authored, Opus-audited 12/12 MCQ + 12/12 equation all verified; §A: no bridges — all terms in-chapter or upstream ch09; self-check 0,0; source=NULL Phase-1) |
| `maths-ch10` | jee | 19 | 19 | 2026-06-17 | ✅ Conic Sections — full (Sonnet sub-agent authored, Opus-audited 38/38 MCQ+equation; §A: no bridges — distance formula satisfied by ch09, completing-the-square by ch04; source=NULL Phase-1; self-check 0,0) |
| `jemh110` | cbse10 | 20 | 20 | 2026-06-17 | ✅ Circles — full (Sonnet sub-agent authored, Opus-audited 40/40 MCQ+equation; §A: no bridges — all terms satisfied in-chapter or via jemh106:apply-aaa-aa-criterion cross-chapter prereq; source=NULL Phase-1) |
| `jemh111` | cbse10 | 13 | 13 | 2026-06-17 | ✅ Areas Related to Circles — full (Sonnet sub-agent authored, Opus-audited 26/26 MCQ+equation clean; §A: no bridges — trig ratios satisfied by jemh108, perpendicular-bisects-chord by jemh110; source=NULL Phase-1) |

| `jemh112` | cbse10 | 24 | 24 | 2026-06-17 | ✅ Surface Areas and Volumes — full (Sonnet in-session, 120 gates; §A: no bridges — Pythagoras from jemh107, Class-IX formulas inline-glossed; self-check 0,0; source=NULL Phase-1) |

| `maths-ch12` | jee | 16 | 16 | 2026-06-17 | ✅ Limits and Derivatives — full (Sonnet sub-agent authored, Opus-audited 32/32 MCQ+equation clean; §A: no bridges — polynomials/trig from ch01–ch03 upstream, binomial theorem inline-glossed; self-check 0,0; source=NULL Phase-1) |
| `maths-ch13` | jee | 12 | 12 | 2026-06-17 | ✅ Statistics — full (Sonnet in-session, 60 gates, 12 nodes × 5 slots; §A: no bridges — all terms either standard pre-JEE arithmetic or taught within chapter DAG; self-check 0,0; source=NULL Phase-1) |

| `jemh114` | cbse10 | 16 | 16 | 2026-06-17 | ✅ Probability — full (Sonnet sub-agent authored, Opus-audited 16/16 MCQ+equation; 3 MCQ defects fixed post-audit [12/52≡3/13, 2/6≡1/3, 26/52≡1/2 duplicate-value distractors]; §A: no bridges — fraction arithmetic from jemh101, area from jemh111, counting from primary school; self-check 0,0; source=NULL Phase-1) |

| `maths-ch14` | jee | 17 | 17 | 2026-06-17 | ✅ Probability — full (Sonnet in-session, 85 gates; §A: no bridges — all set-ops from ch01, combinations from ch06, sample-space inline-glossed in bedrock node; self-check 0,0; source=NULL Phase-1) |

**✅ PHASE-1 CORPUS COMPLETE (2026-06-17).** Every maths chapter is authored + Opus-audited: **cbse10
`jemh101`–`jemh114` (14), cbse12 `mathematics-ch01`–`ch13` (13), jee `maths-ch01`–`maths-ch14` (14) = 41
chapters.** Nothing left "not yet started." Final corpus verification (all `kind='authored'`): **3088 gates
across 644 concepts; 0 mcq bad-shape, 0 mcq correct-not-in-options, 0 stray slots, 0 null sketch rubrics.**
The only nodes without exactly 5 gates are the 70 legitimate "honest sketch-skips" in the original pipeline
chapters (jemh101–103, ch01–03, jee ch01–02) — 3–4 gates each, pre-existing, not a defect. Every
Sonnet-sub-agent chapter authored this session has exactly 5 gates/node, correct encoding, and source=NULL
(Phase-1). **Remaining work is Phase 2 only** (constraint #7, deferred): web/NCERT-OCR research + per-gate
`source` + rigorous §A backlog clear — a future full re-run, no compute spent now.

**Prereq-sweep backlog:** all rows above were authored before §A became mandatory — they accepted "prereqs ok"
without the rigorous term sweep. Revisit each, run §A, and apply AUTHOR-bridge / DEFER / INLINE-GLOSS as needed
(light prose-softening on existing audited prose, not full re-gating).

**✅ TARGETED IMPROVEMENT PASS over the 8 original-pipeline chapters (2026-06-17)** — `jemh101/102/103`,
cbse12 `ch01/02/03`, jee `maths-ch01/02`. These predate both the 5-gate standard and the mandatory §A sweep,
so we cherry-picked the two highest-value author-and-improve passes WITHOUT a full re-run (Sonnet authored,
Opus audited each). Results (DB-verified — figures are ground truth; note two sub-agents over-reported their
own sketch counts in prose, corrected here):
- **Deserved-sketch pass:** **58 sketch gates** added to pre-existing nodes where a drawing materially teaches
  (Venn diagrams in Sets; inverse-trig graphs + restricted-domain diagrams; arrow/grid diagrams for
  relations/functions; number-lines + factor-trees in Real Numbers; m×n grid / diagonal structure in
  Matrices). Conservatively SKIPPED nodes that are purely symbolic/notational OR whose visual is already owned
  by a dedicated graph node (jemh102 & jemh103 correctly got 0 — their graphical content lives in
  `interpret-zero-as-x-intercept`/`count-zeroes-from-graph` and `identify-consistent-inconsistent-dependent`/
  `solve-graphically`). Per-chapter sketches added: jemh101 9, jemh102 0, jemh103 0, ch01 8, ch02 18, ch03 4,
  jee-ch01 10, jee-ch02 9.
- **§A prereq pass:** **1 bridge node created** — `jee:maths:maths-ch01:count-subsets-and-power-set` (teaches
  power set + the 2^n-subsets rule, which was USED in `determine-subset-relations`'s gate but taught nowhere;
  now wired upstream of it, and already consumed cross-chapter by `jee:maths:maths-ch02:count-relations`). Plus
  **10 missing prereq EDGES** fixed in content.json (jemh101 2, jemh102 1, jemh103 4, ch03 1, jee-ch02 2).
  No other bridges needed — remaining assumed terms were genuine prior-grade bedrock or in-chapter upstream.
- **Net:** corpus 3088→**3151** authored gates, 644→**645** concepts. Final verification across ALL authored
  gates: 0 mcq bad-shape, 0 correct-not-in-options, 0 stray slots, 0 null sketch rubrics. The remaining
  sub-5-gate nodes are deliberate, justified sketch-skips (purely symbolic concepts). This pass did NOT touch
  any existing explanation or gate, and did NOT do web research (still Phase-1; source=NULL on new gates).

**⚠ GATE-ENCODING FIX (2026-06-17) — resolved corpus-wide.** Discovered every chapter authored this session
by hand/sub-agent encoded `mcq.expected.options` in a BROKEN shape (`[{key,text}]` array or `{A:..}` object
with `correct` = a letter) instead of the live-grader contract (string array + full-text `correct`). The math
was correct; the encoding rendered `[object Object]` and never graded in the app. Also sketch gates had null
`rubric`/`ideal_answer` columns (degraded vision grading). **Fixed by deterministic bulk SQL** (4 transforms,
no re-authoring): shape-A array→strings, shape-B object→strings, sketch rubric/ideal column backfill, explain
ideal backfill. Verified 0 bad-shape / 0 correct-not-in-options / 0 null-sketch-rubric across all completed
chapters. Root cause (drifted shape) corrected in the ⛔ GATE ENCODING callout in §pipeline above. Diagnostic
to re-run after ANY chapter:
```sql
-- every authored mcq must be array-of-strings with correct ∈ options; sketch/explain must have rubric
SELECT count(*) FILTER (WHERE NOT (jsonb_typeof(expected->'options')='array' AND jsonb_typeof(expected->'options'->0)='string')) AS bad_shape,
       count(*) FILTER (WHERE jsonb_typeof(expected->'options')='array' AND NOT (expected->'options' ? (expected->>'correct'))) AS correct_not_in_opts
FROM gates WHERE answer_type='mcq' AND kind='authored';
```

**Phase-1-only worklist (for the MANDATORY Phase-2 research pass — constraint #7).** These chapters were
authored in the 2026-06-17 in-session/Sonnet-sub-agent completeness pass: math-verified + NCERT-*content*-
grounded, but with **NO fresh web research, `source = NULL` on every gate, and NO rigorous §A term-sweep /
bridge-node creation.** Phase 2 owes all of them: web+NCERT-OCR research, per-gate `source`, and the §A sweep.
- cbse10: `jemh104`, `jemh105`, `jemh110`, `jemh111`
- cbse12: `mathematics-ch04`, `ch05`, `ch06`, `ch07`, `ch12`
- jee: `maths-ch03`, `maths-ch04`, `maths-ch05`, `maths-ch10`, `maths-ch11`, `maths-ch12`, `maths-ch14`
- (Going forward, NEW chapters in this pass DO get the §A sweep + bridge nodes per constraint #6 — only the
  web-research/`source` half is deferred to Phase 2. Add each new chapter here as it is authored.)

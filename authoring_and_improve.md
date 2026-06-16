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

### Authoring stands at (2026-06-17 — in-session hand authoring, NO API)
See the §G ledger for exact counts (refreshed 2026-06-17 from a live DB query, not the stale 2026-06-16
snapshot). **Many more chapters are now FULLY 5-gate authored than the old ledger implied** — authored directly
in a Claude Code session (hand-written gates straight into Neon, `kind='authored'`, no `generate-gates.ts`, no
ANTHROPIC_API_KEY spend), so they were never reflected here until now. **Fully authored (every node):**
cbse10 `jemh101`–`jemh104`; cbse12 `mathematics-ch01`–`ch06`; jee `maths-ch01`–`ch04`. **In progress:**
cbse10 `jemh105` (20/22), cbse12 `ch07` (9/11), jee `maths-ch05` (10/11).

> **DUPLICATE-WORK GUARD (read before running the pipeline).** A node counts as already-authored iff it has
> any `gates` row with `kind='authored'` (the upsert id is `<conceptId>:<slot>`). **`generate-gates.ts`
> `--skip-authored` skips exactly those concepts** — so it will NOT revisit or clobber any hand-authored node.
> **Always pass `--skip-authored`** when re-running/extending (without it the tool clean-slate re-authors:
> deletes + rewrites). The hand-authored nodes carry the full 5-gate set (no honest sketch-skips), whereas the
> 2026-06-16 pipeline nodes legitimately have 3–4 gates (contrived sketches skipped) — both are "authored" and
> both are skipped. **Next:** finish the three in-progress chapters, then continue cbse10 `jemh106+`,
> cbse12 `ch08+`, jee `maths-ch06+`; run the §A prereq sweep on every node.

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

## ★ The PROVEN authoring pipeline (use this)

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
The bar to match, per gate (these are the proven, in-scope sets — **73 authored gates across 17 concepts** for
the chapter):
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
| `jemh105` | cbse10 | 20 | 22 | 2026-06-17 | Arithmetic Progressions — IN PROGRESS (2 left: solve-simultaneous-equations, factor-quadratic) |
| `mathematics-ch01` | cbse12 | 14 | 14 | 2026-06-17 | ✅ Relations & Functions — full |
| `mathematics-ch02` | cbse12 | 13 | 13 | 2026-06-17 | ✅ Inverse Trig Functions — full |
| `mathematics-ch03` | cbse12 | 16 | 16 | 2026-06-17 | ✅ Matrices — full |
| `mathematics-ch04` | cbse12 | 13 | 13 | 2026-06-17 | ✅ Determinants — full (hand, 5-gate) |
| `mathematics-ch05` | cbse12 | 16 | 16 | 2026-06-17 | ✅ Continuity & Differentiability — full (hand, 5-gate) |
| `mathematics-ch06` | cbse12 | 12 | 12 | 2026-06-17 | ✅ Application of Derivatives — full (hand, 5-gate) |
| `mathematics-ch07` | cbse12 | 9 | 11 | 2026-06-17 | Integrals — IN PROGRESS (2 left: ftc-area-function, fundamental-theorem-evaluation) |
| `maths-ch01` | jee | 18 | 18 | 2026-06-17 | ✅ Sets — full |
| `maths-ch02` | jee | 14 | 14 | 2026-06-17 | ✅ Relations & Functions — full |
| `maths-ch03` | jee | 23 | 23 | 2026-06-17 | ✅ Trigonometric Functions — full (hand, 5-gate) |
| `maths-ch04` | jee | 18 | 18 | 2026-06-17 | ✅ Complex Numbers & Quadratics — full (hand, 5-gate) |
| `maths-ch05` | jee | 10 | 11 | 2026-06-17 | Linear Inequalities — IN PROGRESS (1 left: solve-and-apply-linear-inequalities goal) |

**Not yet started (loaded + book gate only):** cbse10 `jemh106`–`jemh114`; cbse12 `mathematics-ch08`–`ch13`;
jee `maths-ch06`–`maths-ch14`. Point the pipeline (with `--skip-authored`) at these — the done chapters above
will be skipped automatically.

**Prereq-sweep backlog:** all rows above were authored before §A became mandatory — they accepted "prereqs ok"
without the rigorous term sweep. Revisit each, run §A, and apply AUTHOR-bridge / DEFER / INLINE-GLOSS as needed
(light prose-softening on existing audited prose, not full re-gating).

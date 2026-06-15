# how_to_author_nodes.md — the node-authoring playbook

How we turn a raw concept node into a **comprehensively authored, gated teaching node** —
the exact, repeatable process first proven on **CBSE 10 Maths Ch.1 (`jemh101`)** and now
generalised to every math exam in the corpus (cbse10, cbse12, jee).

> Read this with `bottom_up.md` (the living spec — what a node *is* and how it's *used*).
> This file is the **operator's manual**: the commands, the prompts, the API research loop,
> and the quality bar. It is intentionally concrete so any future chat can reproduce it.

---

## 0. What "authoring a node" means

A loaded concept node already has its **brain** (brief, explanation, key moves, misconceptions,
prereqs) imported from the Socratic corpus, plus **one book gate** lifted from `exam.json`.
That is enough to *teach* — but not enough to *measure mastery well*. "Authoring" is the step
that gives a node a **professional, web-researched, 5-gate assessment set** so passing the node
actually proves the learner can do the thing, in five different ways.

**The 5-gate requirement (one set per concept):**

| slot | answerType | grader | what it asks |
|---|---|---|---|
| `sketch1` | sketch | vision | draw/construct — a diagram, factor tree, number line, graph, figure |
| `sketch2` | sketch | vision | a **second, different** drawing/visual task |
| `explain` | written | rubric | long-form explanation *in the learner's own words* |
| `mcq` | mcq | mcq | single-best-answer, 4 options |
| `equation` | symbolic | cas | a harder compute/prove problem with an exact answer |

**Leeway (important):** a slot that genuinely doesn't fit a concept may be **skipped** with a
recorded `skipReason`. The author does this correctly for purely algebraic/proof concepts —
e.g. irrationality proofs skip the sketch slots because there is nothing meaningful to draw.
A skipped slot is a deliberate, logged decision, never a silent gap.

Each authored gate stores **four extra fields beyond the question** so it is auditable and
gradable: `idealAnswer`, `why`, `rubric` (sketch/explain only), and `source` (the research URLs).

---

## 1. The pipeline at a glance

```
concept (in DB)
   │
   ├─(a) RESEARCH   Firecrawl /v1/search  → real exam/question-bank hits (title, url, snippet)
   │                  query = "<concept title> <exam-specific search tag>"
   │
   ├─(b) AUTHOR     Claude Haiku (claudeAuthor) given:
   │                  • the concept brain (brief/explanation/keyMoves/misconceptions)
   │                  • the research hits (for inspiration — "adapt, don't copy")
   │                  • the exam persona + level (CBSE 10 / CBSE 12 / JEE)
   │                → STRICT JSON: { sketch1, sketch2, explain, mcq, equation }
   │
   └─(c) UPSERT     each slot → one row in `gates` (kind='authored'),
                      idempotent on gate id `<conceptId>:<slot>`
```

All of it lives in **`tools/generate-gates.ts`**. Authoring uses **Claude Haiku** (cheap — the
HARD cost rule), research uses **Firecrawl**. Both keys are in `.env`.

---

## 2. The exact commands (how we ran it)

Author the **first 5 nodes** (bottom-up order) of a chapter — the scope of the current milestone:

```bash
# dry-run first: see the prompts/targets without spending tokens or writing rows
node_modules/.bin/tsx tools/generate-gates.ts cbse12:mathematics:mathematics-ch01 --limit 5 --dry

# real run: research + author + upsert 5 gates × 5 concepts
node_modules/.bin/tsx tools/generate-gates.ts cbse12:mathematics:mathematics-ch01 --limit 5
node_modules/.bin/tsx tools/generate-gates.ts jee:maths:maths-ch01 --limit 5
node_modules/.bin/tsx tools/generate-gates.ts cbse10:maths:jemh101            # (Ch.1 already fully authored)

# a single concept (debugging one node):
node_modules/.bin/tsx tools/generate-gates.ts cbse10:maths:jemh101:prime-factorise-integer --dry
```

- **`--limit N`** keeps the run to the first N concepts in **bottom-up order** (`concept.order`),
  which is exactly "the first 5 nodes." Omit it to author a whole chapter.
- **`--dry`** prints what would be authored and writes nothing — always do this first.
- The target can be a **chapterId** (`exam:subject:chapter`) or a **conceptId** (`…:slug`).
- Idempotent: re-running upserts by `gates.id`, so it's safe to re-run a chapter.

### Prerequisite: the content must be in the DB first

`generate-gates.ts` reads concepts **from the DB**, not from disk. So the corpus has to be
loaded first:

```bash
node_modules/.bin/tsx tools/load-content.ts            # every exam/subject under content/
node_modules/.bin/tsx tools/load-content.ts cbse12     # or just one exam (prefix filter)
```

`load-content.ts` walks `content/<exam>/<subject>/<chapter>/{content.json,exam.json}`,
computes the **bottom-up topological order** (prereqs first, tie-broken by `sec` then title),
and upserts `chapters`, `concepts`, and the single book gate per node.

---

## 3. How the research → author step actually works (the quality engine)

This is the part the user means by *"research using APIs to improve the content, improve gates."*

### (a) Research — `research(topic, profile)`
Calls Firecrawl `POST /v1/search` with `"<concept.title> <profile.searchTag>"`. The **searchTag
is exam-specific** so JEE pulls JEE-grade problems, not Class-10 ones:

| exam | persona | level | search tag |
|---|---|---|---|
| `cbse10` | expert CBSE Class 10 Maths assessment author | CBSE Class 10 (NCERT) level | `CBSE class 10 maths exam questions with solutions` |
| `cbse12` | expert CBSE Class 12 Mathematics assessment author | CBSE Class 12 (NCERT) level | `CBSE class 12 maths board exam questions with solutions` |
| `jee` | expert JEE (Main & Advanced) Mathematics problem author | JEE Main/Advanced level | `JEE main advanced maths problems with solutions` |

Returns up to 4 hits (`title`, `url`, `snippet`). The URLs are stored on every gate as `source`,
so a reviewer can trace where the inspiration came from. *(Note: Firecrawl sometimes returns
social/aggregator links; the question quality comes from Haiku grounded in the textbook brain,
the web hits are only for "what do real exams ask." A future improvement is to bias the query
toward question banks / past papers and filter low-quality domains.)*

### (b) Author — `authorPrompt(concept, hits, profile)` → `claudeAuthor` (Haiku)
- **System prompt** sets the exam persona and demands STRICT JSON, grounded in NCERT, never
  inventing facts outside the concept.
- **User prompt** hands over the full concept brain + the research block + the five slot specs,
  and asks for, per slot: `prompt`, `idealAnswer`, `why`, `rubric` (sketch/explain),
  `options`+`correct` (mcq), `expectedValue` (equation), or `skip`+`skipReason`.
- 2600 max tokens; parsed tolerantly with `parseLooseJson` (handles code fences / stray prose).

### (c) Upsert — `upsertGate(...)`
Maps each slot to a `gates` row. The `expected` JSON (server-only at runtime) is shaped per type:
- mcq → `{ kind:'mcq', correct, options }`
- equation → `{ kind:'symbolic', equivalentTo: expectedValue, ideal: idealAnswer }`
- sketch/explain → `{ kind:<answerType>, ideal: idealAnswer, rubric }`

Plus the human-facing columns `idealAnswer / why / rubric / source` and the ordering `slot` + `ord`.

---

## 4. What "comprehensive" looked like for cbse10's first 3 nodes (the gold reference)

The standard every new exam is held to. From `jemh101`:

- **`know-prime-composite-coprime`** (bedrock) — MCQ on the meaning of coprime, an explain gate
  on *why* HCF=1 defines coprime, sketches of a Venn/number-line of common factors, an equation
  reducing a fraction to coprime form.
- **`prime-factorise-integer`** — sketch1 = a **factor tree for 360**, sketch2 = a **different
  factor tree (1260)**, explain = "what prime factorisation means and why it's unique",
  mcq = pick the correct factorisation of 2520, equation = factorise 1890 to powers of primes.
  Every gate carries an `idealAnswer`, a checklist `rubric` (for the graded-by-vision/rubric ones),
  and the research `source`.
- **`state-fundamental-theorem-arithmetic`** — existence + uniqueness, with the MCQ on
  "unique apart from the order of factors."

Result on Ch.1: **73 authored gates across 17 concepts**, with sketch slots correctly skipped on
the proof concepts. That is the bar: every gate is answerable from *this* concept, unambiguous,
exam-grade, and stored with its ideal answer + rubric + provenance.

---

## 5. Verify after every run

```sql
-- per-concept slot coverage for a chapter
SELECT concept_id,
       count(*) FILTER (WHERE slot LIKE 'sketch%') AS sketch,
       count(*) FILTER (WHERE slot='explain')      AS explain,
       count(*) FILTER (WHERE slot='mcq')          AS mcq,
       count(*) FILTER (WHERE slot='equation')     AS eqn
FROM gates
WHERE kind='authored' AND concept_id LIKE 'cbse12:mathematics:mathematics-ch01%'
GROUP BY concept_id ORDER BY concept_id;
```

Then **spot-read 2-3 gates by eye** (don't trust the count alone): is the prompt unambiguous?
does `idealAnswer` actually answer it? is the MCQ's `correct` one of its `options`? does the
equation's `expectedValue` match the worked `idealAnswer`? Skipped slots should have a sane
`skipReason`, not be missing by accident.

```sql
SELECT slot, answer_type, left(prompt,80), left(ideal_answer,60), left(source,50)
FROM gates WHERE concept_id='cbse12:mathematics:mathematics-ch01:relation-definition' AND kind='authored'
ORDER BY ord;
```

---

## 6. Scope discipline (current milestone)

- **First 10 nodes authored per maths exam** (cbse10, cbse12, jee), **math only**. Run:
  `tsx tools/generate-gates.ts <exam>:<subject>:<chapter1> --limit 10`. (Was 5; raised to 10 once
  the process held. cbse10 ch1 already has all 17.)
- Everything else is *loaded* (full content + book gate) but not yet 5-gate authored — those
  nodes still teach and still gate on their single book question.
- Scale to more nodes/chapters only after these slices are reviewed and the quality holds.

### 6a. Advanced tracks (JEE Advanced) — DO NOT author yet

- The schema supports an **advanced overlay** per node: `concepts.advanced_content` (extra reading/depth)
  and `gates.tier = 'advanced'` (harder gate questions), surfaced only on the advanced track
  (`track='advanced'` → `examProfile(conceptId,'advanced')`, `gateSet` appends advanced gates,
  `teachTurn` folds in `advancedContent`). `generate-gates.ts` authors **foundation tier by default**.
- **Hard rule:** do **NOT** author any JEE-Advanced content or advanced gates **until explicitly told**.
  We are waiting to review the **government-recommended resources** for JEE Advanced first, then those
  resources become the source for the advanced overlay. Until then the advanced fields stay **empty**
  and JEE Advanced is **not** exposed as a selectable track in the UI.
- The same holds for any future "beyond-the-book" advanced sections: fill the overlay only from a
  real, approved resource — never invent advanced material.

## 7. Cost rule (HARD — never break)

- Authoring → **Claude Haiku** via `claudeAuthor()`. Never a stronger model for bulk authoring.
- Real-user teaching → Haiku. All automated testing → NVIDIA NIM (free) / `mock`.
- **Never run a test suite on Haiku.** At most 1-2 Haiku messages for a manual spot-check.

---

## 8. Content audit — findings from the first 2 nodes of each maths exam (2026-06-16)

A hand audit of the first two authored nodes of cbse10 (`manipulate-prime-powers`, `interpret-divides-relation`),
cbse12 (`relation-definition`, `empty-relation`), and jee (`define-a-well-defined-set`, `use-set-membership`).
These are the **recurring failure modes** to fix in the author prompt / a review pass — the single most useful
thing for raising quality.

### 8.1 The biggest systemic problem: gates over-reach the node's own scope + prereqs
The author keeps writing gates that test **downstream** concepts the node doesn't own and the learner hasn't met:
- `manipulate-prime-powers` (scope: *evaluate/compare prime powers*) — **4 of its 5 gates are actually HCF/LCM
  problems** (the explain, mcq, and equation all compute HCF/LCM). HCF/LCM are separate, later nodes.
- `interpret-divides-relation` (scope: *read `p|a` as `a = p·k`*) — its **equation gate asks for a full proof of
  "if `p | a²` then `p | a`"** (Euclid's-lemma / Theorem 1.2), a deep result that is itself a later *goal* node.
- `use-set-membership` (scope: *`∈` / `∉`*) — its **equation gate uses `A ∩ B` and `A ∪ B`** (union/intersection
  are later nodes).
- **Fix:** the author prompt must say *"every gate must be answerable from THIS node's keyMoves alone, using only
  ideas at or below its bottom-up order — do NOT use any later concept (HCF/LCM, proofs, set operations, etc.)."*
  Pass the node's `order` and a one-line "you may assume only:" list of already-taught ideas.

### 8.2 Model answers leak chain-of-thought / self-correct / are wrong (worst defect found)
- **`cbse12 … empty-relation`, equation gate** is broken: prompt asks to test `R = {(a,b): a²−b²=24}` on `{1..5}`.
  The stored `idealAnswer` **opens with "$R = \emptyset$ (empty relation)", then mid-answer writes "Wait: (5,1)
  gives 24 ✓. So R = {(5,1)}, non-empty."** So the model answer contradicts itself, starts with a wrong claim,
  and (for an *empty-relation* node) resolves to a **non-empty** relation. The author's scratch reasoning leaked
  into the stored answer. This would confuse a learner and fail any review. **Must be re-authored.**
- **Fix:** instruct *"idealAnswer is the FINAL, clean answer only — no 'Wait', no 'let me reconsider', no working
  that you then retract."* And add a validator: for a concept about X (e.g. *empty* relation), the worked example's
  answer should actually exemplify X, or the prompt should be changed.

### 8.3 Difficulty mismatched to a foundational (order 0/1) node
Proofs and multi-part problems are landing on the very first nodes (the `p|a²⟹p|a` proof above; the 4-part
true/false + union problem on `use-set-membership`). First-nodes should be gentle. **Fix:** scale difficulty to
`order` — early nodes get single-step items; save multi-step/proof items for later nodes.

### 8.4 Smaller issues
- **MCQ with compound (conjunction) options** — `use-set-membership` mcq options are each "`X ∈ M` and `Y ∉ M`",
  which is harder to parse than a single claim. Prefer one assertion per option.
- **`equivalentTo` sometimes holds prose, not a value** — the `p|a²` proof gate stores a paragraph in
  `equivalentTo`; that silently downgrades CAS grading to LLM-equivalence. Proof/derivation items should be
  authored as `written` (rubric-graded), not `equation`/symbolic.
- **Rubric format drift** — most rubrics are "✓ …" checklists, but one (`jee define-a-well-defined-set` explain)
  was stored as a serialized array. Keep rubrics as a single "✓ … ✓ …" string.
- **Weak source provenance** — research often returns Instagram/YouTube reels rather than real question banks.
  Bias the Firecrawl query to past papers / official question banks and prefer authoritative domains; the source
  URLs are stored on every gate, so junk sources are visible.

### 8.5 What's already good (emulate these)
- **`cbse12 relation-definition`** — every gate stays in-scope; the mcq ("which is NOT a valid relation", with an
  option whose pairs come from `B×A`) genuinely tests "subset of `A×B`"; the equation ("how many relations? `2⁶`")
  is elegant and on-concept.
- **`jee define-a-well-defined-set`** — correctly **skips** both sketch slots (logical concept), and the equation
  ("how many of these 4 collections are well-defined?") reuses the concept cleanly.

### 8.6 Action
- Re-author the `cbse12 … empty-relation` equation gate (8.2) — it's the one outright-broken artifact.
- Fold the 8.1 scope-guard and 8.2 clean-answer rules into `authorPrompt` in `generate-gates.ts` before the next
  authoring batch; re-run the affected first-2 nodes to validate the guardrails hold.

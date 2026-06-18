# dont_assume.md — the no-assumption doctrine

The single rule that governs both how the tutor **talks** (runtime) and how the corpus is **authored**:

> **Nothing novel is ever used without first refreshing it, confirming it with a quick gate, and
> staying on it until the student understands.** Only after that is it allowed to be assumed —
> downstream, in later nodes and chapters, as "learned and easily recalled."

"Novel" = any term, symbol, notation, or fact the student has **not been taught earlier in _this
course_.** It does not matter that they "should" know it from a previous year or a different course.
If this course hasn't taught it yet, it is novel here.

---

## 1. Course isolation (read this first)

Prerequisite knowledge is **scoped to each course.** A course is self-contained.

- **Never** assume that because something is covered in CBSE 10, CBSE 12 (or JEE) can skip it.
- A CBSE 12 student is assumed to be **starting Class 11** (per our "who this is for" line), so prior-year
  material gets a **refresher**, not a cold assumption — and a **prerequisite node** if it's load-bearing
  and missing.
- Inference Engineering has **no prior course at all.** Everything it ever mentions must be taught
  somewhere earlier in IE itself. There is no "they learned this elsewhere."

So: `cbse10` knowledge ≠ `cbse12` knowledge ≠ `jee` knowledge ≠ `ie` knowledge. Each course's
prerequisite graph stands alone.

---

## 2. Runtime rule (the tutor, every turn)

Before the tutor **uses** any novel term/symbol/fact:

1. **Refresh** it in one plain-English sentence with one tiny concrete example.
2. **Confirm with a light gate question** — warm, low-stakes: *"You've probably seen this before, but
   quick check so we're on the same page: …?"*
3. **Stay on it** until they actually show they understand. If unsure/wrong: slow down, simpler example,
   smaller question. Never make them feel behind.
4. Only then build on it.

Worked example of the failure this prevents (real): teaching $2^3$, the tutor said *"squared", "cubed",
"exponent"* as if known. Correct behaviour: *"That little 3 is called the **exponent** — it just counts how
many times we multiply. Quick check: in $2^3$, which number is the exponent?"* — then wait.

This applies to **prior-year** vocabulary too (squared, cubed, exponent, factor, HCF, place value, …):
refresh + confirm, don't assume.

### 2a. The Socratic loop: surface ignorance → confess → fill → return (the lesson's heartbeat)

Refresh-and-confirm is the floor. The move that produces real understanding — and makes the lesson feel like a
**conversation with a teacher rather than a chatbot reciting facts** — is the loop **surface ignorance →
confess → fill → return.** This is the **default rhythm of the whole lesson, run as often as possible**, on
small gaps and large, not an occasional flourish. Each turn, prefer to *open with a question* that walks the
student to the edge of their own knowledge and lets them *say "I don't actually know"* — that confession is the
teaching moment; only then do you fill, then you **return** to the main line. Don't pre-explain what you could
first ask.

- **Surface, don't pre-empt.** Before explaining a bedrock term the node leans on, ask the **"why/what"**:
  *"Quick one — why do you think we call $2^3$ '2 **cubed**'?"* Let them try. "I'm not sure" is the goal, not a
  failure — name it warmly: *"Perfect, that's exactly the thing worth nailing down."*
- **Ladder down to the floor.** If they're unsure, descend with smaller questions until you find what they
  *do* know, then build up: *what's a cube? how's it different from a line or a square? how many dimensions? what's
  a dimension?* Go only as deep as the gap.
- **Fill comprehensively, from the ground up.** Once the floor is found, give the complete, elementary answer —
  e.g. a dimension is an independent direction; line = 1-D, square = 2-D, cube = 3-D; $2^3 = 2\times2\times2$ is a
  cube's volume, three factors for three dimensions → "cubed" (and $2^2$ = a square's area → "squared").
- These foundational fills are **authored ahead of time as refresher items** on the node
  (authoring_and_improve.md §A.5) so the tutor has a grounded, comprehensive answer ready — not improvised.

### 2b. Track the conversation's points and tangents; return to the anchor seamlessly

Filling a gap means **deliberately leaving the main line** for a moment. That detour is good — but it must be
*closed*, not abandoned.

- **Hold the anchor.** At all times keep the **main point in flight** (the key move the lesson is on). A
  refresher, a student's "wait, but what about…", a worked sub-example — each is a *tracked tangent*, opened on
  purpose, with a known place to come back to.
- **One open tangent at a time.** Don't stack detours. Resolve the current sub-gap before opening another.
- **Return seamlessly.** When a tangent concludes, **name the bridge back** in one clause and resume the exact
  thread: *"So — three dimensions, three factors, that's 'cubed'. Right, back to where we were: …"* The student
  should feel the lesson never lost its place.
- This is **not** drift. Off-topic wandering still gets warmly redirected; a foundational detour *needed to
  understand this very concept* is in-scope, intentional, and tutor-led — the difference is whether it serves
  the anchor and gets closed.

---

## 3. Authoring rule (the corpus)

A node is **not done** until every load-bearing idea it uses is either taught by an **earlier node in the
same course**, or carried by a short in-node refresher for genuinely pre-curriculum common knowledge.

When a node assumes something untaught, choose:

- **Refresher (maths, prior-year material):** the earlier idea exists in the wider syllabus and a CBSE-12/JEE
  student plausibly met it in Class ≤10. Add a brief refresh beat inside the node AND wire the prerequisite
  link — but if it's truly load-bearing and a learner could be stuck, prefer a node.
- **Refresher item (pre-curriculum bedrock with NO upstream):** the term is "assumed school knowledge" owned by
  no node in this course in *either* direction — and there may be no earlier node at all (node 0 / chapter 0,
  e.g. *why* $2^3$ is "cubed"). Author a tutor-private, fully-scaffolded **refresher item** per
  [authoring_and_improve.md](authoring_and_improve.md) §A.5 (the fourth §A outcome) — surfacing question +
  sub-question ladder + comprehensive answer + return cue — deployed at runtime by the §2/§2a method above.
- **Prerequisite / bridge node:** the idea is load-bearing and not taught anywhere earlier in this course.
  Author a full node for it (role `bedrock`), placed before its dependents, and link it. **For IE this is the
  default** — with no prior course, most assumed concepts need a real node.

Both happen in the DB **and** `content/*.json` (kept in sync), union-only, per
[authoring_and_improve.md](authoring_and_improve.md) §A. Mirror any IE-relevant change into IE's
`authoring_process.md` / `dont_assume.md`.

### How to run the sweep (no external API — Claude Code Sonnet subagents only)
For each course, in teaching order, for each node: list the terms/symbols/facts its explanation uses →
flag any not introduced by an earlier node in **the same course** → for each flag, add a refresher or author
a bridge node → re-check downstream so the now-taught idea is assumed correctly thereafter. Maths is mostly
refreshers + the occasional missed prereq node; **IE is expected to spawn many new prerequisite nodes.**

---

## 4. Execution plan — RUN LATER (not yet). Opus-directed, no external API.

> Status: **planned, not started.** Do not run until told. When run, use **Claude Code Sonnet subagents only**
> — never the Anthropic API (global rule `feedback_no-api-for-ai`).

**Operating model — Opus directs, Sonnet executes.** Opus (the main session) acts as director: it owns the
node-by-node work-list, dispatches Sonnet subagents one slice at a time, reviews each agent's returned report
against the expected count, and refuses partial/lazy work. Sonnet agents do the reading + authoring. Opus does
not let an agent "sample", "do the first N", or summarise instead of covering — every node is accounted for.

**Anti-laziness guardrails (mandatory):**
- **Total coverage, no sampling.** Every node in every course is processed, in teaching order. No "top N", no
  "representative subset", no silent truncation. If a slice is too big for one agent, split it — don't drop it.
- **Auditable counts.** Each agent returns: nodes examined, terms flagged, refreshers added, bridge nodes
  authored, with ids. Opus reconciles totals against the course's node count before marking a course done.
- **Loop-until-dry verification.** After a generate pass, a fresh verification agent re-audits the same course
  for any remaining assumed-but-untaught term; repeat until two consecutive passes find nothing new.
- **Downstream re-check.** When a bridge node is added, re-verify that every later node depending on it now
  resolves cleanly (the new node must actually close the gap, in order).
- **Per-course isolation enforced.** A term taught in CBSE 10 does NOT satisfy a CBSE 12 / JEE gap — each
  course's audit only counts its OWN earlier nodes as "taught."

**Phase 1 — AUDIT (produce, then stop for review).** For each course, Sonnet agents emit a gap report:
`node id → [assumed-but-untaught terms] → proposed action (refresher | bridge-node, with a one-line spec)`.
Opus assembles the per-course reports into one document and surfaces the **volume** — especially how many new
IE nodes are implied — for human greenlight. **No content is written in Phase 1.**

**Phase 2 — GENERATE (only on approval).** Work the approved gap list, in teaching order: maths → mostly
in-node refreshers + the rare missed prereq node; IE → bridge nodes (role `bedrock`) for each gap. Write to the
DB **and** `content/*.json`, union-only, kept in sync (§A). Then run the loop-until-dry verification above.

**Order of attack when run:** maths first (CBSE 10 → CBSE 12 → JEE) as the lower-risk warm-up, then IE
(largest expansion) once the maths method is proven. Mirror any IE-side process change into
`authoring_process.md`.

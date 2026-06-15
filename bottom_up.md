# bottom_up.md — Bottom-Up Exam-Prep (build spec / Claude Code instruction file)

> **Status:** planning → ready to build. Written 2026-06-15 from a Cowork design session.
> **What this is:** a NEW, standalone surface ("exam-prep") that teaches a subject **chapter by chapter,
> concept by concept, bottom-up**, gates each concept, and ends in a clean board-paper exam.
> It is **separate from the Socratic tutor** — it copies the CBSE math corpus + reuses the existing infra
> (Render/Neon/Drizzle, graders, node-agent, ModelRouter) and **Socratic's frontend styling/layout**, but is its
> own app/flow, not a change to `Tutor.tsx`.
> **Scope of THIS milestone:** **3 teaching nodes only.** Get the teaching loop genuinely good, then scale.

---

## 0. Decisions locked (from the session)

- **Front door:** pick exam + subject → **chapter circles** → open a chapter → teach its concepts **bottom-up**.
- **Node-level map + lock INSIDE each chapter** — the same circles pattern one level down. A chapter shows its
  concept nodes as **locked / available / done**; the learner clicks an *available* node to enter its teaching
  chat. A node is *available* when all its in-chapter prerequisites are passed. Because the chapter is a DAG,
  several sibling nodes can be available at once — the learner sees a **frontier**, not a single forced path.
- **Chapter complete = every concept's gate passed.** Strict-linear chapter unlock (finish a chapter to open the next).
- **Final exam = a real past board paper.** Clean — no teaching mid-exam. Afterward we **flag the weak concepts**
  to the learner to revise. (Final-exam build is a LATER milestone; not in this 3-node slice.)
- **No descent inside exam-prep.** Bottom-up means a concept's prerequisites are already passed, so a failed gate
  localises the gap to *this* concept → **re-teach in place** (never route away).
- **One gate per node. No 2nd/variant gate, no fail diagnosis** (decided). On fail: re-teach the concept
  (general — not targeted at a specific move) and **re-pose the same gate**, loop to mastery. *(Accepts an MCQ
  memorisation risk for the prototype — fine for now; revisit when scaling.)*
- **Checklist costs no extra AI call.** The key-move checklist is returned **inside the teaching call's JSON**
  (it already self-reports `signal`), not via a separate per-turn judge.
- **Two products stay separate.** Socratic = "debug a specific gap by descending." Exam-prep = "build up first,
  then measure." They share corpus + infra, not a screen.
- **Record performance per node** (this milestone): a per-learner **concept checklist** + a **per-gate-question
  record** + a node summary. Useful to the learner (where they struggled) and to us (which nodes/gates are hard).
- **Reuse + deploy + models (see §8):** **copy Socratic's frontend styling & layout as much as possible**
  (palette, Tutor shell, scratchpad, equation rendering) — the only new UI is the chapter circles + the node map;
  deploy on **Render (jae account)**; **real users → Claude Haiku, all testing → NVIDIA NIM / `mock`** (never a
  test suite on Haiku; ≤1–2 Haiku messages for a manual check).

---

## 1. Scope — the 3 starting nodes

A self-contained slice of **CBSE 10 · Maths · Ch.1 Real Numbers (`jemh101`)**: one bedrock concept and the
two that depend only on it. No prerequisites leak outside the set, so the bottom-up order is fully testable.

| order | concept (slug) | role | depends on | gate (authored, single) |
|---|---|---|---|---|
| 1 | `know-prime-composite-coprime` | bedrock | — | MCQ |
| 2 | `prime-factorise-integer` | intermediate | #1 | symbolic (CAS) |
| 3 | `state-fundamental-theorem-arithmetic` | intermediate | #1 | MCQ |

Teaching order = bottom-up topological sort, ties broken by textbook `sec`. After #1 passes, **#2 and #3 are
both available** (siblings) — the learner picks either to enter next.

### The seed content (imported verbatim from the repo — the "brain" each node teaches from)

**Node 1 · `know-prime-composite-coprime`** (bedrock)
- *brief:* Coprime numbers share no common factor other than 1; factorisation targets composites and produces primes.
- *key moves (the checklist):* (a) recognise coprime pairs (HCF = 1); (b) reduce a fraction to coprime form; (c) use "product of primes" as the goal of factorising a composite.
- *misconceptions:* calling 1 a prime/composite; confusing coprime (HCF 1) with "both prime".
- *gate (MCQ):* "Two integers being coprime means…" → **B) their only common factor is 1 (HCF = 1)**.

**Node 2 · `prime-factorise-integer`** (needs #1)
- *brief:* Break an integer into prime factors via a factor tree; write as a product of powers of primes, ascending.
- *key moves:* (a) divide out the smallest prime repeatedly; (b) continue until every leaf is prime; (c) combine repeats into powers, order ascending.
- *misconceptions:* stopping before all factors are prime; arbitrary order / losing an exponent.
- *gate (symbolic/CAS):* "Express 32760 as a product of powers of primes." → **2^3 · 3^2 · 5 · 7 · 13**.

**Node 3 · `state-fundamental-theorem-arithmetic`** (needs #1)
- *brief:* Every composite factorises into primes, uniquely apart from order.
- *key moves:* (a) state existence; (b) state uniqueness; (c) recognise uniqueness as the deductive tool.
- *misconceptions:* quoting existence only; treating different orderings as different factorisations.
- *gate (MCQ):* "…this factorisation is…" → **B) unique apart from the order of factors**.

---

## 2. Data — where it comes from (import)

**Source of truth = the existing repo corpus.** Do not re-author content; import it.

- Content: `socratic-planning/exams/cbse10/maths/jemh101/content.json` (the nodes + brains).
- Gates: `socratic-planning/exams/cbse10/maths/jemh101/exam.json` (`items[]`, keyed by `nodeId`).
- Graph/order: `socratic-planning/exams/cbse10/maths/_graph.json` (prereq edges → bottom-up order + availability).

**Import step (build-step 1):** extract the 3 nodes + their (single) gate item into a versioned content bundle
for the new surface — already seeded here at `content/jemh101.slice.json` — adding only a bottom-up `order` index.
Keep the bundle the single read-only content artifact (mirrors how cbse10 already serves an MD5-verified static
bundle). Re-running the import is idempotent. **No variant gates, no diagnosis maps.**

---

## 3. Data — how we store it

Reuse the existing stack: **Neon Postgres + Drizzle**, **append-only event log as source of truth**
(same discipline as `journey_event`: never UPDATE; derive everything else). New tables live in a `bu_` namespace.

### 3a. Content (imported, read-mostly)

```
Concept     { id, chapterId, slug, title, role, sec, order,
              brief, explanation, keyMoves: string[], misconceptions: string[], prereqs: id[] }
Gate        { id, conceptId, kind, prompt, answerType, grader,
              expected,            // SERVER-ONLY — never serialised to the client
              srcLabel, quote }    // exactly ONE gate per concept
Chapter     { id, title, subjectId, examId, conceptOrder: id[] }
```

### 3b. Learner performance (new — the heart of this milestone)

**Append-only event log (truth):**
```
bu_event { id, learnerId, conceptId, chapterId, ts, type, payload:jsonb }
  type ∈ enter_node | tutor_turn | learner_turn | keymove_demonstrated | misconception_seen
        | gate_posed | gate_answer | gate_pass | gate_fail | reteach_enter
        | node_complete | chapter_complete
  e.g. gate_answer payload = { gateId, answer, correct, gradedBy:"deterministic"|"rubric", ms }
```

**Derived views (rebuildable from the log — fast reads for UI + analytics):**
```
bu_node_performance { learnerId, conceptId, status, firstPass:bool, attempts, passes, fails,
                      nudges, timeOnNodeMs, enteredAt, passedAt }
   status ∈ locked | available | teaching | awaiting_gate | needs_reteach | passed
            // locked/available derived from whether all in-chapter prereqs are passed
bu_node_checklist   { learnerId, conceptId, keyMoveIndex, demonstrated:bool, demonstratedAt, evidence:text }
                      // ← THE concept checklist, per learner per key move, with the line that proved it
bu_gate_attempt     { learnerId, conceptId, gateId, attemptNo, prompt, learnerAnswer, correct:bool, gradedBy, ms, ts }
                      // ← THE per-question record: exactly how they did on each gate try
bu_chapter_progress { learnerId, chapterId, status, conceptsPassed, conceptsTotal, startedAt, completedAt }
                      status ∈ locked | active | complete
```

This answers "record performance per node": the **checklist** (what they've shown + the line that proved it),
the **gate attempts** (each try, right/wrong, time), and the **node summary** (tries, first-pass, time). Surfaced
two ways — a **learner view** ("you've shown 2/3 key ideas; the √ gate took 2 tries") and a **team analytics
read** (hardest nodes, gate fail-rates, first-pass %).

---

## 4. The AI teaching flow (per-node loop)

Reuses `node-agent/respond` (warm Socratic, 1–3 sentence turns, elicits the key moves) + `graders/` +
`ModelRouter` (with `LLM_PROVIDER=mock` for offline tests). New glue: the checklist tracker (parses the
teaching call's JSON), the bottom-up sequencer + node availability, the re-teach-on-fail path, and event recording.

```
ENTER NODE  (learner clicked an AVAILABLE node)
  load brain (explanation, keyMoves, misconceptions, teachingInsights)
  init checklist: every keyMove = undemonstrated ;  emit enter_node

TEACH  (loop)
  node-agent turn → short Socratic question that elicits the next key move ; emit tutor_turn
  on learner reply (emit learner_turn):
     the SAME teaching call returns a checklist delta IN its JSON — keyMovesDemonstrated[], misconceptionsSeen[]
        (no extra AI call) → we emit keymove_demonstrated + evidence / misconception_seen
  repeat until ALL keyMoves demonstrated

READINESS CHECK  (optional — ONE call per node at the boundary, NOT per turn)
  default OFF for the prototype — the gate is the objective check, so an over-eager mark self-corrects
  (fail → re-teach). Turn ON only if premature gating shows up.

GATE
  pose the node's (single) gate ; emit gate_posed ; status = awaiting_gate
  grade: deterministic (mcq/numeric/symbolic/categorize/order) OR llm-rubric (written)
  emit gate_answer { correct, gradedBy, ms } ; write bu_gate_attempt

  PASS → emit gate_pass + node_complete ; status = passed ; recompute availability (unlock newly-available nodes)
         (last concept in chapter → emit chapter_complete ; unlock next chapter)

  FAIL → emit gate_fail + reteach_enter
         RE-TEACH the concept (general — no per-answer diagnosis) → back to TEACH
         then re-pose the SAME gate → loop
         (no advance-on-fail; no hard lock — mastery-or-stay, always escapable by re-teaching)
```

Context hygiene (carry over): a node sees only its own dialogue; the full story lives in `bu_event`.

---

## 5. Build order (vertical slice — do in order, commit each)

1. **Import** the 3 nodes + their single gate → `content/jemh101.slice.json` (already seeded); add bottom-up `order`.
   (No variants, no diagnosis maps.)
2. **Schema** — Drizzle migration for `bu_event` + the four derived tables; a content loader for the bundle.
3. **Sequencer + availability** — strict bottom-up walk; compute node `locked / available / passed` from prereqs.
4. **Teach loop** — wire `node-agent` for teaching; parse the in-JSON checklist delta; emit events.
5. **Gate** — pose/grade via existing graders; write `bu_gate_attempt`; PASS→advance + recompute availability,
   FAIL→re-teach→re-pose the same gate.
6. **Maps + performance** — chapter circles + the in-chapter node map (locked/available/done); derive
   `bu_node_performance` / `bu_node_checklist` / `bu_chapter_progress`; a learner progress view + a team analytics read.
7. **Offline test** (`LLM_PROVIDER=mock DIRECTOR_PROVIDER=mock`): cold → teach → checklist fills → gate pass →
   availability updates → through all 3 → chapter_complete; AND a fail → re-teach → same-gate pass path.
   Assert events + derived rows.

## 6. Open items (decide while building)

- **Checklist judge (settled):** no per-turn judge call. The checklist rides in the teaching call's JSON; the
  gate is the objective backstop; marks persist as `bu_event`s (auditable). Optional single readiness confirm at
  the gate boundary (default off).
- **Same-gate retry (accepted risk):** with one gate and no diagnosis, a re-posed MCQ can be answered from memory.
  Acceptable for the 3-node prototype; revisit (variant pool / parametric items) only when scaling.
- **Mastery durability:** a concept passed weeks ago — do we re-check at chapter end? Probably not here; the
  final board-paper exam is the real backstop. Note and move on.

## 7. Done when

A learner opens Ch.1, sees its nodes as locked/available/done, clicks an available node, is taught the concept,
the **checklist** fills with evidence, the **gate** is posed + graded, **pass advances and unlocks newly-available
nodes / fail re-teaches and re-poses the same gate**, and the chapter completes when all 3 pass — with **every
step in `bu_event`** and `bu_node_performance` / `bu_node_checklist` / `bu_gate_attempt` queryable. Runs offline
on the mock model. Then, and only then, scale beyond 3 nodes.

---

## 8. Models, deployment, docs & frontend (decided)

**Models — cost policy (HARD RULE).**
- **Real user traffic → Claude Haiku** (teaching + any in-band evaluation).
- **All automated testing → NVIDIA NIM (free) or the `mock` provider. NEVER run a test suite on Haiku.**
- At most **1–2 Haiku messages** for a manual sanity spot-check — never automated, never a suite.
- ModelRouter: a `prod` profile = Haiku, a `test` profile = NVIDIA NIM / mock; default to NVIDIA NIM / mock and
  refuse Haiku when a test runner / `NODE_ENV=test` is detected. (Mirrors Socratic's free-tier dev discipline.)

**Deployment.** Render, on the **jae** account (same as Socratic): an API service + a static web service
(web rewrites `/api/*` → API), Neon Postgres. Reuse the existing infra / config patterns.

**Frontend — copy Socratic as much as possible.** Do NOT design a new look. Lift Socratic's **styling and layout
choices wholesale**:
- the **cream palette / type / component styling** (same visual language as the discussion-visuals),
- the **layout** (the single-screen Tutor shell — sidebar + main pane),
- the **scratchpad** (the chat | scratchpad split),
- the **equation / math rendering** ($…$ / $$…$$ / bare environments).

The only genuinely new UI is the **chapter circles + the in-chapter node map**, and even those follow the
explainer's visual style (`docs/exam-prep-overview.html`). That explainer also seeds the in-app **"How it works"**
documentation page.

---

## 9. Per-node data model — every structure we store, and how it powers the Socratic loop

> Added 2026-06-15 while loading **all math exams** (cbse10 + cbse12 + jee) and authoring the first
> 5 nodes per exam. This is the **definitive, eyes-on** description of what a node *is* in the database,
> what each field means, and how the pieces combine into a teaching experience. Schema lives in
> `src/db/schema.ts`; the loop that consumes it in `src/core/teach-loop.ts`. Authoring → `how_to_author_nodes.md`.

A "node" = one **concept**. Its data splits into **three layers**: (A) static content (imported, shared by
all learners), (B) the gate set (the objective check), and (C) per-learner state (append-only truth + derived
reads). Together they let the tutor open warm, teach Socratically, track understanding move-by-move, gate on
five authored questions, and unlock the next node — all auditable.

### Layer A — Static content (imported from the corpus; one row per node)

Source: `content/<exam>/<subject>/<chapter>/content.json` → loaded by `tools/load-content.ts` into the
`concepts` table. Read-mostly; cached in memory (`content-cache.ts`) so the hot paths hit 0–1 DB queries.

| field | what it holds | how it's used in the Socratic loop |
|---|---|---|
| `id` | `exam:subject:chapter:slug` (stable global key) | every event / gate / perf row references it |
| `chapterId`, `slug`, `title` | placement + display | node map labels; the opening names the `title` |
| `role` | `goal` / `bedrock` / `intermediate` | node-map colouring; bedrock = entry points |
| `sec`, `order` | textbook section; **bottom-up topological order** | `order` is the teach sequence (prereqs first); ties broken by `sec` |
| `brief` | one-line essence | fed to `teachTurn` and the "Help me" vision prompt as quick grounding |
| `explanation` | the full "brain" — the prose the tutor teaches *from* | the tutor's source of truth each turn; it never invents beyond this (gaps → `bu_corpus_gap`) |
| `keyMoves: string[]` | the **checklist** — the discrete skills that prove understanding | initialised undemonstrated on entry; the tutor elicits them one at a time; **all demonstrated → ready for the gate** |
| `misconceptions: string[]` | known traps | handed to the tutor so it watches for them; a hit is logged as `misconception_seen` → "pain points" |
| `prereqs: id[]` | in-chapter dependencies | the **sequencer** unlocks a node only when every prereq is `passed` (DAG → a frontier of available nodes) |

The `chapters` row stores `conceptOrder: id[]` (the whole bottom-up walk) + `title`, `subjectId`, `examId`.

### Layer B — The gate set (the objective mastery check; one or many rows per node)

Source: `exam.json` (the single **book** gate) and `tools/generate-gates.ts` (the **authored** 5-gate set).
Stored in `gates`. **`expected` is server-only — never serialised to the client.** A node now carries either:
- its **book gate** (`kind='book'`, id `…:g1`) — every loaded node has this; or
- a **5-slot authored set** (`kind='authored'`) for the first-5 authored nodes — `gateSet()` prefers this.

| field | meaning |
|---|---|
| `id` (`<conceptId>:<slot>`), `conceptId`, `kind` | identity; `book` vs `authored` |
| `slot`, `ord` | `sketch1 \| sketch2 \| explain \| mcq \| equation`; `ord` orders posing |
| `prompt` | the question shown to the learner (`$…$` maths) |
| `answerType` | `mcq \| symbolic \| written \| sketch` → drives the NodeView input widget |
| `grader` | `mcq \| cas \| rubric \| vision` → which grader runs |
| `expected` (jsonb) | per-type answer spec: mcq `{correct, options}`; symbolic `{equivalentTo, ideal}`; sketch/explain `{ideal, rubric}` |
| `idealAnswer`, `why`, `rubric`, `source` | model answer; what it tests; grading checklist (sketch/explain); research provenance URLs |

**Grading paths** (`answerGate`): mcq = normalised exact match; symbolic = integer CAS (`casEquivalent`) or LLM
equivalence vs `idealAnswer`; written = `gradeWritten` against the rubric; sketch = `gradeSketch` (vision) against
the rubric. The node **passes only when every gate in the set is cleared**; a miss gives targeted feedback and
**re-poses the same gate** (no hard reset).

### Layer C — Per-learner state (append-only truth + derived fast-reads)

**Truth = `bu_event`** (never updated; everything else is rebuildable from it). One row per thing-that-happened,
each with `learnerId, conceptId, chapterId, ts, type, payload`. Types: `enter_node, tutor_turn, learner_turn,
keymove_demonstrated, misconception_seen, corpus_gap, gate_posed, gate_answer, gate_pass, gate_fail,
reteach_enter, node_complete, chapter_complete`. The **current dialogue is reconstructed** from the tutor/learner
turns since the last `enter_node`.

Derived views (fast reads for UI + analytics):

| table | one row per | carries | powers |
|---|---|---|---|
| `bu_node_performance` | learner × concept | `status, firstPass, attempts, passes, fails, nudges, timeOnNodeMs, enteredAt, passedAt` | node-map status; Details "progress"; analytics (hardest nodes, first-pass %) |
| `bu_node_checklist` | learner × concept × keyMove | `demonstrated, demonstratedAt, evidence` (**the line that proved it**) | the live checklist + evidence in Details |
| `bu_gate_attempt` | each gate try | `gateId, attemptNo, prompt, learnerAnswer, correct, gradedBy, ms` | which gate is cleared; per-question history; gate fail-rates |
| `bu_chat_summary` | learner × concept | rolling `summary` + `watermark` + `turnsSummarized` | resume from **summary + recent turns** (bounds context growth across sessions) |
| `bu_corpus_gap` | gap occurrence | `question, missing, resolved` | review queue: what our content couldn't answer → exported to `corpus_gap.md` |
| `bu_chapter_progress` | learner × chapter | `status, conceptsPassed, conceptsTotal` | chapter circles; strict-linear chapter unlock |

`status` on a node is **derived** if no perf row exists yet: `available` when all in-chapter prereqs are passed,
else `locked` (no rows written just to view the map — lazy).

### How it all combines — one node, start to finish

```
ENTER (learner taps an AVAILABLE node)
  load concept (Layer A) → emit enter_node → perf.status = teaching
  init checklist from keyMoves (all undemonstrated) → fold any prior-session turns into bu_chat_summary
OPEN
  instant warm Socrates opening (names the title, asks prior knowledge) — no LLM wait → tutor_turn
TEACH (loop)
  context = running summary + turns since watermark (NOT the whole transcript)
  teachTurn(brief, explanation, keyMoves, misconceptions, dialogue) →
     short Socratic turn + a CHECKLIST DELTA in the SAME JSON (keyMovesDemonstrated[] w/ evidence,
     misconceptionsSeen[]) — no extra AI call. We write keymove_demonstrated / misconception_seen,
     and corpus_gap if it couldn't answer from our content.
  repeat until ALL keyMoves demonstrated → readyForGate
GATE (Layer B)
  poseGate → next uncleared gate in slot order (expected withheld) → gate_posed, status = awaiting_gate
  answerGate → grade by type → bu_gate_attempt + gate_answer
     all gates cleared → passNode: gate_pass + node_complete, perf.passed, recompute availability
                          (last in chapter → chapter_complete → next chapter unlocks)
     else miss        → gate_fail (+fails, firstPass=false), targeted feedback, SAME gate re-posed; re-teach in place
DETAILS panel (any time)  getNodeDetail = concept brain + progress + checklist(+evidence) + the gate set
  (questions only) + gate attempts + pain points + a derived "tutor's notes" + session summary + corpus gaps.
```

Context hygiene: a node sees only its own dialogue; the full story lives in `bu_event`; cross-session memory is the
compact `bu_chat_summary`, not a replay. This is what makes the experience feel like one patient tutor who
remembers where *you* are, on *this* concept, without the cost growing unbounded.

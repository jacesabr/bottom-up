# change_log.md — Cowork planning decisions (running log)

Append-only log of changes we've **decided to implement**, newest first. Pairs with the instruction files
(e.g. `bottom_up.md`) so Claude Code always knows the current intent. This is the *planning* log; the build's
own design log stays at `socratic-planning/CHANGELOG.md`.

---

## 2026-06-15 — Bottom-Up Exam-Prep (new surface) — DECIDED, spec in `bottom_up.md`

**What:** a new, standalone **exam-prep** product that teaches a subject **chapter by chapter, concept by
concept, bottom-up**, gates each concept, and ends in a clean board-paper exam. Distinct from the Socratic tutor.

**Decisions locked:**
- Front door: exam + subject → **chapter circles** → open a chapter → teach concepts **bottom-up** (the existing
  prereq graph, walked in reverse: bedrock → goal). "Concept spine" was the wrong name — it's just the graph reversed.
- **Chapter complete = all gates passed.** **Strict-linear** chapter unlock; **node-level lock inside a chapter** too
  (nodes show locked / available / done; click an available node — all in-chapter prereqs passed — to enter it;
  several siblings can be available at once: a frontier, not a single path).
- **Final exam = a real past board paper**, clean (no teaching mid-exam). Afterward, **flag the weak concepts**
  to the learner to revise. (Final-exam build = later milestone.)
- **No descent inside exam-prep** — bottom-up means prerequisites are already passed, so a failed gate is local →
  **re-teach in place and re-pose the SAME gate**, loop to mastery (no hard lock; no variant).
- **One gate per node — no 2nd/variant gate, no fail diagnosis.** A failed gate re-teaches the concept (general)
  and re-poses the same gate. Accept the MCQ memorisation risk for the prototype; revisit when scaling.
- **Clean separation from Socratic** — shares the CBSE corpus + infra, not a screen. Socratic = descend to a gap;
  exam-prep = build up then measure.
- **Per-node performance is recorded** (this milestone): an append-only event log → derived **concept checklist**
  (per key move, with the line that proved it), **gate-attempt history** (each try, right/wrong, time), and a node
  summary (tries, first-pass, time). For the learner *and* for our analytics.
- **Checklist adds no per-turn cost** — returned IN the teaching call's JSON (it already self-reports mastery),
  not via a separate judge. Gate is the objective backstop; optional single readiness confirm at the boundary (default off).
- **Models — cost policy (HARD RULE):** real users → **Claude Haiku**; **all testing → NVIDIA NIM (free) or the
  `mock` provider** (never a test suite on Haiku; at most 1–2 Haiku messages for a manual spot-check).
- **Deploy:** **Render, jae account** (same as Socratic) — API + static web, Neon Postgres. Reuse the infra.
- **Frontend reuse:** the **visuals become the real site UI** (chapter circles + in-chapter node map). Reuse
  Socratic's **layout**, **scratchpad** (chat | scratchpad split), and **equation / math rendering**. The explainer
  (`docs/exam-prep-overview.html`) also seeds the in-app **"How it works"** doc page.

**Scope of first milestone:** **3 nodes only** from `cbse10/maths/jemh101` (`know-prime-composite-coprime` →
`prime-factorise-integer` → `state-fundamental-theorem-arithmetic`). Make the teaching loop genuinely good, then scale.

**Data:** import content + gates from `socratic-planning/exams/cbse10/maths/jemh101/` (source of truth) into a
versioned slice bundle (`content/jemh101.slice.json`); learner state in Postgres `bu_*` tables (append-only
`bu_event` + derived views).

**Now its own repo:** `bottom-up/` on the Desktop (separate from `Socratic/`), seeded with the spec, this log,
`content/jemh101.slice.json`, the explainer in `docs/`, and a README.

**Next:** Claude Code builds the vertical slice per `bottom_up.md` §5 (import → schema → sequencer → teach loop →
gate → performance → offline mock test).

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

---

## 2026-06-15 — Vertical slice built & deployed live

**What:** Full 3-node teaching app stood up in one day and deployed to Render (jae account).

- Scaffolded schema, sequencer, teach loop, gate, API routes, React frontend
- Exam → subject → chapters → nodes navigation flow
- NIM-grounded teaching with Tutor shell (chat | scratchpad + KaTeX + equation composer)
- Details panel with tutor notes; scratchpad attach / help / send
- 5-gate wire-up: MCQ, written, equation/equivalence, sketch/vision, rubric graders
- Gate-authoring pipeline (Firecrawl research + Haiku author, 5 slots per concept)
- All 14 CBSE10 Maths chapters loaded; node map colours (passed / current / locked)
- Warm onboarding banner on first turn; natural opening assumes zero knowledge
- Socrates persona + anti-drift grounding; instant warm opening (gentle reminder on revisit)
- Multi-language teaching + grading + translation backend (hi/pa/ta/bn)
- Voice in (mic STT) + out (read-aloud TTS), language selector
- In-memory content cache (chapter list 0 DB reads, node map 1 vs 36)
- Non-fatal boot seed-load (ECONNRESET no longer crashes API)
- Session memory: per-student/node chat-history summarisation (`bu_chat_summary`) → resume from summary + recent turns; bounds context growth
- Corpus-gap tracking (`bu_corpus_gap`) when tutor can't answer from content → exports to `docs/corpus_gap.md`
- Surface session memory + content gaps in the Details panel
- Node map: green = cleared, glow = current, locked = faded with lock icon
- Inline textbook figures: `bu_figure` table, manual captioning, `/api/figure`, inline render in tutor bubble
- Exam-aware AI instructions across CBSE10 / CBSE12 / JEE Main / JEE Advanced; stage papers

---

## 2026-06-16 — Final exam, chapter unlock, voice pipeline, authoring hardening

**What:** Major features completing the exam-prep loop.

- **Past-paper final exam**: real board papers, weak-concept flagging after exam, subjective marking, source-grounded JEE Main paper
- **Real chapter unlock**: chapter becomes available only when all its nodes are passed; past-board-paper button locked until every node in the course is passed
- **Node resume**: replay prior conversation instead of cold-starting when returning to a node
- **PART-structured tutor responses**: rendered as numbered cards with arrow connectors
- **Voice pipeline overhaul**: Sarvam translate (primary) + TTS/STT provider chains (Sarvam → ElevenLabs → Deepgram → browser); server `/tts` + `/transcribe` endpoints; mic records → server STT; read-aloud → server TTS; guided language prompt on first mic use
- **TTS fixes**: speak isolated capital letters phonetically (Sarvam lowercase phonetic: ay/bee/see); math nuance + asterisk/skip bug fixes; ElevenLabs for English, Sarvam for Indic
- **STT fix**: stale-closure lang bug (pass picked language to recorder); STT prefers Sarvam for Indic; model `saarika:v2.5` (v2 deprecated) — Punjabi round-trip verified
- **Authoring pipeline hardened**: Sonnet/Opus model option, NCERT-grounded content-improvement pass, authoritative-source search, scope/arithmetic/clean-answer guards, clean-slate re-author; `authoring_and_improve.md` = single source of truth (retired stubs merged in)
- **Content audit**: first 2 nodes per maths exam — scope-creep, leaked/self-contradicting model answers, difficulty mismatch fixed
- Vite proxy + API_PORT drift-proofing (mirrors IE repo)

---

## 2026-06-17 — Auth, admin, analytics, strict-linear lock, branding, language UX

**What:** Production hardening, analytics, and UX polish across the board.

- **Auth**: username/password login/register, scrypt hashing, session via localStorage; Log in / Register moved into TopNav (removed from home card)
- **Admin dashboard**: NIM model study panel, learner performance, corpus gaps, reload controls; panels load independently via `Promise.allSettled` (transient API blip no longer blanks the dashboard)
- **Traffic analytics**: self-hosted per-page beacons, top pages / devices / browsers panel; PostHog wired (autocapture + identify + per-page `$pageview`, env-gated); PostHog events tagged `app='sarthi'` to split apps in one project
- **Strict-linear node unlock within a chapter**: nodes unlock one-at-a-time (not frontier); gate must be passed before next node opens
- **Persist authored prereqs** into `content.json` as durable source of truth
- **JEE chapter order fixed**: Class 11 → Class 12 (was reversed)
- **Rename to Sarthi**: branding, title, TopNav; tabbed Documentation hub (How it works / Why Sarthi / Investors); pitch gated behind code `123`; docs restyled to site theme
- **Home**: "who it's for" blurb under each course title; brand/login card dropped in favour of TopNav auth
- **Docs**: auto-size iframes (no inner scrollbar); refreshed how-it-works for CBSE10/12/JEE + strict-linear + exam-locked
- **Voice**: read-aloud ON by default; Unicode ×/÷/− and literal-x fixed to read as "times"; one-time per-node language-switch invite (Hindi/Punjabi/Tamil/Bengali) after first message
- **`dont_assume.md` doctrine**: refresh + confirm-gate before any novel term; per-course isolation; tutor prompt hardened to enforce it

---

## 2026-06-18 — Tutor notes card layout

- NodeDetails: Tutor's notes rendered as numbered, bold-labelled, spaced cards (was raw text block)

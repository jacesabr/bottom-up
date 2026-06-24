# change_log.md — Cowork planning decisions (running log)

Append-only log of changes we've **decided to implement**, newest first. Pairs with the instruction files
(e.g. `bottom_up.md`) so Claude Code always knows the current intent. This is the *planning* log; the build's
own design log stays at `socratic-planning/CHANGELOG.md`.

---

## 2026-06-24 — Zero-downtime deploys: readiness-gated `/health` + graceful SIGTERM drain

Mirrored from IE (diagnosed there: a learner saw the "can't reach the tutor" popup during a push; the failed
turn logged **no `bu_llm_call` row** — every NIM failure logs one before throwing — and landed inside a deploy
that had just gone live, so it was the **API restart window**, not NIM). `bottom-up-api` is a Render `starter`
web service, so zero-downtime is included — but two gaps in `src/api/index.ts` defeated it:
- **`/health` lied about readiness** — static `{status:'ok'}` returned the instant Express bound, before
  `initializeDatabase()` ran, letting Render cut over to a still-warming instance. Fix: a `ready` flag flipped
  only after a successful DB round-trip; `/health` returns 503 until then (retries a transient Neon hiccup).
- **No graceful shutdown** — SIGTERM killed in-flight streaming tutor turns (2–12 s) mid-flight (cut before
  `recordLlmCall`, hence no log). Fix: SIGTERM/SIGINT → 503 + `server.close()` drain (25 s force-exit safety).
- **Render config drift fixed:** the live service's `healthCheckPath` was **blank** despite render.yaml
  declaring `/health` — reset to `/health` via the Render API so the health gate is actually consulted.
- `tsc` clean in the touched file. **Built; not yet runtime-verified through a live redeploy.**

## 2026-06-22 (cont.) — Quality benchmarks made HARD + FAIR; pool re-ranked on real reading/reasoning

Mirrored from IE. The router blends PRECOMPUTED quality × LIVE speed (quality can't be graded per-request
live). Old batteries saturated everyone at a fake "100%"; rebuilt both (deterministic):
- Text (`tools/nim-bench.ts`): 18 multi-step items, exact-answer graded. Vision (`tools/nim-vision-bench.ts`):
  13 dense handwritten pages, partial-credit token recall.
- Fairness fix: the bench was rate-limiting slow free-tier models (deepseek 429s) and scoring no-response as
  wrong. Now pace + retry, and quality = correctness among items ANSWERED (availability gated live). `--models`
  flag added to re-score just the pool.
- Re-ranked `nim-router` quality (measured): deepseek-v4-pro 1.0 (slow ~11s), nemotron-super 0.89,
  mistral-nemotron 0.83 (fast → usual live winner), qwen3-80b 0.78, llama-3.1-70b 0.75, llama-3.3-70b 0.72,
  nemotron-nano-30b/dracarys 0.67, maverick 0.65, ministral 0.61. VISION: nemotron-nano-12b **0.90** (best +
  fast), llama-3.2-90b 0.84, llama-3.2-11b 0.78; the old pick nemotron-nano-vl-8b is worst (0.55). Weak models
  (text 8b 0.44 / mistral-small 0.40, vision-8b 0.55) drop below QUALITY_FLOOR (0.6).

---

## 2026-06-22 — Vision speed measured LIVE (real image probe); footer always reachable; quality-first pick

Mirrored from IE (shared NIM-router infra).
- **Vision speed is now a REAL live measurement** (`nim-router.ts` + new `probe-image.ts`). The probe used to
  send a 1×1 pixel (→ ~300 ms) then *display* a precomputed bench time (7–17 s) — the race lied. Now it sends
  a real 768×768 image + real output budget and times it, so shown/ranked speed is genuine current data (NIM
  swings through the day). Vision probe timeout 8 s → 25 s. Race cached + shared (`NIM_VISION_ROUTE_TTL_MS`,
  default 10 min) so 4 heavy reads don't fire every node entry and self-inflict 429s. Text was already live.
- **Quality-dominant selection**: text full-marks floor 350 ms → 1000 ms (sub-second probe delta is noise) →
  higher reasoning wins, ties to curated order (deepseek-v4-pro first). Vision quality-weighted 0.85 → most
  accurate reader wins.
- **Footer button always reachable** (`RouterPopup.css`): the taller failure popup pushed the button off
  screen; the race region now scrolls internally so the button stays pinned.

---

## 2026-06-21 — Router-recovery no longer wipes the lesson; real NIM failure causes fixed; popup paced

Mirrored from the IE repo (shared NIM-router infra). Cluster reported on prod: learner messages vanishing,
tutor replies appending onto the opening, intro tour never showing, "fails every message then re-finds one",
janky/too-fast router popup. Root-caused from `bu_llm_call` + the code.

- **The wipe — `NodeView.tsx`.** The node-open `useEffect` listed `routePopup` as a dependency, so dismissing
  the mid-lesson **failure** popup re-ran `/start` + `setMessages(...)` and erased the whole conversation while
  the retry streamed a new bubble in. Fix: extracted `openNode()`; a **failure** dismissal sets `skipOpenOnce`
  so the effect skips re-opening (conversation survives; `retryRef` resumes the failed turn once). A `/start`
  failure now retries via `retryRef = () => openNode()`.
- **"Fails every message" — `llm.ts`.** (1) Mistral-tokenizer models return **HTTP 400 "chat_template is not
  supported"** when sent `chat_template_kwargs` (from `NIM_NO_THINK`), and a 400 isn't retryable → hard fail.
  Fix: self-heal — `templateRejecters` + `nimExtraFor` drop the kwarg for rejecters, with a one-shot
  retry-without-kwarg. (2) `deepseek-v4-pro` 60s timeouts → `NIM_TIMEOUT_MS` default **30s**. (Claude opt-in
  path untouched — additions are NIM-only.)
- **Popup — `RouterPopup.tsx` + `.css`.** Committed the flex CSS (markup/CSS mismatch caused the overflow
  jank); added a ~1.8s minimum dwell + `ready = concluded && dwell` gate + a live stage-narration line so the
  race is seen, not flashed past.
- **Lost the thread — `teach-loop.ts`.** Defence-in-depth for the same symptom from the summary side.
  (1) `buildContext` now always keeps the last 6 turns verbatim alongside the running summary — if the
  summary watermark ever runs ahead of the live turns (the mid-lesson **language-switch** path still
  re-enters the node → `summarizeOnEntry`), `recent` could go empty and the tutor would reconstruct from the
  summary's older frontier, answering as if the question it just asked never happened (e.g. re-deriving a
  step the learner already finished). (2) `respond()` skips the `learner_turn` insert when it exactly equals
  the last event — the failure-popup retry re-sends the same message, which used to double-log it and
  pollute the summary.

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

---

## 2026-06-19 — Phase-2 complete (sources + refreshers + §A bridges), NIM fallback live, content fixes

**What:** the deferred "Phase-2" authoring/improvement pass run to completion across the whole maths corpus,
plus a live-product resilience feature and a focused content-fix pass. Orchestrated as parallel Opus
sub-agents (cloud-isolation research dossiers + local DB-writing agents), Opus-audited. All DB-verified.

- **Per-gate sources — COMPLETE.** Every authored gate (3236 across 41 chapters) now carries web-research-verified
  authoritative source URLs (WebSearch→WebFetch, each confirmed on-topic; video/social/forum dropped). Legacy
  pipeline junk repaired: dead `ncert.nic.in/ncerts/l/*.pdf` paths fixed to `textbook/pdf/`, jee Sets re-coded to
  `kemh101`, bogus `lmr101`→`lemh101`, and youtube/scribd/chegg/careers360 fragments stripped (guarded so no row
  emptied). Re-verified by an adversarial sampling pass (165 URLs; residue fixed). Resolves the Phase-1/Phase-2 split.
- **Refreshers — populated 6 → 215 concepts.** Tutor-private foundational refreshers (§A.5) authored generously on
  pre-curriculum bedrock; jsonb `concepts.refreshers`, threaded into the tutor prompt, deployed only when a gap surfaces.
- **17 §A "bridge" bedrock nodes** authored across 9 chapters (jee ch03/07/08/11/13; cbse12 ch01/02/09/10) — e.g.
  coordinate-plane, circle-basics, Pythagoras, laws-of-exponents, mathematical-induction, right-hand-rule. Each is
  `role='bedrock'` with a full 5-gate set, wired upstream of its consumers (toposort verified: 0 order-violations). LIVE.
- **NIM fallback for live tutoring** (`src/core/llm.ts`): `completeJson()` falls back Claude→NIM
  (`meta/llama-3.3-70b-instruct`) on Anthropic exhaustion/429/5xx/auth/timeout so a student turn still completes;
  student vision already on `nvidia/nemotron-nano-12b-v2-vl`; NIM-primary unchanged (free floor). Verified + LIVE.
- **Durability fix** (`tools/load-content.ts`): preserves an existing non-empty `concepts.refreshers` on reload
  (refreshers are DB-authored, not mirrored into every content.json) — reloads no longer wipe them.
- **7 focused content fixes:** `uv″`→`uv′` typo (jee ch12 ×2), drop mis-scoped `state-binomial-theorem` prereq
  (jee ch08), add (−1,1) domain restriction to arcsin/arccos derivatives (cbse12 ch05), add missing chain-rule
  prereq (cbse12 ch06), remove editing-artefact (cbse12 ch09 `order`), lead parallelism test with proportionality
  of direction ratios (cbse12 ch11), 2×2-determinant notation consistency (cbse12 ch04). Explanations/prereqs only;
  gates md5-verified unchanged.
- **Cache/deploy correction:** there is **no** `POST /api/admin/reload` route (the old gotcha was stale; it 404s);
  the content cache refreshes only on API restart (cold-start or a deploy trigger). All of the above is live
  (deploy = commit `82eb0d1`, Render status "live"). Full ledger + process: `authoring_and_improve.md`.

**Consequence to note:** activating the bridge nodes means an in-progress learner whose chapter was "complete"
reverts to incomplete until they pass the new bridge (correct bottom-up behaviour, but a visible progress change).

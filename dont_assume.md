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

---

## 3. Authoring rule (the corpus)

A node is **not done** until every load-bearing idea it uses is either taught by an **earlier node in the
same course**, or carried by a short in-node refresher for genuinely pre-curriculum common knowledge.

When a node assumes something untaught, choose:

- **Refresher (maths, prior-year material):** the earlier idea exists in the wider syllabus and a CBSE-12/JEE
  student plausibly met it in Class ≤10. Add a brief refresh beat inside the node AND wire the prerequisite
  link — but if it's truly load-bearing and a learner could be stuck, prefer a node.
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

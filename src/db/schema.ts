import { pgTable, text, uuid, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

export const chapters = pgTable('chapters', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  subjectId: text('subject_id').notNull(),
  examId: text('exam_id').notNull(),
  conceptOrder: text('concept_order').array().notNull(), // JSON array of concept IDs
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const concepts = pgTable('concepts', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  role: text('role').notNull(), // 'bedrock' | 'intermediate'
  sec: integer('sec'), // section number
  order: integer('order').notNull(), // bottom-up order within chapter
  brief: text('brief').notNull(),
  explanation: text('explanation').notNull(),
  keyMoves: text('key_moves').array().notNull(),
  misconceptions: text('misconceptions').array().notNull(),
  prereqs: text('prereqs').array().notNull(), // concept IDs
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const gates = pgTable('gates', {
  id: text('id').primaryKey(),
  conceptId: text('concept_id').notNull(),
  kind: text('kind').notNull(), // 'book' | 'authored'
  prompt: text('prompt').notNull(),
  answerType: text('answer_type').notNull(), // 'mcq' | 'symbolic' | 'written' | 'sketch'
  grader: text('grader').notNull(), // 'mcq' | 'cas' | 'rubric' | 'vision'
  expected: jsonb('expected').notNull(), // answer spec (SERVER-ONLY at runtime)
  srcLabel: text('src_label'),
  quote: text('quote'),
  // Multi-gate authoring (5 slots/concept): sketch1, sketch2, explain, mcq, equation
  slot: text('slot'),
  ord: integer('ord').default(0),
  idealAnswer: text('ideal_answer'),
  why: text('why'),
  rubric: text('rubric'),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---- Learner performance (append-only event log + derived views) ----

export const buEvent = pgTable('bu_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  conceptId: text('concept_id'),
  chapterId: text('chapter_id'),
  ts: timestamp('ts', { withTimezone: true }).defaultNow(),
  type: text('type').notNull(), // event type enum
  payload: jsonb('payload'), // flexible event data
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const buNodePerformance = pgTable('bu_node_performance', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  conceptId: text('concept_id').notNull(),
  status: text('status').notNull(), // 'locked' | 'available' | 'teaching' | 'awaiting_gate' | 'needs_reteach' | 'passed'
  firstPass: boolean('first_pass').default(true),
  attempts: integer('attempts').default(0),
  passes: integer('passes').default(0),
  fails: integer('fails').default(0),
  nudges: integer('nudges').default(0),
  timeOnNodeMs: integer('time_on_node_ms').default(0),
  enteredAt: timestamp('entered_at', { withTimezone: true }),
  passedAt: timestamp('passed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

export const buNodeChecklist = pgTable('bu_node_checklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  conceptId: text('concept_id').notNull(),
  keyMoveIndex: integer('key_move_index').notNull(),
  demonstrated: boolean('demonstrated').default(false),
  demonstratedAt: timestamp('demonstrated_at', { withTimezone: true }),
  evidence: text('evidence'), // the line that proved it
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

export const buGateAttempt = pgTable('bu_gate_attempt', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  conceptId: text('concept_id').notNull(),
  gateId: text('gate_id').notNull(),
  attemptNo: integer('attempt_no').notNull(),
  prompt: text('prompt').notNull(),
  learnerAnswer: text('learner_answer').notNull(),
  correct: boolean('correct').notNull(),
  gradedBy: text('graded_by').notNull(), // 'deterministic' | 'rubric'
  ms: integer('ms'), // time in milliseconds
  ts: timestamp('ts', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Per-student, per-node running conversation summary. Written on cold-start/revisit so we resume
// from "summary + recent turns" instead of replaying the whole dialogue (bounds context growth).
export const buChatSummary = pgTable('bu_chat_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  conceptId: text('concept_id').notNull(),
  summary: text('summary').notNull(), // what was covered / understood / still unclear / where they are
  watermark: timestamp('watermark', { withTimezone: true }), // events up to here are folded into summary
  turnsSummarized: integer('turns_summarized').default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

// Textbook figures: a Haiku-vision captioning pass maps each extracted page image to the concept(s)
// it illustrates, so the tutor can serve the right whole-page figure inline (no cropping needed).
export const buFigure = pgTable('bu_figure', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: text('chapter_id').notNull(),
  filename: text('filename').notNull(), // e.g. page003_img2.png — served from content/.../figures/
  page: integer('page'),
  caption: text('caption'), // one-line description of what the figure shows
  conceptIds: text('concept_ids').array().notNull().default([]), // concepts it illustrates
  relevant: boolean('relevant').default(false), // false = logo/decoration/page furniture (don't serve)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Corpus gaps: when the tutor can't answer from the concept's material, we log what was missing so
// we can review occasionally and decide whether to research + add content. Exported to corpus_gap.md.
export const buCorpusGap = pgTable('bu_corpus_gap', {
  id: uuid('id').primaryKey().defaultRandom(),
  conceptId: text('concept_id').notNull(),
  chapterId: text('chapter_id'),
  learnerId: uuid('learner_id'),
  question: text('question'), // what the student asked
  missing: text('missing').notNull(), // short summary of what our content lacked
  resolved: boolean('resolved').default(false), // set true once content is added
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const buChapterProgress = pgTable('bu_chapter_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  status: text('status').notNull(), // 'locked' | 'active' | 'complete'
  conceptsPassed: integer('concepts_passed').default(0),
  conceptsTotal: integer('concepts_total').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

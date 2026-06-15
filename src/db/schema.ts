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

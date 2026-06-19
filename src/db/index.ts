import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

/**
 * Boot check — maths content (CBSE/JEE courses, all chapters) is loaded out-of-band by
 * `tools/load-content.ts`, NOT seeded on startup. This just confirms the DB is reachable and reports
 * the loaded scale; it never writes. Non-fatal by design (the caller swallows errors so a transient
 * Neon hiccup can't crash boot).
 *
 * (Replaced a legacy startup loader that seeded one hardcoded slice and double-encoded gate.expected
 * into its jsonb column — corrupting MCQ/symbolic grading. The canonical loader writes the raw object.)
 */
export async function initializeDatabase() {
  const chapterRows = await db.query.chapters.findMany({ columns: { id: true } });
  if (chapterRows.length === 0) {
    console.warn('No chapters in DB — run `tsx tools/load-content.ts` to load the content.');
  } else {
    console.log(`DB ready: ${chapterRows.length} chapters loaded.`);
  }
}

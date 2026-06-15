import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  // Content loader: import content from jemh101.slice.json
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');
  const contentPath = path.join(process.cwd(), 'content', 'jemh101.slice.json');

  try {
    const contentRaw = await fs.readFile(contentPath, 'utf-8');
    const content = JSON.parse(contentRaw);

    // Load chapter
    const existingChapter = await db.query.chapters.findFirst({
      where: (chapters, { eq }) => eq(chapters.id, content.chapter.id),
    });

    if (!existingChapter) {
      await db.insert(schema.chapters).values({
        id: content.chapter.id,
        title: content.chapter.title,
        subjectId: content.chapter.subjectId,
        examId: content.chapter.examId,
        conceptOrder: content.chapter.conceptOrder,
      });
      console.log(`Loaded chapter: ${content.chapter.title}`);
    }

    // Load concepts
    for (const concept of content.concepts) {
      const existing = await db.query.concepts.findFirst({
        where: (concepts, { eq }) => eq(concepts.id, concept.id),
      });

      if (!existing) {
        await db.insert(schema.concepts).values({
          id: concept.id,
          chapterId: concept.chapterId || content.chapter.id,
          slug: concept.slug,
          title: concept.title,
          role: concept.role,
          sec: concept.sec,
          order: concept.order,
          brief: concept.brief,
          explanation: concept.explanation,
          keyMoves: concept.keyMoves,
          misconceptions: concept.misconceptions,
          prereqs: concept.prereqs,
        });
        console.log(`Loaded concept: ${concept.slug}`);
      }
    }

    // Load gates
    for (const gate of content.gates) {
      const existing = await db.query.gates.findFirst({
        where: (gates, { eq }) => eq(gates.id, gate.id),
      });

      if (!existing) {
        await db.insert(schema.gates).values({
          id: gate.id,
          conceptId: gate.conceptId,
          kind: gate.kind,
          prompt: gate.prompt,
          answerType: gate.answerType,
          grader: gate.grader,
          expected: JSON.stringify(gate.expected),
          srcLabel: gate.srcLabel,
          quote: gate.quote,
        });
        console.log(`Loaded gate: ${gate.id}`);
      }
    }

    console.log('Content loaded successfully');
  } catch (error) {
    // Non-fatal: content is already present in the DB; just log and continue serving.
    console.error('Failed to load content (non-fatal):', error);
  }
}

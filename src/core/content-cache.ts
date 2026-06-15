import { db } from '../db/index.js';
import { chapters as chaptersTable, concepts as conceptsTable } from '../db/schema.js';

/**
 * In-memory cache of the STATIC content (chapters + concepts). It's identical for every learner and
 * changes only when we re-import, so we load it ONCE (2 queries) and serve from memory thereafter.
 * This keeps the hot read paths — chapter list (0 DB) and node map (1 DB: just learner status) — from
 * hammering the database at scale. Call invalidateContentCache() after a re-import.
 */
type Chapter = typeof chaptersTable.$inferSelect;
type Concept = typeof conceptsTable.$inferSelect;

let chaptersCache: Chapter[] | null = null;
let conceptsByChapter: Map<string, Concept[]> | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (chaptersCache && conceptsByChapter) return;
  if (!loading) {
    loading = (async () => {
      const [chs, cons] = await Promise.all([
        db.select().from(chaptersTable),
        db.select().from(conceptsTable),
      ]);
      const byChapter = new Map<string, Concept[]>();
      for (const c of cons) {
        const arr = byChapter.get(c.chapterId) ?? [];
        arr.push(c);
        byChapter.set(c.chapterId, arr);
      }
      for (const arr of byChapter.values()) arr.sort((a, b) => a.order - b.order);
      chaptersCache = chs;
      conceptsByChapter = byChapter;
    })().finally(() => {
      loading = null;
    });
  }
  await loading;
}

export function invalidateContentCache(): void {
  chaptersCache = null;
  conceptsByChapter = null;
}

export async function getChaptersForSubject(subjectId: string): Promise<Chapter[]> {
  await ensureLoaded();
  return chaptersCache!.filter((c) => c.subjectId === subjectId).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getChapter(chapterId: string): Promise<Chapter | undefined> {
  await ensureLoaded();
  return chaptersCache!.find((c) => c.id === chapterId);
}

export async function getConceptsForChapter(chapterId: string): Promise<Concept[]> {
  await ensureLoaded();
  return conceptsByChapter!.get(chapterId) ?? [];
}

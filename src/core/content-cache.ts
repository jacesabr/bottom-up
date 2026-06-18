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

// Pedagogical chapter order = (school year, chapter number). The JEE corpus mixes Class 11 chapters
// (`…maths-chNN`) and Class 12 ones (`…maths-c12-chNN`); a plain id sort puts `c12` BEFORE `ch` (digit
// '1' < letter 'h'), which would teach Class 12 before Class 11 — backwards for a build-up course. We
// derive the year from a `-cNN-` marker (Class 11 has none → year 0, so it sorts first) and the chapter
// number from `chNN`, falling back to the id. Single-year subjects (cbse10/cbse12) are unaffected.
function chapterOrderKey(id: string): [number, number] {
  // "Learn from Scratch": chapters are class levels (k, g1..g8, hs-*). Order them as a climbing ladder
  // (Kindergarten → Grade 8 → High School domains), not alphabetically (which would dump 'k' after 'g8').
  const sm = id.match(/^scratch:maths:(.+)$/);
  if (sm) return [SCRATCH_BAND_RANK[sm[1]] ?? 99, 0];
  const ym = id.match(/-c(\d\d)-/);
  const year = ym ? parseInt(ym[1], 10) : 0;
  const nm = id.match(/ch(\d+)(?!\d)/);
  const num = nm ? parseInt(nm[1], 10) : 0;
  return [year, num];
}

// Class-ladder order for the "Learn from Scratch" course (lower = earlier/younger).
const SCRATCH_BAND_RANK: Record<string, number> = {
  k: 0, g1: 1, g2: 2, g3: 3, g4: 4, g5: 5, g6: 6, g7: 7, g8: 8,
  'hs-number': 9, 'hs-algebra': 10, 'hs-functions': 11, 'hs-geometry': 12, 'hs-stats': 13,
};

export async function getChaptersForSubject(subjectId: string): Promise<Chapter[]> {
  await ensureLoaded();
  return chaptersCache!
    .filter((c) => c.subjectId === subjectId)
    .sort((a, b) => {
      const [ay, an] = chapterOrderKey(a.id);
      const [by, bn] = chapterOrderKey(b.id);
      return ay - by || an - bn || a.id.localeCompare(b.id);
    });
}

export async function getChapter(chapterId: string): Promise<Chapter | undefined> {
  await ensureLoaded();
  return chaptersCache!.find((c) => c.id === chapterId);
}

export async function getConceptsForChapter(chapterId: string): Promise<Concept[]> {
  await ensureLoaded();
  return conceptsByChapter!.get(chapterId) ?? [];
}

/** Look up a single concept by id (used to title weak-concept review links). */
export async function getConceptById(conceptId: string): Promise<Concept | undefined> {
  await ensureLoaded();
  for (const arr of conceptsByChapter!.values()) {
    const found = arr.find((c) => c.id === conceptId);
    if (found) return found;
  }
  return undefined;
}

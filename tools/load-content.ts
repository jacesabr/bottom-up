/**
 * Load the full cloned CBSE10 Maths corpus into the DB.
 *
 * Source: content/cbse10/maths/jemhNNN/{content.json, exam.json}
 *  - content.json → chapter + concept nodes (each node carries its own `prereqs`)
 *  - exam.json    → items[] gates keyed by nodeId (we take ONE gate per node — spec: one gate per concept)
 *
 * Bottom-up `order` is a topological sort (prereqs first), tie-broken by `sec` then title.
 * Idempotent: upserts by primary key.
 *
 * Display layer for all 14 chapters; teaching quality is only validated on the 3 seed nodes (spec §1).
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../src/db/index.js';
import { chapters, concepts, gates } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

const MATHS_DIR = path.join(process.cwd(), 'content', 'cbse10', 'maths');

interface Node {
  id: string;
  slug: string;
  title: string;
  role: string;
  sec?: number;
  brief?: string;
  explanation?: string;
  keyMoves?: string[];
  misconceptions?: string[];
  prereqs?: string[];
}

/** Topological bottom-up order within a chapter; tie-break sec asc, then title. */
function bottomUpOrder(nodes: Node[]): Map<string, number> {
  const inChapter = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const remainingPrereqs = new Map<string, Set<string>>();
  for (const n of nodes) {
    const ps = (n.prereqs ?? []).filter((p) => inChapter.has(p));
    remainingPrereqs.set(n.id, new Set(ps));
  }

  const order = new Map<string, number>();
  let idx = 0;
  const cmp = (a: string, b: string) => {
    const na = byId.get(a)!;
    const nb = byId.get(b)!;
    return (na.sec ?? 99) - (nb.sec ?? 99) || na.title.localeCompare(nb.title);
  };

  while (order.size < nodes.length) {
    const ready = nodes
      .filter((n) => !order.has(n.id) && remainingPrereqs.get(n.id)!.size === 0)
      .map((n) => n.id)
      .sort(cmp);

    if (ready.length === 0) {
      // Cycle / dangling prereq — emit the rest in stable order so nothing is lost.
      const rest = nodes.filter((n) => !order.has(n.id)).map((n) => n.id).sort(cmp);
      for (const id of rest) order.set(id, idx++);
      break;
    }
    for (const id of ready) {
      order.set(id, idx++);
      for (const s of remainingPrereqs.values()) s.delete(id);
    }
  }
  return order;
}

async function loadChapter(dir: string) {
  const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8'));
  let examItems: any[] = [];
  try {
    const exam = JSON.parse(await fs.readFile(path.join(dir, 'exam.json'), 'utf8'));
    examItems = exam.items ?? [];
  } catch {
    /* some chapters may lack an exam.json — fine, nodes still display */
  }

  const chapterId = `${content.exam}:${content.subject}:${content.chapter}`;
  const subjectId = `${content.exam}:${content.subject}`;
  const nodes: Node[] = content.nodes ?? [];
  const order = bottomUpOrder(nodes);

  const conceptOrder = [...nodes].sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((n) => n.id);

  await db
    .insert(chapters)
    .values({ id: chapterId, title: content.title, subjectId, examId: content.exam, conceptOrder })
    .onConflictDoUpdate({ target: chapters.id, set: { title: content.title, conceptOrder } });

  for (const n of nodes) {
    const prereqsInChapter = (n.prereqs ?? []).filter((p) => conceptOrder.includes(p));
    await db
      .insert(concepts)
      .values({
        id: n.id,
        chapterId,
        slug: n.slug,
        title: n.title,
        role: n.role,
        sec: n.sec ?? null,
        order: order.get(n.id)!,
        brief: n.brief ?? '',
        explanation: n.explanation ?? '',
        keyMoves: n.keyMoves ?? [],
        misconceptions: n.misconceptions ?? [],
        prereqs: prereqsInChapter,
      })
      .onConflictDoUpdate({
        target: concepts.id,
        set: {
          title: n.title,
          role: n.role,
          sec: n.sec ?? null,
          order: order.get(n.id)!,
          brief: n.brief ?? '',
          explanation: n.explanation ?? '',
          keyMoves: n.keyMoves ?? [],
          misconceptions: n.misconceptions ?? [],
          prereqs: prereqsInChapter,
        },
      });
  }

  // One gate per node: first exam item whose nodeId matches.
  const seen = new Set<string>();
  let gateCount = 0;
  for (const item of examItems) {
    if (seen.has(item.nodeId)) continue;
    seen.add(item.nodeId);
    const gateId = `${item.nodeId}:g1`;
    await db
      .insert(gates)
      .values({
        id: gateId,
        conceptId: item.nodeId,
        kind: item.kind ?? 'book',
        prompt: item.prompt,
        answerType: item.answerType,
        grader: item.grader,
        expected: item.expected,
        srcLabel: item.srcLabel ?? null,
        quote: item.quote ?? null,
      })
      .onConflictDoUpdate({
        target: gates.id,
        set: {
          prompt: item.prompt,
          answerType: item.answerType,
          grader: item.grader,
          expected: item.expected,
          srcLabel: item.srcLabel ?? null,
          quote: item.quote ?? null,
        },
      });
    gateCount++;
  }

  return { chapterId, title: content.title, nodes: nodes.length, gates: gateCount };
}

async function main() {
  const entries = await fs.readdir(MATHS_DIR, { withFileTypes: true });
  const chapterDirs = entries
    .filter((e) => e.isDirectory() && /^jemh\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();

  console.log(`Loading ${chapterDirs.length} chapters from ${MATHS_DIR}\n`);
  let totalNodes = 0;
  let totalGates = 0;
  for (const name of chapterDirs) {
    const r = await loadChapter(path.join(MATHS_DIR, name));
    totalNodes += r.nodes;
    totalGates += r.gates;
    console.log(`  ${name}  ${r.title.padEnd(28)} ${String(r.nodes).padStart(3)} nodes  ${String(r.gates).padStart(3)} gates`);
  }
  console.log(`\nDone: ${chapterDirs.length} chapters, ${totalNodes} nodes, ${totalGates} gates.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

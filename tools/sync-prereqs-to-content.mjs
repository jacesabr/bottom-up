// Sync prereqs (and add any DB-only bridge nodes' prereqs) from the live DB back into content/*.json
// so the source of truth matches the authored DB. ONLY updates node.prereqs on existing nodes — never
// deletes nodes. No LLM/API. Run: node tools/sync-prereqs-to-content.mjs
import 'dotenv/config'; import pg from 'pg'; import fs from 'fs'; import path from 'path';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query('select id, prereqs from concepts');
const byId = new Map(rows.map(r => [r.id, r.prereqs || []]));
await pool.end();
function walk(dir){ let out=[]; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) out=out.concat(walk(p)); else if(e.name==='content.json') out.push(p);} return out; }
let files=0, changed=0, nodesUpd=0;
for(const f of walk('content')){
  const j=JSON.parse(fs.readFileSync(f,'utf8'));
  if(!Array.isArray(j.nodes)) continue; files++;
  let dirty=false;
  for(const n of j.nodes){
    const db=byId.get(n.id); if(!db) continue;
    const cur=JSON.stringify((n.prereqs||[]).slice().sort());
    const next=JSON.stringify(db.slice().sort());
    if(cur!==next){ n.prereqs=db; dirty=true; nodesUpd++; }
  }
  if(dirty){ fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n'); changed++; }
}
console.log(`synced: ${files} files scanned, ${changed} files updated, ${nodesUpd} nodes' prereqs synced`);

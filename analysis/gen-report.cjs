/* Builds the single-page HTML coverage report from the per-paper analysis dossiers
 * (analysis/data/analysis-*.json) produced by the analysis agents. Self-contained: embeds the
 * data + a small vanilla-JS UI (tabs + filters). Tolerant of missing dossiers (skips them). */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data');
const ORDER = [
  ['analysis-cbse10-standard.json', 'CBSE 10 · Standard'],
  ['analysis-cbse10-basic.json', 'CBSE 10 · Basic'],
  ['analysis-cbse12.json', 'CBSE 12'],
  ['analysis-jee-adv.json', 'JEE Advanced'],
  ['analysis-jee-main.json', 'JEE Main'],
];

const papers = [];
for (const [file, label] of ORDER) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) { console.warn('missing (skipped):', file); continue; }
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    d._label = label;
    papers.push(d);
  } catch (e) { console.error('bad JSON, skipped:', file, e.message); }
}
if (!papers.length) { console.error('No dossiers found — run the analysis agents first.'); process.exit(1); }

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maths exams · node-coverage & difficulty audit</title>
<style>
  :root{--ink:#1a1d21;--dim:#6b7280;--line:#e5e7eb;--bg:#fbfbfc;--card:#fff;
        --green:#1d7a35;--green-bg:#e7f5ea;--amber:#9a6b06;--amber-bg:#fdf3df;--red:#b3261e;--red-bg:#fbe9e7;--accent:#1330aa;}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
  header{padding:22px 26px 12px;max-width:1100px;margin:0 auto}
  h1{font-size:22px;margin:0 0 2px}
  .sub{color:var(--dim);font-size:13px}
  .wrap{max-width:1100px;margin:0 auto;padding:0 26px 60px}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding:12px 0;border-bottom:1px solid var(--line);z-index:5}
  .tab{padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);cursor:pointer;font-size:13px;color:var(--ink)}
  .tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  .tab .n{opacity:.7;font-size:11px;margin-left:5px}
  .stripe{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  .stat{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:9px 14px;min-width:120px}
  .stat b{font-size:20px;display:block;line-height:1.1}
  .stat span{font-size:11px;color:var(--dim)}
  .filters{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}
  .fbtn{font-size:12px;padding:4px 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);cursor:pointer;color:var(--dim)}
  .fbtn.on{border-color:var(--accent);color:var(--accent);font-weight:600}
  .q{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 16px;margin:10px 0}
  .qh{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:8px;flex-wrap:wrap}
  .qn{font-size:18px;font-weight:700;color:var(--accent)}
  .qmeta{color:var(--dim);font-size:12px}
  .badges{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
  .b{font-size:10.5px;font-weight:600;border-radius:999px;padding:2px 9px;white-space:nowrap}
  .b.green{background:var(--green-bg);color:var(--green)} .b.amber{background:var(--amber-bg);color:var(--amber)} .b.red{background:var(--red-bg);color:var(--red)} .b.grey{background:#eef0f2;color:#555}
  .variant{margin:4px 0 6px}
  .vlabel{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#a35}
  .prompt{font-size:13px}
  .opts{columns:2;font-size:12px;color:#333;margin:3px 0 2px;padding-left:18px}
  .ans{font-size:11.5px;color:var(--green);background:var(--green-bg);display:inline-block;border-radius:5px;padding:1px 8px;margin-top:2px}
  .row{display:flex;gap:8px;padding:5px 0;border-top:1px solid #f1f2f4;font-size:12.5px}
  .row:first-of-type{border-top:none}
  .rlab{width:120px;flex:none;color:var(--dim);font-size:11px;padding-top:1px}
  .chip{display:inline-block;background:#eef1f7;border:1px solid #dfe4ee;border-radius:6px;padding:1px 7px;font-size:11px;font-family:'SF Mono',Consolas,monospace;color:#244;margin:1px 3px 1px 0}
  ul.cc{margin:0;padding-left:16px} ul.cc li{margin:1px 0}
  .flag{font-size:12px;background:var(--red-bg);border-left:3px solid var(--red);padding:5px 9px;border-radius:4px;margin:5px 0}
  .flag.ms{background:#fff3e0;border-color:#d68000}
  .flag .ft{font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.05em}
  .flag .fix{color:#1d6b1d;margin-top:2px}
  .findings{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 16px;margin:12px 0}
  .findings h3{margin:.1em 0 .5em}
  .ft-row{display:flex;gap:10px;font-size:12.5px;padding:6px 0;border-top:1px solid #f1f2f4}
  .hidden{display:none}
  .note{color:var(--dim);font-size:12px;margin:3px 0 0}
</style></head><body>
<header>
  <h1>Maths exams — node coverage &amp; difficulty audit</h1>
  <div class="sub">Every exam question vs. the teaching-node graph: which nodes teach the concept, and whether the node's own practice (its gates) is hard enough to prepare a student for that question.</div>
</header>
<div class="wrap">
  <div class="tabs" id="tabs"></div>
  <div id="panel"></div>
</div>
<script>
const DATA = ${JSON.stringify(papers)};
const pretty = s => (s||'').split(':').pop().replace(/-/g,' ');
const covB = c => c==='full'?['green','covered']:c==='partial'?['amber','partial']:['red','GAP'];
const gateB = g => g==='sufficient'?['green','practice ✓']:g==='borderline'?['amber','practice ~']:['red','practice ✗'];
const diffB = d => /hard/i.test(d)?['red',d]:/med/i.test(d)?['amber',d]:['grey',d||'—'];
let cur = -1, filter = 'all';

// Authoritative stats are recomputed from the per-question data (agent summary fields were inconsistent).
function pstats(p){const o={q:0,full:0,part:0,gap:0,suf:0,insuf:0,bord:0,flags:[]};for(const qq of p.questions||[]){o.q++;if(qq.coverage==='full')o.full++;else if(qq.coverage==='partial')o.part++;else if(qq.coverage==='gap')o.gap++;if(qq.gateDifficulty==='sufficient')o.suf++;else if(qq.gateDifficulty==='insufficient')o.insuf++;else if(qq.gateDifficulty==='borderline')o.bord++;(qq.flags||[]).forEach(f=>o.flags.push(Object.assign({q:qq.q},f)));}return o;}
function overallStats(){const t={q:0,full:0,part:0,gap:0,suf:0,insuf:0,flags:0};for(const p of DATA){const s=pstats(p);t.q+=s.q;t.full+=s.full;t.part+=s.part;t.gap+=s.gap;t.suf+=s.suf;t.insuf+=s.insuf;t.flags+=s.flags.length;}return t;}
function stat(b,s){return '<div class="stat"><b>'+b+'</b><span>'+s+'</span></div>';}

function renderTabs(){
  const o=overallStats();
  let h='<div class="tab '+(cur===-1?'on':'')+'" onclick="sel(-1)">Overview</div>';
  DATA.forEach((p,i)=>{h+='<div class="tab '+(cur===i?'on':'')+'" onclick="sel('+i+')">'+p._label+'<span class="n">'+((p.summary||{}).totalQuestions||(p.questions||[]).length)+'</span></div>';});
  document.getElementById('tabs').innerHTML=h;
}
function sel(i){cur=i;filter='all';render();}
function setF(f){filter=f;render();}

function badges(qq){
  const c=covB(qq.coverage), g=gateB(qq.gateDifficulty), d=diffB(qq.examDifficulty);
  let h='<div class="badges">';
  h+='<span class="b '+c[0]+'">'+c[1]+'</span>';
  h+='<span class="b '+g[0]+'">'+g[1]+'</span>';
  h+='<span class="b '+d[0]+'">'+d[1]+'</span>';
  if((qq.flags||[]).length) h+='<span class="b red">⚑ '+qq.flags.length+'</span>';
  h+='</div>';return h;
}
function variantHtml(v){
  let h='<div class="variant">';
  if(v.label) h+='<div class="vlabel">'+v.label+'</div>';
  h+='<div class="prompt">'+esc(v.prompt)+'</div>';
  if(v.options&&v.options.length) h+='<ol class="opts" type="A">'+v.options.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ol>';
  if(v.answer) h+='<div class="ans">ans: '+esc(v.answer)+'</div>';
  return h+'</div>';
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function flagHtml(f){return '<div class="flag '+(f.type==='marking-scheme'?'ms':'')+'"><span class="ft">'+esc(f.type)+'</span> '+esc(f.detail)+(f.fix?'<div class="fix">→ '+esc(f.fix)+'</div>':'')+'</div>';}

function qShown(qq){
  if(filter==='all') return true;
  if(filter==='gaps') return qq.coverage!=='full';
  if(filter==='diff') return qq.gateDifficulty==='insufficient'||qq.gateDifficulty==='borderline';
  if(filter==='flag') return (qq.flags||[]).length>0;
  return true;
}
function qCard(qq){
  let h='<div class="q"><div class="qh"><span class="qn">Q'+qq.q+'</span><span class="qmeta">Sec '+(qq.section||'')+' · '+(qq.marks||'?')+'m · '+(qq.type||'')+'</span>'+badges(qq)+'</div>';
  (qq.variants||[]).forEach(v=>h+=variantHtml(v));
  h+='<div class="row"><div class="rlab">Concepts</div><div><ul class="cc">'+(qq.concepts||[]).map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></div></div>';
  h+='<div class="row"><div class="rlab">Nodes that teach it</div><div>'+(qq.nodesTeaching||[]).map(n=>'<span class="chip" title="'+esc(n)+'">'+esc(pretty(n))+'</span>').join('')+(qq.nodeTagged?'<div class="note">tagged: <span class="chip">'+esc(qq.nodeTagged)+'</span></div>':'')+'</div></div>';
  if(qq.coverageNote) h+='<div class="row"><div class="rlab">Coverage</div><div>'+esc(qq.coverageNote)+'</div></div>';
  if(qq.difficultyNote) h+='<div class="row"><div class="rlab">Difficulty fit</div><div>'+esc(qq.difficultyNote)+'</div></div>';
  (qq.flags||[]).forEach(f=>h+=flagHtml(f));
  return h+'</div>';
}

function renderPaper(p){
  const s=pstats(p);
  let h='<div class="stripe">'+stat(s.q,'questions')+stat(s.full,'covered in full')+stat(s.part,'partial')+stat(s.gap,'gaps')+stat(s.suf,'practice hard enough')+stat(s.insuf,'practice too easy')+'</div>';
  h+='<div class="filters">'+
     '<span class="fbtn '+(filter==='all'?'on':'')+'" onclick="setF(\\'all\\')">all</span>'+
     '<span class="fbtn '+(filter==='gaps'?'on':'')+'" onclick="setF(\\'gaps\\')">gaps &amp; partial</span>'+
     '<span class="fbtn '+(filter==='diff'?'on':'')+'" onclick="setF(\\'diff\\')">practice too easy</span>'+
     '<span class="fbtn '+(filter==='flag'?'on':'')+'" onclick="setF(\\'flag\\')">flagged</span></div>';
  const flags=s.flags||[];
  if(flags.length){h+='<div class="findings"><h3>Flags to fix ('+flags.length+')</h3>'+flags.map(f=>'<div class="ft-row"><b>Q'+(f.q!=null?f.q:'?')+'</b><span>'+flagHtml(f)+'</span></div>').join('')+'</div>';}
  const shown=(p.questions||[]).filter(qShown);
  h+=shown.map(qCard).join('')||'<p class="note">No questions match this filter.</p>';
  return h;
}
const FIXES_HTML = [
'<div class="findings" style="border-color:#bfe0c4;background:#f3faf4">',
'<h3>✅ Fixes applied this session</h3>',
'<div class="ft-row"><b style="width:170px;flex:none">25 new teaching nodes</b><span>authored to fill the content gaps below (each with a practice gate + prerequisites + NCERT grounding), reloaded into the live DB:',
'<div class="note"><b>CBSE10:</b> build-quadratic-from-transformed-zeroes · vertex-of-parabola · counter-examples-irrational-rules</div>',
'<div class="note"><b>CBSE12:</b> definite-integral-symmetry (King\\'s rule) · distance-from-coordinate-axis · derivative-first-principles-functional-equation · infer-constraints-from-feasible-region · distance-parallel-to-axis</div>',
'<div class="note"><b>JEE Class-11:</b> define-arithmetic-progression · find-nth-term-of-ap · sum-of-n-terms-of-ap · derive-term-from-partial-sum · inclusion-exclusion-principle · recover-vertices-from-midpoints · compute-incentre-of-triangle · vieta-formulas-and-conjugate-root-theorem · compute-mean-of-grouped-data · tangent-to-circle-from-external-point · tangent-to-ellipse-slope-form</div>',
'<div class="note"><b>JEE Class-12:</b> cayley-hamilton-theorem · scalar-triple-product · mean-and-variance-of-discrete-distribution · foot-of-perpendicular-to-a-line-3d · logarithm-laws-and-change-of-base · inverse-function-integral-identity</div>',
'</span></div>',
'<div class="ft-row"><b style="width:170px;flex:none">2 marking-scheme bugs</b><span>CBSE10 Std Q30 (60° sector → 17.9 cm², was 69.23) · CBSE10 Basic Q38(iii) (cylinder CSA → 21.9π, was 6.15π)</span></div>',
'<div class="ft-row"><b style="width:170px;flex:none">21 questions retagged</b><span>to the new/correct nodes (AP, incentre, Cayley-Hamilton, King\\'s rule, vertex, scalar triple product, …)</span></div>',
'<div class="ft-row"><b style="width:170px;flex:none">5 deferred</b><span>JEE-Advanced one-offs not force-authored: ℤ[√2] closure · e^{iπ√2}/irrationality of π√2 · positive-definite forms · piecewise injectivity/surjectivity · skew-symmetric singularity</span></div>',
'<div class="note" style="margin-top:8px">Note: the per-question flags below are the <b>pre-fix audit record</b>. The content-gap flags are now addressed by the nodes above; the difficulty-tier uplift (harder gates across CBSE12 + JEE) was scoped out for a later pass.</div>',
'</div>'
].join('');
function renderOverview(){
  const o=overallStats();
  let h=FIXES_HTML+'<div class="stripe">'+stat(o.q,'questions across '+DATA.length+' papers')+stat(o.full,'covered in full')+stat(o.part,'partial')+stat(o.gap,'gaps')+stat(o.suf,'practice hard enough')+stat(o.insuf,'practice too easy')+stat(o.flags,'flags to fix')+'</div>';
  h+='<div class="findings"><h3>Per-paper</h3>';
  DATA.forEach((p,i)=>{const s=pstats(p);h+='<div class="ft-row"><b style="width:150px;flex:none">'+p._label+'</b><span>'+s.full+' full · '+s.part+' partial · <b style="color:var(--red)">'+s.gap+' gaps</b> · '+s.insuf+' practice-too-easy · '+s.flags.length+' flags &nbsp; <a href="#" onclick="sel('+i+');return false">open →</a></span></div>';});
  h+='</div>';
  // all flags consolidated
  let all=[];DATA.forEach(p=>pstats(p).flags.forEach(f=>all.push(Object.assign({paper:p._label},f))));
  if(all.length){h+='<div class="findings"><h3>Every flag, all papers ('+all.length+')</h3>'+all.map(f=>'<div class="ft-row"><b style="width:150px;flex:none">'+f.paper+' Q'+(f.q!=null?f.q:'?')+'</b><span>'+flagHtml(f)+'</span></div>').join('')+'</div>';}
  return h;
}
function render(){renderTabs();document.getElementById('panel').innerHTML = cur===-1?renderOverview():renderPaper(DATA[cur]);window.scrollTo(0,0);}
render();
</script>
</body></html>`;

const out = path.join(__dirname, 'maths-coverage-report.html');
fs.writeFileSync(out, html);
console.log('wrote', out, '—', papers.length, 'papers,', papers.reduce((s, p) => s + (p.questions || []).length, 0), 'questions');

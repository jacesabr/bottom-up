/**
 * gen-learn-pages.ts — public knowledge layer for Sarthi (SEO "optimize_find" project, Phase 1).
 *
 * Sarthi is a client-rendered SPA: crawlers see an empty shell and there's one real URL for the whole maths
 * corpus. This projects a CURATED, crawlable syllabus out front, two levels deep:
 *   - /learn/                              hub: the three maths tracks
 *   - /learn/<track>/                      a track's chapters (CBSE Class 10 / 12 / JEE maths)
 *   - /learn/<track>/<chapter>/            one page per chapter: its concepts as titles + one-line briefs
 *
 * CURATION LINE: chapter titles + concept TITLES and BRIEFS only (syllabus). No `explanation`/keyMoves/gates
 * — the teaching stays in the gated app. Each page funnels to the app with a sign-up CTA.
 *
 * Output → public/learn/ (Vite copies public/ into the build) + regenerated public/sitemap.xml.
 * Re-run after corpus changes:  npx tsx tools/gen-learn-pages.ts   (not build-wired; committed output)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'public', 'learn');
const SITE = 'https://bottom-up-web.onrender.com';

const TRACKS = [
  { dir: 'cbse10/maths', slug: 'cbse-class-10-maths', label: 'CBSE Class 10 Maths', level: 'CBSE Class 10' },
  { dir: 'cbse12/mathematics', slug: 'cbse-class-12-maths', label: 'CBSE Class 12 Mathematics', level: 'CBSE Class 12' },
  { dir: 'jee/maths', slug: 'jee-maths', label: 'JEE Maths', level: 'JEE' },
];

interface Concept { title: string; brief: string; }
interface Chapter { slug: string; title: string; concepts: Concept[]; }
interface Track { slug: string; label: string; level: string; chapters: Chapter[]; }

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clean = (s: string) => String(s ?? '')
  .replace(/\*\*(.*?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\$\$?([^$]*)\$\$?/g, '$1')
  .replace(/\s+/g, ' ').trim();
const slugify = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const truncate = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

function loadTracks(): Track[] {
  const out: Track[] = [];
  for (const t of TRACKS) {
    const base = join(CONTENT, t.dir);
    if (!existsSync(base)) continue;
    const dirs = readdirSync(base).filter((d) => {
      const p = join(base, d);
      return statSync(p).isDirectory() && existsSync(join(p, 'content.json'));
    }).sort();
    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    for (const dir of dirs) {
      const d = JSON.parse(readFileSync(join(base, dir, 'content.json'), 'utf-8'));
      let slug = slugify(d.title) || dir;
      if (seen.has(slug)) slug = dir;
      seen.add(slug);
      const concepts: Concept[] = (d.nodes ?? [])
        .map((n: any) => ({ title: clean(n.title), brief: clean(n.brief) }))
        .filter((c: Concept) => c.title);
      chapters.push({ slug, title: clean(d.title), concepts });
    }
    out.push({ slug: t.slug, label: t.label, level: t.level, chapters });
  }
  return out;
}

function page(opts: { title: string; desc: string; url: string; jsonld: object; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.desc)}" />
<link rel="canonical" href="${esc(opts.url)}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="theme-color" content="#b5562a" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Sarthi" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.desc)}" />
<meta property="og:url" content="${esc(opts.url)}" />
<meta property="og:locale" content="en_IN" />
<link rel="stylesheet" href="/learn/learn.css" />
<script type="application/ld+json">
${JSON.stringify(opts.jsonld, null, 2)}
</script>
</head>
<body>
<main>
${opts.body}
<footer>
<p>Sarthi — CBSE &amp; JEE maths, learned bottom-up. <a href="/">Start learning →</a></p>
</footer>
</main>
</body>
</html>
`;
}

const cta = `<p class="cta"><a href="/">▶ Start learning with the AI tutor — free to begin</a></p>`;
const crumb = (parts: Array<[string, string | null]>) =>
  `<nav class="crumbs">${parts.map(([name, href]) => href ? `<a href="${esc(href)}">${esc(name)}</a>` : `<span>${esc(name)}</span>`).join(' › ')}</nav>`;

function hubPage(tracks: Track[]): string {
  const totalCh = tracks.reduce((n, t) => n + t.chapters.length, 0);
  const items = tracks.map((t) => `<li>
  <a href="/learn/${esc(t.slug)}/"><strong>${esc(t.label)}</strong></a>
  <span class="meta">${t.chapters.length} chapters</span>
</li>`).join('\n');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Learn maths with Sarthi — CBSE & JEE syllabus', url: `${SITE}/learn/`,
    description: `Free chapter-wise maths syllabus for CBSE Class 10, CBSE Class 12 and JEE — ${totalCh} chapters, taught bottom-up.`,
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/learn/` }] },
    mainEntity: { '@type': 'ItemList', numberOfItems: tracks.length,
      itemListElement: tracks.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.label, url: `${SITE}/learn/${t.slug}/` })) },
  };
  const body = `${crumb([['Home', '/'], ['Learn', null]])}
<h1>Learn maths with Sarthi</h1>
<p class="lede">Master maths the bottom-up way — chapter by chapter, concept by concept, with an AI tutor that
checks you understand each idea before the next unlocks, then a full past board paper. Pick your track:</p>
${cta}
<ul class="chapters">
${items}
</ul>
<p>Across all tracks: ${totalCh} chapters covering the CBSE Class 10, CBSE Class 12 and JEE maths syllabus.</p>`;
  return page({ title: 'Learn maths with Sarthi — CBSE Class 10 & 12, JEE syllabus',
    desc: truncate(`Free chapter-wise maths syllabus for CBSE Class 10, CBSE Class 12 and JEE — ${totalCh} chapters taught bottom-up by an AI tutor, then a full past board paper.`, 158),
    url: `${SITE}/learn/`, jsonld, body });
}

function trackPage(t: Track): string {
  const url = `${SITE}/learn/${t.slug}/`;
  const items = t.chapters.map((c, i) => `<li>
  <a href="/learn/${esc(t.slug)}/${esc(c.slug)}/"><strong>${esc(c.title)}</strong></a>
  <span class="meta">${c.concepts.length} concept${c.concepts.length === 1 ? '' : 's'}</span>
  ${c.concepts[0] ? `<div class="teaser">${esc(truncate(c.concepts[0].brief, 150))}</div>` : ''}
</li>`).join('\n');
  const total = t.chapters.reduce((n, c) => n + c.concepts.length, 0);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Course', name: `${t.label} — learned bottom-up`, url,
    description: `${t.label}: the full chapter-wise syllabus (${t.chapters.length} chapters, ${total} concepts) taught bottom-up by an AI tutor.`,
    inLanguage: 'en', educationalLevel: t.level,
    provider: { '@type': 'EducationalOrganization', name: 'Sarthi', url: `${SITE}/` },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/learn/` },
      { '@type': 'ListItem', position: 3, name: t.label, item: url }] },
    hasPart: t.chapters.map((c) => ({ '@type': 'LearningResource', name: c.title, url: `${SITE}/learn/${t.slug}/${c.slug}/` })),
  };
  const body = `${crumb([['Home', '/'], ['Learn', '/learn/'], [t.label, null]])}
<p class="kicker">${esc(t.level)} · Maths</p>
<h1>${esc(t.label)}</h1>
<p class="lede">The complete ${esc(t.label)} syllabus, ${t.chapters.length} chapters, taught bottom-up: the AI
tutor builds each concept from the ground up, checks you've got it, then sets past board / exam questions.
Choose a chapter:</p>
${cta}
<ol class="chapters">
${items}
</ol>`;
  return page({ title: `${t.label} — full syllabus, chapter-wise | Sarthi`,
    desc: truncate(`${t.label} syllabus chapter by chapter — ${t.chapters.length} chapters taught bottom-up by an AI tutor, then past board / exam questions.`, 158),
    url, jsonld, body });
}

function chapterPage(t: Track, c: Chapter, prev: Chapter | null, next: Chapter | null): string {
  const url = `${SITE}/learn/${t.slug}/${c.slug}/`;
  const list = c.concepts.map((x) => `<li><strong>${esc(x.title)}</strong>${x.brief ? ` — ${esc(x.brief)}` : ''}</li>`).join('\n');
  const names = c.concepts.slice(0, 3).map((x) => x.title).join(', ');
  const desc = truncate(`${c.title} — ${t.label}. ${c.concepts.length} concepts taught bottom-up: ${names}.`, 158);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'LearningResource', name: `${c.title} — ${t.label}`, url, description: desc,
    inLanguage: 'en', learningResourceType: 'Course chapter', educationalLevel: t.level,
    isPartOf: { '@type': 'Course', name: t.label, url: `${SITE}/learn/${t.slug}/` },
    teaches: c.concepts.map((x) => x.title),
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/learn/` },
      { '@type': 'ListItem', position: 3, name: t.label, item: `${SITE}/learn/${t.slug}/` },
      { '@type': 'ListItem', position: 4, name: c.title, item: url }] },
  };
  const nav = `<nav class="pager">
${prev ? `<a href="/learn/${esc(t.slug)}/${esc(prev.slug)}/">← ${esc(prev.title)}</a>` : '<span></span>'}
${next ? `<a href="/learn/${esc(t.slug)}/${esc(next.slug)}/">${esc(next.title)} →</a>` : '<span></span>'}
</nav>`;
  const body = `${crumb([['Home', '/'], ['Learn', '/learn/'], [t.label, `/learn/${t.slug}/`], [c.title, null]])}
<p class="kicker">${esc(t.label)}</p>
<h1>${esc(c.title)}</h1>
<p class="lede">This chapter of ${esc(t.label)} covers ${c.concepts.length}
concept${c.concepts.length === 1 ? '' : 's'}, taught bottom-up. The AI tutor builds each from the ground up
and checks you understand it before the next. Here's what you'll work through:</p>
<ol class="concepts">
${list}
</ol>
${cta}
${nav}`;
  return page({ title: `${c.title} — ${t.label} | Sarthi`, desc, url, jsonld, body });
}

const CSS = `:root{--ink:#23201b;--muted:#6b6459;--line:#e7e2d8;--bg:#fbfaf7;--accent:#b5562a;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;font-size:17px;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 22px 90px}
a{color:var(--accent)}
h1{font-size:1.7rem;line-height:1.2;letter-spacing:-.01em;margin:.1em 0 .4em}
.kicker{text-transform:uppercase;letter-spacing:.06em;font-size:.72rem;color:var(--muted);margin:0 0 .2em}
.crumbs{font-size:.85rem;color:var(--muted);margin-bottom:1.4em}
.crumbs a{color:var(--muted)}
.lede{font-size:1.06rem;color:#2c281f}
.cta{margin:1.6em 0}
.cta a{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;
 padding:.7em 1.2em;border-radius:8px}
ul.chapters,ol.chapters{list-style:none;padding:0;counter-reset:ch}
ol.chapters{ }
ul.chapters li,ol.chapters li{border:1px solid var(--line);border-radius:10px;padding:14px 16px;
 margin:.55em 0;background:#fff}
ol.chapters li{counter-increment:ch;padding-left:46px;position:relative}
ol.chapters li::before{content:counter(ch);position:absolute;left:14px;top:14px;color:var(--accent);
 font-weight:700;font-variant-numeric:tabular-nums}
.chapters .meta{color:var(--muted);font-size:.8rem;margin-left:.5em}
.chapters .teaser{color:#4a463d;font-size:.92rem;margin-top:.3em}
ol.concepts{padding-left:1.2em}
ol.concepts li{margin:.5em 0}
.pager{display:flex;justify-content:space-between;gap:1em;margin:2em 0 0;font-size:.92rem}
footer{margin-top:3em;padding-top:1.4em;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
footer a{color:var(--accent)}`;

function sitemap(tracks: Track[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls: Array<{ loc: string; pr: string; cf: string }> = [
    { loc: `${SITE}/`, pr: '1.0', cf: 'weekly' },
    { loc: `${SITE}/learn/`, pr: '0.9', cf: 'weekly' },
    { loc: `${SITE}/why-sarthi.html`, pr: '0.6', cf: 'monthly' },
    { loc: `${SITE}/how-it-works.html`, pr: '0.6', cf: 'monthly' },
  ];
  for (const t of tracks) {
    urls.push({ loc: `${SITE}/learn/${t.slug}/`, pr: '0.8', cf: 'weekly' });
    for (const c of t.chapters) urls.push({ loc: `${SITE}/learn/${t.slug}/${c.slug}/`, pr: '0.7', cf: 'monthly' });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by tools/gen-learn-pages.ts — do not hand-edit; re-run the script.
     (pitch.html is an investor pitch deck — intentionally NOT listed.) -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.cf}</changefreq>\n    <priority>${u.pr}</priority>\n  </url>`).join('\n')}
</urlset>
`;
}

// ---- run -------------------------------------------------------------------
const tracks = loadTracks();
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'learn.css'), CSS);
writeFileSync(join(OUT, 'index.html'), hubPage(tracks));
let chCount = 0, coCount = 0;
for (const t of tracks) {
  mkdirSync(join(OUT, t.slug), { recursive: true });
  writeFileSync(join(OUT, t.slug, 'index.html'), trackPage(t));
  for (let i = 0; i < t.chapters.length; i++) {
    const c = t.chapters[i];
    mkdirSync(join(OUT, t.slug, c.slug), { recursive: true });
    writeFileSync(join(OUT, t.slug, c.slug, 'index.html'), chapterPage(t, c, t.chapters[i - 1] ?? null, t.chapters[i + 1] ?? null));
    chCount++; coCount += c.concepts.length;
  }
}
writeFileSync(join(ROOT, 'public', 'sitemap.xml'), sitemap(tracks));
console.log(`✓ generated /learn hub + ${tracks.length} tracks + ${chCount} chapter pages (${coCount} concepts) + sitemap.xml`);
console.log(`  output: public/learn/  ·  site: ${SITE}/learn/`);

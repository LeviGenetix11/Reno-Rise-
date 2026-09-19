// Static QA for the marketing site. Run: node tools/site/check.js
// Exits non-zero when it finds a problem.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { walk, relOf, urlPathOf } = require('./sync');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://www.renosrise.com';
const problems = [];
const warn = (rel, msg) => problems.push(`${rel}: ${msg}`);

const files = walk(ROOT);
const pages = new Map(); // urlPath -> { rel, html, ids }
for (const f of files) {
  const rel = relOf(f);
  const html = fs.readFileSync(f, 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  pages.set(rel, { rel, html, ids, urlPath: urlPathOf(rel) });
}

// ---- resolve a link found on `fromRel` to a file (or null) ----
function resolveTarget(fromRel, ref) {
  let [p, hash] = ref.split('#');
  p = p.split('?')[0];
  const fromUrl = new URL(`${SITE}/${urlPathOf(fromRel)}`);
  const u = new URL(p || '.', fromUrl);
  let pathname = decodeURIComponent(u.pathname);
  let rel = pathname.replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return { rel, hash, exists: fs.existsSync(path.join(ROOT, rel)), isHtml: rel.endsWith('.html') };
}

const seenTitles = new Map();
const seenDescs = new Map();
const FORBIDDEN = [
  [/15k\+|Happy Clients/i, 'unverifiable customer count'],
  [/pravatar|google-badge|testimonial-card/i, 'fabricated-looking testimonial/avatars'],
  [/GeneralContractor|AggregateRating|"Review"|"LocalBusiness"/, 'unsupported structured data'],
  [/Reno Rise Renovations|RenoRise</i, 'old brand name'],
  [/48 hours|24-hour|24 hour|within one business day/i, 'quote-turnaround promise'],
  [/free (?:in-home )?(?:assessment|quote|estimate)|no-obligation/i, 'free/quote promise'],
  [/licensed (?:and|&amp;|&) insured|licensed, insured/i, 'blanket licensing/insurance claim'],
  [/one (?:licensed )?crew|our (?:own )?crews?|we pull|pulled every permit|every crew/i, 'own-crew / permit claim'],
  [/href="#"/, 'placeholder # link'],
  [/Daniel Reyes|Lead Renovation Consultant/i, 'invented staff member'],
];

for (const { rel, html, urlPath } of pages.values()) {
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (!title) warn(rel, 'missing <title>');
  if (!desc) warn(rel, 'missing meta description');
  else if (desc.length > 200) warn(rel, `meta description long (${desc.length})`);
  const plainTitle = title ? title.replace(/&amp;/g, '&') : '';
  if (plainTitle.length > 75) warn(rel, `title long (${plainTitle.length})`);
  if (h1s !== 1) warn(rel, `${h1s} <h1> elements`);
  if (title) seenTitles.set(title, [...(seenTitles.get(title) || []), rel]);
  if (desc) seenDescs.set(desc, [...(seenDescs.get(desc) || []), rel]);

  if (rel !== '404.html') {
    const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (!canon) warn(rel, 'missing canonical');
    else if (canon !== `${SITE}/${urlPath}`) warn(rel, `canonical ${canon} != ${SITE}/${urlPath}`);
    if (!/property="og:title"/.test(html)) warn(rel, 'missing og:title');
    if (!/property="og:image"/.test(html)) warn(rel, 'missing og:image');
  }
  // og:image files must exist locally
  const og = (html.match(/property="og:image" content="https:\/\/www\.renosrise\.com\/([^"]+)"/) || [])[1];
  if (og && !fs.existsSync(path.join(ROOT, og))) warn(rel, `og:image not found: ${og}`);

  // images
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) warn(rel, `img without alt: ${m[0].slice(0, 80)}`);

  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { warn(rel, `invalid JSON-LD: ${e.message}`); }
  }
  // headings order (no skipped levels inside main)
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [html])[0];
  let prev = 0;
  for (const m of main.matchAll(/<h([1-6])[\s>]/g)) {
    const lvl = Number(m[1]);
    if (prev && lvl > prev + 1) { warn(rel, `heading level jumps h${prev} -> h${lvl}`); break; }
    prev = lvl;
  }
  // forbidden content (outside <script> and outside the tools)
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, (s) => (/ld\+json/.test(s) ? s : ''));
  for (const [re, why] of FORBIDDEN) if (re.test(visible)) warn(rel, `forbidden content: ${why} (${re})`);

  // links / assets
  for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const ref = m[1];
    if (!ref || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    if (ref.startsWith('#')) {
      if (ref.length > 1 && !pages.get(rel).ids.has(ref.slice(1))) warn(rel, `dangling in-page anchor ${ref}`);
      continue;
    }
    if (rel === '404.html' && ref.startsWith('/')) {
      const t = resolveTarget('index.html', ref);
      if (!t.exists) warn(rel, `broken link ${ref}`);
      continue;
    }
    const t = resolveTarget(rel, ref);
    if (!t.exists) { warn(rel, `broken link ${ref} -> ${t.rel}`); continue; }
    if (/\/index\.html(#|$)/.test(ref) || ref === 'index.html') warn(rel, `non-canonical index.html link ${ref}`);
    if (t.hash && t.isHtml) {
      const target = pages.get(t.rel);
      if (target && !target.ids.has(t.hash)) warn(rel, `missing anchor #${t.hash} on ${t.rel}`);
    }
  }
}
for (const [t, rels] of seenTitles) if (rels.length > 1) warn(rels.join(', '), `duplicate <title> "${t}"`);
for (const [d, rels] of seenDescs) if (rels.length > 1) warn(rels.join(', '), `duplicate description`);

// ---- on-page SEO checklist (SEO_brief/on-page-seo.md) ----
require('./seo-checks').seoChecks(pages, warn);

// ---- service URLs must not disappear ----
try {
  const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', 'main'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const missing = tracked.filter((t) => /^(services|locations|blog|assessment)\/.*\.html$|^(index|about|contact)\.html$/.test(t)).filter((t) => !fs.existsSync(path.join(ROOT, t)));
  for (const m of missing) warn(m, 'existing page URL missing from working tree');
} catch (e) {
  console.log('(skipped git URL-preservation check:', e.message.split('\n')[0], ')');
}

// ---- sitemap consistency ----
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
for (const { rel, html, urlPath } of pages.values()) {
  if (rel === '404.html') continue;
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const inMap = locs.has(`${SITE}/${urlPath}`);
  if (noindex && inMap) warn(rel, 'noindex page listed in sitemap');
  if (!noindex && !inMap) warn(rel, 'indexable page missing from sitemap');
}
for (const l of locs) {
  const p = l.replace(`${SITE}/`, '');
  const rel = p === '' ? 'index.html' : p.endsWith('/') ? p + 'index.html' : p;
  if (!pages.has(rel)) warn('sitemap.xml', `lists a URL with no page: ${l}`);
}

console.log(`checked ${pages.size} pages`);
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems.slice(0, 200)) console.log(' - ' + p);
  process.exit(1);
}
console.log('no problems found');

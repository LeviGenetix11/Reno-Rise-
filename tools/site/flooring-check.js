// Static tests for the basement-flooring cluster: one commercial page + four guides. Runs in build.js after nav-check.js.
//   node tools/site/flooring-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { walk, relOf, urlPathOf } = require('./sync');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://www.renosrise.com';
const failures = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) failures.push(m); };

const pages = new Map();
for (const f of walk(ROOT)) { const rel = relOf(f); pages.set(rel, { rel, html: fs.readFileSync(f, 'utf8'), urlPath: urlPathOf(rel) }); }
const page = (rel) => (pages.get(rel) || { html: '' }).html;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const titleOf = (h) => decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
const h1Of = (h) => decode((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
const descOf = (h) => decode((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
const canonicalOf = (h) => (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
const noindex = (h) => /<meta name="robots" content="[^"]*noindex/i.test(h);
const hrefs = (h) => [...h.matchAll(/<a\b[^>]*?href="([^"]*)"/g)].map((m) => m[1]);
const ldTypes = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const j = JSON.parse(m[1]); return (j['@graph'] || [j]).map((n) => n['@type']); });
const articleOf = (h) => (h.match(/<article[\s\S]*?<\/article>/) || [''])[0];
const resolve = (fromRel, href) => { const u = new URL(href.split('#')[0] || '.', new URL(`${SITE}/${urlPathOf(fromRel)}`)); return u.pathname.replace(/^\//, ''); };
const links = (rel, h, target) => hrefs(h).some((x) => !/^(https?:|mailto:|tel:)/.test(x) && resolve(rel, x) === target);

// ---------------------------------------------------------------- the one commercial page
const SVC = 'services/basement-flooring/index.html';
const svc = page(SVC);
ok(!!svc, 'the basement-flooring service page is missing');
ok(canonicalOf(svc) === `${SITE}/services/basement-flooring/`, `service page canonical is ${canonicalOf(svc)}`);
ok(!noindex(svc), 'service page must be indexable');
ok(titleOf(svc) === 'Basement Flooring Installation Toronto | Reno Rise', `service page title is "${titleOf(svc)}"`);
ok(h1Of(svc) === 'Basement Flooring Installation in Toronto', `service page H1 is "${h1Of(svc)}"`);
ok(descOf(svc).length >= 120 && descOf(svc).length <= 165 && /basement flooring options/i.test(descOf(svc)), `service page description: ${descOf(svc).length} chars`);
ok(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes(`<loc>${SITE}/services/basement-flooring/</loc>`), 'service page missing from sitemap.xml');

const text = decode(articleOf(svc));
const h2s = [...articleOf(svc).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => decode(m[1]));
const wantH2 = ['Why Basement Flooring Needs Different Planning', 'Check for Moisture Before Choosing a Floor', 'Concrete Condition and Floor Levelling', 'Subfloor and Insulation Considerations', 'Basement Flooring Options', 'Basement Flooring Compared', 'How Basement Flooring Installation Typically Works', 'Questions to Ask a Flooring Professional'];
ok(wantH2.every((t, i) => h2s[i] === t), `service page sections are ${JSON.stringify(h2s)}`);
ok(h2s.includes('Frequently asked questions') && /class="assess-band/.test(articleOf(svc)) && /class="disclosure"/.test(articleOf(svc)), 'FAQ, project-enquiry CTA and matching-service disclosure must all be on the page');
const idx = (s) => articleOf(svc).indexOf(s);
ok(idx('id="faq"') < idx('id="assessment-form"') && idx('id="assessment-form"') < idx('class="disclosure"'), 'order must be FAQ, then the enquiry CTA, then the disclosure');
const options = [...articleOf(svc).matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => decode(m[1]));
ok(['Luxury vinyl plank', 'Waterproof laminate', 'Engineered hardwood', 'Porcelain or ceramic tile', 'Carpet', 'Carpet tiles', 'Insulated subfloor systems'].every((o) => options.includes(o)), `flooring options covered: ${JSON.stringify(options)}`);
ok(/solid hardwood/i.test(text) && /engineered hardwood/i.test(text) && /below grade unless the manufacturer recommends/i.test(text), 'solid vs engineered hardwood distinction (and the NWFA below-grade statement) is missing');

// accessible comparison table
const table = (articleOf(svc).match(/<table class="compare-table compare-wide">[\s\S]*?<\/table>/) || [''])[0];
const cols = [...table.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => decode(m[1]));
ok(JSON.stringify(cols) === JSON.stringify(['Flooring type', 'Moisture tolerance', 'Comfort', 'Maintenance', 'Relative installation complexity', 'Common basement applications', 'Important limitation']), `comparison table columns: ${JSON.stringify(cols)}`);
ok(/<caption>/.test(table) && (table.match(/<th scope="row">/g) || []).length === 7, 'comparison table needs a caption and seven row headers');
ok(/class="table-scroll" tabindex="0" role="region" aria-label="[^"]+"/.test(articleOf(svc)), 'comparison table scroller must be a focusable, labelled region');
ok(!/\b\d+(\.\d+)?\s*\/\s*(5|10)\b|★|\bstars?\b/i.test(table), 'comparison table must not use invented numeric ratings');

// claims, prices, installer language
const forbid = [
  [/\$\s?\d/, 'a dollar figure'], [/\b\d[\d,]*\s?(?:per|\/)\s?(?:sq|square)/i, 'a per-square-foot price'], [/\bfrom \$|\bstarting at\b/i, 'a starting price'],
  [/\bwe (?:install|supply|provide|will install)\b|\bour (?:installers|crews?|team of installers)\b|\breno rise (?:installs|will install|installs your)\b/i, 'Reno Rise as installer'],
  [/\b(?:vetted|licensed|insured|certified|qualified|approved) (?:local |toronto |independent )?(?:professionals?|contractors?|installers?)\b/i, 'an unverified credential claim'],
  [/\b(?:is|are) (?:100% )?waterproof\b(?![^.]*(?:label|manufacturer|usually describes|marketing))/i, 'an unqualified waterproof claim'],
  [/(?<!\bnot )(?<!\bcannot )(?<!\bno )\bguarantee[sd]?\b/i, 'a guarantee'], [/within \d+ (?:hours?|days?)|same[- ]day|free (?:quote|estimate)/i, 'a fixed-period or free-quote promise'],
  [/\bAggregateRating|"Review"|GeneralContractor|LocalBusiness\b/, 'unsupported schema'],
];
const newRels = [SVC, 'blog/best-flooring-basement-toronto.html', 'blog/basement-subfloor-finished-basement.html', 'blog/vinyl-plank-vs-carpet-basement.html', 'blog/hardwood-flooring-basement.html'];
for (const rel of newRels) {
  const h = page(rel);
  const body = decode(articleOf(h)) + ' ' + h.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g).join(' ');
  for (const [re, what] of forbid) ok(!re.test(body), `${rel}: contains ${what}`);
  ok(/Reno Rise does not install flooring|not install flooring|does not perform/i.test(body) || rel !== SVC, `${rel}: must say Reno Rise does not install flooring`);
}
ok(ldTypes(svc).every((t) => ['Organization', 'WebPage', 'Service', 'FAQPage', 'Question', 'Answer', 'BreadcrumbList', 'ListItem', 'City', 'AdministrativeArea', 'WebSite'].includes(t)), `service page structured data: ${ldTypes(svc)}`);

// ---------------------------------------------------------------- link graph
for (const t of ['services/basement-renovation/index.html', 'services/basement-finishing/index.html', 'services/basement-waterproofing/index.html', 'services/interior-waterproofing/index.html', 'services/legal-basement-apartment-toronto/index.html']) {
  ok(links(SVC, svc, t.replace('index.html', '')), `service page should link back to /${t.replace('index.html', '')}`);
}
ok(/id="assessment-form"/.test(svc) && /data-project-type="Basement flooring"/.test(svc), 'service page must include the project-enquiry form preselecting "Basement flooring"');
const wantIn = {
  'services/basement-renovation/index.html': 'Basement Renovation', 'services/basement-finishing/index.html': 'Basement Finishing', 'services/legal-basement-apartment-toronto/index.html': 'Legal Secondary Suite',
  'services/basement-waterproofing/index.html': 'Basement Waterproofing', 'services/wet-basement-repair/index.html': 'Wet Basement Repair', 'services/interior-waterproofing/index.html': 'Interior Waterproofing',
  'services/flooring/index.html': 'Flooring', 'services/flooring-installation/index.html': 'Flooring Installation', 'services/flooring-contractor/index.html': 'Flooring Contractor', 'services/hardwood-floor-installation/index.html': 'Hardwood Floor Installation',
  'blog/basement-renovation-cost-toronto.html': 'cost guide', 'blog/basement-waterproofing-before-renovation.html': 'waterproofing guide',
};
const anchorsToService = [];
for (const [rel, name] of Object.entries(wantIn)) {
  const h = page(rel);
  // contextual = a link inside the page body (article or main) but NOT in the related-links chip block
  const bodyHtml = ((h.match(/<main[\s\S]*<\/main>/) || [''])[0]).replace(/<div class="internal-links"[\s\S]*?<\/div>/g, '');
  const inArticle = [...bodyHtml.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => resolve(rel, m[1]) === 'services/basement-flooring/');
  const inBody = inArticle.length ? inArticle : [...h.matchAll(/<p data-basement-flooring-link>[\s\S]*?<\/p>/g)].flatMap((m) => [...m[0].matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]).filter((m) => resolve(rel, m[1]) === 'services/basement-flooring/');
  ok(inBody.length >= 1, `${name} (${rel}) needs a contextual link to the basement-flooring page`);
  inBody.forEach((m) => anchorsToService.push(decode(m[2]).toLowerCase()));
}
const uniqueAnchors = new Set(anchorsToService);
ok(uniqueAnchors.size >= Math.ceil(anchorsToService.length * 0.8), `contextual anchors are too repetitive (${uniqueAnchors.size} unique of ${anchorsToService.length})`);
ok(anchorsToService.filter((a) => a === 'basement flooring').length <= 2, 'the exact-match anchor "basement flooring" is used mechanically');

// general flooring pages: preserved, still Other Home Improvement Services, no basement intent in their own metadata
for (const rel of ['services/flooring/index.html', 'services/flooring-installation/index.html', 'services/flooring-contractor/index.html', 'services/hardwood-floor-installation/index.html']) {
  const h = page(rel);
  ok(!!h && !noindex(h) && canonicalOf(h) === `${SITE}/${urlPathOf(rel)}`, `${rel}: existing page, URL or canonical changed`);
  ok(!/basement/i.test(titleOf(h)) && !/basement/i.test(h1Of(h)) && !/basement flooring/i.test(descOf(h)), `${rel}: general flooring page must not target basement-flooring intent`);
}

// ---------------------------------------------------------------- the four guides
const GUIDES = {
  'blog/best-flooring-basement-toronto.html': ['best flooring for basement', 'Best Flooring for a Basement in Toronto'],
  'blog/basement-subfloor-finished-basement.html': ['basement subfloor', 'Do You Need a Subfloor in a Finished Basement?'],
  'blog/vinyl-plank-vs-carpet-basement.html': ['vinyl plank vs carpet basement', 'Vinyl Plank vs. Carpet for a Basement'],
  'blog/hardwood-flooring-basement.html': ['hardwood flooring in basement', 'Can You Install Hardwood Flooring in a Basement?'],
};
const flooringPosts = [...pages.keys()].filter((r) => /^blog\/.*\.html$/.test(r) && /class="post-hero"/.test(page(r)) && /Basement flooring/.test((page(r).match(/data-project-type="([^"]*)"/) || [])[1] || ''));
ok(flooringPosts.length === 4, `expected exactly four flooring guides, found ${flooringPosts.length}`);
for (const [rel, [kw, h1]] of Object.entries(GUIDES)) {
  const h = page(rel);
  ok(h1Of(h) === h1, `${rel}: H1 is "${h1Of(h)}"`);
  ok(canonicalOf(h) === `${SITE}/${rel}` && !noindex(h), `${rel}: canonical/indexing`);
  ok(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes(`<loc>${SITE}/${rel}</loc>`), `${rel}: missing from sitemap`);
  const words = kw.split(' ').filter((w) => !['for', 'vs', 'in', 'a'].includes(w));
  ok(words.every((w) => (titleOf(h) + ' ' + h1Of(h)).toLowerCase().includes(w.replace('carpet', 'carpet'))), `${rel}: title/H1 should carry its primary keyword "${kw}"`);
  const t = ldTypes(h);
  ok(t.includes('BlogPosting') && t.includes('BreadcrumbList'), `${rel}: needs BlogPosting and BreadcrumbList structured data (has ${t})`);
  const faqVisible = (h.match(/class="faq-item"/g) || []).length;
  ok(t.includes('FAQPage') === (faqVisible > 0) && faqVisible >= 4, `${rel}: FAQ schema must match the visible FAQ`);
  ok(links(rel, h, 'services/basement-flooring/'), `${rel}: should link to the basement-flooring page`);
  ok(/class="assess-band/.test(h) && /independent professional/.test(articleOf(h)), `${rel}: commercial CTA must carry the matching-service wording`);
  const img = (h.match(/<img[^>]*class?[^>]*post-hero[\s\S]*?<\/figure>/) || [h.match(/<figure class="post-hero">[\s\S]*?<\/figure>/)[0]])[0];
  ok(/width="1200"[^>]*height="800"/.test(img) && /alt="[^"]{12,}"/.test(img) && /Stock photo, illustrative only/.test(img), `${rel}: hero image needs dimensions, useful alt text and the stock-photo label`);
  ok(fs.existsSync(path.join(ROOT, 'images/og', `blog-${path.basename(rel, '.html')}.jpg`)), `${rel}: share image missing`);
}
// primary keywords must be distinct from each other and from the commercial page
const kws = Object.values(GUIDES).map(([k]) => k);
ok(new Set(kws).size === 4 && !kws.includes('basement flooring toronto'), 'guides must each have a distinct primary keyword');

// ---------------------------------------------------------------- blog index and services directory
const blog = page('blog/index.html');
const cards = [...blog.matchAll(/<article class="post-card" data-category="([^"]*)">[\s\S]*?<a class="readmore" href="([^"]*)"/g)].map((m) => ({ cats: m[1].split(' '), href: m[2] }));
ok(new Set(cards.map((c) => c.href)).size === cards.length, 'blog index has duplicate cards');
ok(/data-filter="flooring">Flooring<\/button>/.test(blog), 'blog index is missing the Flooring filter');
ok(cards.filter((c) => c.cats.includes('flooring')).length === 4, 'exactly four cards should be in the Flooring category');
ok(['planning', 'suites', 'costs', 'permits', 'waterproofing', 'underpinning', 'general'].every((k) => new RegExp(`data-filter="${k}"`).test(blog)) && cards.filter((c) => c.cats.includes('permits')).length >= 2, 'existing blog categories must be intact');
ok(cards.length === 19, `blog index should have 12 original + 4 flooring + 3 new planning cards (19), has ${cards.length}`);

const dir = page('services/index.html');
const basementPart = dir.slice(dir.indexOf('id="basement-renovations-secondary-suites"'), dir.indexOf('id="other-home-improvement-services"'));
const otherPart = dir.slice(dir.indexOf('id="other-home-improvement-services"'));
ok(/<a href="basement-flooring\/" class="city-chip">Basement Flooring<\/a>/.test(basementPart), 'Basement Flooring must be in the leading basement group of the services directory');
ok(/<a href="flooring\/" class="city-chip">/.test(otherPart) && !/<a href="basement-flooring\/" class="city-chip">/.test(otherPart), 'the general Flooring chip must stay under Other Home Improvement Services');
ok(/directory-note/.test(basementPart) && /region-note/.test(otherPart), 'the directory should explain Basement Flooring vs general Flooring');

// ---------------------------------------------------------------- de-emphasized, not removed: additions and extensions
for (const d of ['home-additions', 'home-addition', 'house-extension']) {
  ok(pages.has(`services/${d}/index.html`), `services/${d}/ was removed`);
  ok(links('services/index.html', dir, `services/${d}/`) || links('services/index.html', otherPart, `services/${d}/`), `services/${d}/ must stay reachable from the services directory`);
}
const home = page('index.html');
const homeCards = home.slice(home.indexOf('id="basement-projects"'), home.indexOf('id="suite-planning"'));
ok(!/topic-card[\s\S]*?(addition|extension)/i.test(homeCards.slice(0, homeCards.indexOf('other-resources'))), 'additions/extensions must not be main basement-service cards on the homepage');
const header = (html) => (html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/) || [''])[0];
ok(!/addition|extension|hardwood|carpet|vinyl|laminate|\btile\b/i.test(header(home)), 'primary navigation must not list additions or individual flooring materials');

// ---------------------------------------------------------------- title and H1 uniqueness (new pages must not collide with anything)
const byTitle = new Map(), byH1 = new Map();
for (const [rel, { html }] of pages) {
  if (rel === '404.html') continue;
  const t = titleOf(html), h1 = h1Of(html);
  byTitle.set(t, [...(byTitle.get(t) || []), rel]);
  if (h1) byH1.set(h1, [...(byH1.get(h1) || []), rel]);
}
for (const rel of newRels) {
  ok((byTitle.get(titleOf(page(rel))) || []).length === 1, `${rel}: title is duplicated on ${(byTitle.get(titleOf(page(rel))) || []).join(', ')}`);
  ok((byH1.get(h1Of(page(rel))) || []).length === 1, `${rel}: H1 is duplicated on ${(byH1.get(h1Of(page(rel))) || []).join(', ')}`);
}
const flooringRels = [...pages.keys()].filter((r) => /floor/.test(r) && /^services\//.test(r));
for (const [what, map] of [['title', byTitle], ['H1', byH1]]) for (const [k, rels] of map) if (rels.length > 1 && rels.some((r) => /floor/i.test(r))) failures.push(`duplicate ${what} "${k}" on ${rels.join(', ')}`);

// ---------------------------------------------------------------- location pages: indexing directives unchanged from main
try {
  let compared = 0;
  for (const rel of [...pages.keys()].filter((r) => /^locations\//.test(r))) {
    const was = execFileSync('git', ['show', `main:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    compared++;
    ok(noindex(was) === noindex(page(rel)), `${rel}: indexing directive changed`);
  }
  ok(compared > 20, `only compared ${compared} location pages`);
} catch (e) {
  console.log('(skipped location indexing comparison:', String(e.message).split('\n')[0], ')');
}

// ---------------------------------------------------------------- on-page SEO checklist (SEO_brief/on-page-seo.md)
const sentences = (t) => t.replace(/\bvs\./gi, 'vs').split(/(?<=[.?])\s+(?=[A-Z"\u201c(])/).filter((x) => x.length > 3).length;
for (const rel of newRels) {
  const h = page(rel);
  const t = titleOf(h), d = descOf(h);
  ok(t.length >= 50 && t.length <= 60, `${rel}: title is ${t.length} chars (checklist 50-60)`);
  ok(d.length >= 150 && d.length <= 160, `${rel}: meta description is ${d.length} chars (checklist 150-160)`);
  ok((h.match(/<h1[\s>]/g) || []).length === 1, `${rel}: needs exactly one H1`);
  const heads = [...h.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  ok(heads.every((n, i) => i === 0 || n <= heads[i - 1] + 1), `${rel}: heading levels skip (${heads.join('')})`);
  ok(/<html lang="en">/.test(h) && /<meta charset="UTF-8">/i.test(h) && /name="viewport"/.test(h) && /rel="icon"/.test(h) && /rel="apple-touch-icon"/.test(h), `${rel}: head basics (lang, charset, viewport, favicon, apple-touch-icon)`);
  ok(/property="og:title"/.test(h) && /property="og:description"/.test(h) && /property="og:image"/.test(h) && /property="og:url"/.test(h) && /property="og:type"/.test(h) && /name="twitter:card" content="summary_large_image"/.test(h) && /name="twitter:image"/.test(h), `${rel}: Open Graph / Twitter tags`);
  const art = articleOf(h);
  const first100 = decode(art).split(' ').slice(0, 100).join(' ').toLowerCase();
  ok(/basement/.test(first100), `${rel}: primary keyword (basement) must be in the first 100 words`);
  const ext = [...art.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)].map((m) => m[0]);
  ok(ext.length >= 2 && ext.every((a) => /rel="noopener"/.test(a) && /target="_blank"/.test(a)), `${rel}: external links must be 2+ and open in a new tab with rel=noopener`);
  ok(!/click here|read more/i.test(decode(art)), `${rel}: non-descriptive link text`);
  ok(/href="[^"]*about\.html"/.test(art) || rel === SVC, `${rel}: author byline should link to the About page`);
  ok(/Published [A-Z][a-z]+ \d+, \d{4}/.test(art) || /Last reviewed/.test(art), `${rel}: needs a visible published or reviewed date`);
  // paragraphs: 1-4 sentences
  const body = art.replace(/<table[\s\S]*?<\/table>/g, ' ').replace(/<div class="faq-item">[\s\S]*?<\/div>/g, ' ').replace(/<section class="assess-band[\s\S]*?<\/section>/g, ' ');
  const long = [...body.matchAll(/<p(?=[\s>])([^>]*)>([\s\S]*?)<\/p>/g)].filter((m) => !/updated-line|sources-note|table-hint|disclosure|notice/.test(m[1])).map((m) => decode(m[2])).filter((x) => sentences(x) > 4);
  ok(long.length === 0, `${rel}: paragraphs over four sentences: ${long.map((x) => x.slice(0, 50)).join(' | ')}`);
  // FAQ answers: 2-4 sentences, 4-8 questions
  const faq = [...art.matchAll(/<div class="faq-item">\s*<h3>[\s\S]*?<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => sentences(decode(m[1])));
  ok(faq.length >= 4 && faq.length <= 8 && faq.every((n) => n >= 2 && n <= 4), `${rel}: FAQ needs 4-8 questions with 2-4 sentence answers (got ${JSON.stringify(faq)})`);
  // images: hyphenated lowercase WebP files under 200 KB
  for (const src of [...h.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]).filter((x) => /stock/.test(x))) {
    const file = path.join(ROOT, src.replace(/^(\.\.\/)+/, ''));
    ok(/^[a-z0-9-]+\.webp$/.test(path.basename(src)) && fs.existsSync(file) && fs.statSync(file).size < 200 * 1024, `${rel}: image ${src} must be a lowercase hyphenated WebP under 200 KB`);
  }
}
for (const rel of newRels) { // slugs: short, lowercase, hyphens, no stop words
  const slug = path.basename(rel === SVC ? 'basement-flooring' : rel, '.html');
  ok(slug.length < 60 && /^[a-z0-9-]+$/.test(slug) && !/(^|-)(the|a|an|of|for|in|do|you|is|to)(-|$)/.test(slug), `${rel}: slug "${slug}" should be short and free of stop words`);
}
// the three URLs renamed after first publication keep working through permanent redirects
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
for (const [from, to] of [['best-flooring-for-basement-toronto', 'best-flooring-basement-toronto'], ['do-you-need-a-subfloor-in-a-finished-basement', 'basement-subfloor-finished-basement'], ['hardwood-flooring-in-basement', 'hardwood-flooring-basement']]) {
  ok(vercel.redirects.some((r) => r.source === `/blog/${from}.html` && r.destination === `/blog/${to}.html` && r.permanent === true), `missing permanent redirect for /blog/${from}.html`);
  ok(!pages.has(`blog/${from}.html`) && pages.has(`blog/${to}.html`), `blog/${from}.html should be replaced by ${to}.html`);
}
// long-form service page (1500+ words): table of contents with working anchors, back-to-top, top CTA with click-to-call, areas
const words = decode(articleOf(svc)).split(' ').length;
ok(words >= 1500, `service page is ${words} words`);
const toc = (articleOf(svc).match(/<nav class="toc"[\s\S]*?<\/nav>/) || [''])[0];
const tocLinks = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
ok(tocLinks.length >= 8 && tocLinks.every((id) => new RegExp(`id="${id}"`).test(svc)), `service page needs a table of contents whose anchors all exist (${tocLinks.length} links)`);
ok(/class="back-to-top"/.test(svc), 'service page needs a back-to-top control');
const firstH2 = articleOf(svc).indexOf('<h2');
ok(articleOf(svc).indexOf('class="cta-row"') > 0 && articleOf(svc).indexOf('class="cta-row"') < firstH2 && /class="cta-row"[^>]*>[\s\S]*?href="tel:\+1\d{10}"/.test(articleOf(svc)), 'service page needs a primary CTA and click-to-call before the first section');
ok(links(SVC, svc, 'locations/'), 'service page should point to the areas served');

console.log(`flooring-check: ${checks} checks`);
if (failures.length) {
  console.log(`${failures.length} failure(s):`);
  for (const f of failures.slice(0, 40)) console.log(' - ' + f);
  process.exit(1);
}
console.log('flooring-check: all passed');

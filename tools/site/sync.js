// Regenerates the shared blocks (header, mobile nav, footer, CTA band), normalises
// links, removes unverifiable trust content and rebuilds structured data on every
// static page. Idempotent: run it after editing tools/site/lib.js or any page.
//
//   node tools/site/sync.js            # apply
//   node tools/site/sync.js --check    # report what would change, write nothing
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const PG = require('./page');
const { CLAIM_RULES, META_RULES } = require('./claims');
const { transformSecondaryService } = require('./secondary');

const ROOT = path.resolve(__dirname, '..', '..');
const CHECK = process.argv.includes('--check');
const SKIP_DIRS = new Set(['node_modules', 'SEO_brief', 'renorise-forms', 'renorise-dashboard', 'renorise-shared', 'renorise-voice', 'references', 'videos', 'images', 'css', 'js', 'brand', '.git', 'tools']);

// Pages that make up the basement cluster (get the "Basement Services" nav state and Service schema).
const BASEMENT_SLUGS = new Set([
  'basement-renovation', 'legal-basement-apartment-toronto', 'basement-finishing', 'basement-soundproofing', 'basement-waterproofing',
  'basement-window-replacement', 'underpinning', 'bench-footing', 'interior-waterproofing', 'exterior-waterproofing', 'wet-basement-repair',
  'egress-windows', 'window-well-installation', 'walkout-construction', 'sump-pump', 'backwater-valve',
  'weeping-tile', 'french-drain', 'foundation-crack-repair', 'waterproofing-contractor', 'parging', 'crawl-space-conversion',
  'basement-renovation-toronto', 'basement-renovation-ajax', 'basement-renovation-oakville', 'basement-renovation-pickering',
  'basement-renovation-richmond-hill', 'basement-renovation-vaughan',
]);

const LEGACY_NO_FAQ = new Set(['blog/best-renovations-to-do-in-winter-gta.html', 'blog/home-addition-cost-gta.html', 'blog/how-much-does-a-home-renovation-cost-gta.html', 'blog/kitchen-renovation-cost-guide.html', 'blog/renovation-cost-by-room-gta.html']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const relOf = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const depthOf = (rel) => rel.split('/').length - 1;
const urlPathOf = (rel) => (rel === 'index.html' ? '' : rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);

function slugOf(urlPath) {
  const m = urlPath.match(/^services\/([^/]+)\/$/);
  return m ? m[1] : null;
}

function activeKey(urlPath) {
  if (urlPath === '') return 'home';
  const slug = slugOf(urlPath);
  if (slug === 'basement-renovation') return 'basement';
  if (slug === 'legal-basement-apartment-toronto') return 'suite';
  if (slug && BASEMENT_SLUGS.has(slug)) return 'basement-services';
  if (urlPath.startsWith('blog/')) return 'guides';
  if (slug) return 'other';
  return '';
}

/** How the CTA band should read on a given page. */
function ctaKind(urlPath) {
  const slug = slugOf(urlPath);
  if (slug && !BASEMENT_SLUGS.has(slug)) return 'other';
  return 'basement';
}

function otherCtaBand(depth, heading) {
  return `<!-- ========== CTA BAND ========== -->
<section class="section-tight" style="padding-top:0;">
  <div class="container">
    <div class="cta-band">
      <div>
        <h2>${heading}</h2>
        <p>Reno Rise focuses on basement renovations and legal secondary suites. If you are planning other work, tell us about it and we will say whether we can point you to a suitable independent professional. Not every project can be matched.</p>
      </div>
      <div class="cta-actions">
        <a href="${L.href(depth, L.P.contact)}" class="btn btn-primary">Tell Us About Your Project ${L.ICON.arrow}</a>
        <a href="${L.href(depth, L.P.basement)}" class="btn btn-outline">Basement Renovations</a>
      </div>
    </div>
  </div>
</section>`;
}

/** Replaces the three-up "Licensed / crews / one crew" strip on generic service pages. */
function neutralStrip(depth) {
  const icon = (d) => `<span class="icon-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
  return `<!-- ========== TRUST STRIP ========== -->
<section class="section-tight section-cream">
  <div class="container">
    <div class="trust-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="trust-item">
        ${icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>')}
        <h3>Independent Professionals</h3>
        <p>Estimates, contracts, warranties and the work itself come from the independent professional you choose, not from Reno Rise.</p>
      </div>
      <div class="trust-item">
        ${icon('<path d="M12 21s-7-4.35-9.5-8.5C.7 8.3 3 4.5 7 4.5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.3 3.8 4.5 8-2.5 4.15-9.5 8.5-9.5 8.5z"/>')}
        <h3>Toronto First, GTA-Wide</h3>
        <p>Reno Rise is focused on Toronto basement projects and can also handle enquiries from across the Greater Toronto Area.</p>
      </div>
      <div class="trust-item">
        ${icon('<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>')}
        <h3>Check Before You Hire</h3>
        <p>Confirm credentials, insurance, references and who is responsible for permits before you sign a contract.</p>
      </div>
    </div>
  </div>
</section>
`;
}

// ---------- structural replacements ----------

function replaceHeader(h, depth, solid, active) {
  const re = /<!-- =+ HEADER =+ -->[\s\S]*?(?=<main)/;
  if (!re.test(h)) return { h, ok: false };
  return { h: h.replace(re, () => L.header(depth, { solid, active })), ok: true };
}

function replaceFooter(h, depth) {
  const re = /<footer class="site-footer">[\s\S]*?<\/footer>/;
  if (!re.test(h)) return { h, ok: false };
  return { h: h.replace(re, () => L.footer(depth)), ok: true };
}

function replaceCta(h, depth, urlPath) {
  const re = /<!-- =+ CTA BAND =+ -->[\s\S]*?<\/section>/;
  const m = h.match(re);
  if (!m) return { h, ok: false };
  const kind = ctaKind(urlPath);
  const oldH2 = (m[0].match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1];
  let heading = oldH2 ? oldH2.trim() : '';
  // Keep tailored headings that don't make claims; fall back to the standard heading otherwise.
  const bad = /free|48|licen|guarantee|quote/i;
  if (!heading || bad.test(heading)) heading = '';
  let block;
  if (kind === 'other') block = otherCtaBand(depth, heading || 'Planning a Home Project?');
  else block = L.ctaBand(depth, { heading: heading || undefined });
  return { h: h.replace(re, () => block), ok: true };
}

function removeBlocks(h, names) {
  let n = 0;
  for (const name of names) {
    const re = new RegExp(`<!-- =+ ${name} =+ -->[\\s\\S]*?(?=<!-- =+ [A-Z]|</main>)`, 'g');
    h = h.replace(re, () => { n++; return ''; });
  }
  return { h, n };
}

function normaliseLinks(h) {
  // href="…/index.html#x" -> href="…/#x"; href="index.html" -> href="./"
  h = h.replace(/(href="|content="https:\/\/www\.renosrise\.com\/)([^"#?]*?)index\.html((?:#[^"]*)?")/g, (m, pre, dir, post) => {
    if (pre === 'href="' && dir === '') return `${pre}./${post}`;
    return `${pre}${dir}${post}`;
  });
  h = h.replace(/(href="https:\/\/www\.renosrise\.com\/[^"#?]*?)index\.html"/g, '$1"');
  // JSON-LD / og urls
  h = h.replace(/(https:\/\/www\.renosrise\.com\/(?:[^"\s#]*\/)?)index\.html/g, '$1');
  return h;
}

// ---------- structured data ----------

function absUrl(depthHref, fromUrlPath) {
  // Resolve a relative href (as written on the page) against the page's URL.
  const base = new URL(`${L.SITE}/${fromUrlPath}`);
  const u = new URL(depthHref, base);
  return u.href.replace(/index\.html$/, '');
}

function breadcrumbFromHtml(h, urlPath, fallbackName) {
  const m = h.match(/<div class="breadcrumb"[^>]*>([\s\S]*?)<\/div>/);
  const items = [];
  if (m) {
    for (const x of m[1].matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>|<span[^>]*>([\s\S]*?)<\/span>/g)) {
      if (x[1] !== undefined) items.push([PG.stripTags(x[2]), absUrl(x[1], urlPath)]);
      else items.push([PG.stripTags(x[3]), `${L.SITE}/${urlPath}`]);
    }
  }
  if (!items.length && urlPath !== '') return null;
  return items.length ? items : null;
}

const TITLE_OVERRIDES = {
  'services/bifold-doors/': ['Bifold Door Installation in the GTA | Reno Rise', 'Bifold Doors for GTA Homes: What to Know | Reno Rise'],
  'services/storm-doors/': ['Storm Door Installation in the GTA | Reno Rise', 'Storm Doors for GTA Homes: What to Know | Reno Rise'],
};

function metaOf(h) {
  const title = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const img = (h.match(/<meta property="og:image" content="([^"]*)"/) || [])[1] || '';
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return { title: decode(title), desc: decode(desc), img };
}

function rebuildJsonLd(h, urlPath, rel) {
  const scripts = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>\s*/g)];
  let faq = null;
  let blog = null;
  const dropped = [];
  for (const s of scripts) {
    let j;
    try { j = JSON.parse(s[1]); } catch { dropped.push('unparseable'); continue; }
    const nodes = j['@graph'] ? j['@graph'] : [j];
    for (const n of nodes) {
      if (n['@type'] === 'FAQPage') faq = n;
      else if (n['@type'] === 'BlogPosting') blog = n;
    }
  }
  const { title, desc, img } = metaOf(h);
  const url = `${L.SITE}/${urlPath}`;
  const graph = [PG.orgNode()];
  if (urlPath === '') graph.push(PG.websiteNode());
  const slug = slugOf(urlPath);
  const isBlogPost = /^blog\/[^/]+\.html$/.test(urlPath);
  const wpType = urlPath.startsWith('services/') && urlPath !== 'services/' && slug ? 'WebPage' : urlPath === 'about.html' ? 'AboutPage' : urlPath === 'contact.html' ? 'ContactPage' : 'WebPage';
  if (!isBlogPost) graph.push(PG.webPageNode(url, PG.stripTags(title.replace(/\s*\|.*$/, '')) || title, desc, wpType));
  if (slug && BASEMENT_SLUGS.has(slug)) {
    const name = PG.stripTags((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || title);
    graph.push(PG.serviceNode({ name, url, description: desc, serviceType: 'Basement project enquiry, homeowner education and contractor matching' }));
  }
  if (isBlogPost && blog) {
    const b = { ...blog };
    b['@id'] = `${url}#article`;
    b.author = { '@id': PG.ORG_ID };
    b.publisher = { '@id': PG.ORG_ID };
    b.mainEntityOfPage = url;
    if (b.image && typeof b.image === 'string') b.image = b.image;
    graph.push(b);
  }
  const crumbs = breadcrumbFromHtml(h, urlPath);
  if (crumbs) graph.push(PG.breadcrumbNode(crumbs));
  else if (isBlogPost) {
    graph.push(PG.breadcrumbNode([['Home', `${L.SITE}/`], ['Basement Planning Centre', `${L.SITE}/blog/`], [PG.stripTags(title.replace(/\s*\|.*$/, '')), url]]));
  }
  // Legacy general-renovation articles carry unverified dollar figures: no FAQPage rich-result markup for them.
  if (faq && /class="faq-item"/.test(h) && !LEGACY_NO_FAQ.has(rel)) { delete faq['@context']; graph.push(faq); }
  return { block: PG.ldScript(graph), hadFaq: !!faq };
}

function replaceJsonLd(h, urlPath, rel) {
  const { block } = rebuildJsonLd(h, urlPath, rel);
  const all = /(<script type="application\/ld\+json">[\s\S]*?<\/script>\s*)+/;
  if (all.test(h)) return h.replace(all, () => block + '\n');
  return h.replace('</head>', () => block + '\n</head>');
}

// ---------- text rules ----------

function applyRules(h, rules) {
  let n = 0;
  for (const [re, rep] of rules) {
    h = h.replace(re, (...a) => { n++; return typeof rep === 'function' ? rep(...a) : rep; });
  }
  return { h, n };
}

function ensureIcons(h, depth) {
  if (!/rel="apple-touch-icon"/.test(h)) h = h.replace(/(<link rel="icon"[^>]*>)/, (m) => m + String.fromCharCode(10) + '<link rel="apple-touch-icon" href="' + L.up(depth) + 'images/apple-touch-icon.png">');
  return h;
}

function ensureAccessibility(h) {
  if (!h.includes('class="skip-link"')) h = h.replace(/<body([^>]*)>\s*/, (m, a) => `<body${a}>\n<a href="#main-content" class="skip-link">Skip to content</a>\n\n`);
  h = h.replace(/<main>/, '<main id="main-content">');
  return h;
}

function fixMetaBrand(h) {
  h = h.replace(/content="Reno Rise Renovations"/g, 'content="Reno Rise"');
  return h;
}

function ensureSocialMeta(h, urlPath) {
  const { title, desc, img } = metaOf(h);
  if (!/property="og:title"/.test(h)) {
    const url = `${L.SITE}/${urlPath}`;
    const t = L.escapeHtml(title), d = L.escapeHtml(desc);
    const tags = `<meta property="og:type" content="website">\n<meta property="og:site_name" content="Reno Rise">\n<meta property="og:title" content="${t}">\n<meta property="og:description" content="${d}">\n<meta property="og:url" content="${url}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${t}">\n<meta name="twitter:description" content="${d}">\n`;
    h = h.replace('</head>', () => tags + '</head>');
  }
  return h;
}

// Slugs whose pages are generated by tools/site/pages/*.js and are already written in neutral voice.
const GENERATED_SLUGS = new Set([
  'basement-renovation', 'legal-basement-apartment-toronto', 'basement-finishing', 'underpinning', 'egress-windows', 'basement-soundproofing',
  'basement-waterproofing', 'interior-waterproofing', 'exterior-waterproofing', 'wet-basement-repair', 'walkout-construction',
  'basement-renovation-toronto', 'basement-renovation-ajax', 'basement-renovation-oakville', 'basement-renovation-pickering',
  'basement-renovation-richmond-hill', 'basement-renovation-vaughan', 'door-installation', 'garage-door-repair',
  'sump-pump', 'backwater-valve', 'foundation-crack-repair', 'weeping-tile',
]);

// ---------- main ----------

function transform(file, html, stats) {
  const rel = relOf(file);
  const depth = depthOf(rel);
  const urlPath = urlPathOf(rel);
  const crlf = html.includes('\r\n');
  let h = html.split('\r\n').join('\n');
  const orig = h;

  const solid = /<header class="site-header solid"/.test(h);
  const active = activeKey(urlPath);

  let r = replaceHeader(h, depth, solid, active); h = r.h; if (!r.ok) stats.noHeader.push(rel);
  r = replaceFooter(h, depth); h = r.h; if (!r.ok) stats.noFooter.push(rel);
  r = replaceCta(h, depth, urlPath); h = r.h; if (!r.ok) stats.noCta.push(rel);

  // Unverifiable social proof + crew claims
  const isService = /^services\/[^/]+\/$/.test(urlPath);
  if (isService) {
    const t = removeBlocks(h, ['TESTIMONIALS?']);
    h = t.h; stats.removedTestimonials += t.n;
    if (/<!-- =+ TRUST STRIP =+ -->/.test(h)) {
      h = h.replace(/<!-- =+ TRUST STRIP =+ -->[\s\S]*?(?=<!-- =+ [A-Z]|<\/main>)/, () => { stats.trustStrips++; return neutralStrip(depth); });
    }
  } else if (rel !== 'index.html') {
    const t = removeBlocks(h, ['TESTIMONIALS?']);
    h = t.h; stats.removedTestimonials += t.n;
  }

  if (isService && !GENERATED_SLUGS.has(slugOf(urlPath))) h = transformSecondaryService(h, depth, urlPath);

  const rules = applyRules(h, CLAIM_RULES);
  h = rules.h; stats.claimHits += rules.n;
  const meta = applyRules(h, META_RULES);
  h = meta.h; stats.metaHits += meta.n;

  h = normaliseLinks(h);
  h = fixMetaBrand(h);
  if (TITLE_OVERRIDES[urlPath]) h = h.split(TITLE_OVERRIDES[urlPath][0]).join(TITLE_OVERRIDES[urlPath][1]);
  h = replaceJsonLd(h, urlPath, rel);
  h = ensureSocialMeta(h, urlPath);
  h = ensureIcons(h, depth);
  h = ensureAccessibility(h);
  h = h.replace(/\n{3,}/g, '\n\n');
  // 404.html is served at any missing URL, so every reference must be root-absolute.
  if (rel === '404.html') h = h.replace(/(href|src)="\.\//g, '$1="/');

  if (h === orig) return null;
  return crlf ? h.split('\n').join('\r\n') : h;
}

function main() {
  const files = walk(ROOT).filter((f) => !['404.html'].includes(relOf(f)) || true);
  const stats = { noHeader: [], noFooter: [], noCta: [], removedTestimonials: 0, trustStrips: 0, claimHits: 0, metaHits: 0, changed: 0 };
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    const out = transform(f, html, stats);
    if (out !== null) {
      stats.changed++;
      if (!CHECK) fs.writeFileSync(f, out);
    }
  }
  console.log(`${CHECK ? '[check] ' : ''}pages: ${files.length}, changed: ${stats.changed}`);
  console.log(`testimonial blocks removed: ${stats.removedTestimonials}; trust strips replaced: ${stats.trustStrips}; claim rule hits: ${stats.claimHits}; meta rule hits: ${stats.metaHits}`);
  for (const k of ['noHeader', 'noFooter', 'noCta']) if (stats[k].length) console.log(`${k}: ${stats[k].join(', ')}`);
}

if (require.main === module) main();
module.exports = { transform, walk, relOf, depthOf, urlPathOf, BASEMENT_SLUGS, activeKey };

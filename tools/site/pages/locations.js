// Rebuilds /locations/* for the Toronto-first positioning.
// Keeps only the location-specific paragraphs of the old pages that contain no claims and no SEO-analytics
// language, adds a short basement-planning section, drops the Google Maps embeds, and marks pages that
// end up without enough distinct local information as noindex,follow.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const PG = require('../page');
const U = require('./util');

const depth = 1;
const h = (t) => L.href(depth, t);
const DIR = path.join(U.ROOT, 'locations');
const TORONTO_AREA = new Set(['toronto', 'downtown-toronto', 'midtown-toronto', 'east-york', 'north-york', 'scarborough', 'etobicoke', 'york']);
const RISKY = /\b(we|we're|we'll|we've|our|us)\b|crew|licen[sc]ed|insured|warrant|search volume|confirmed|demand|quote|guarantee|contracting|general contractor|renovation and remodeling|renovation requests/i;
const NOT_LOCAL = /^(Bathroom|Kitchen|Home renovation|General)/i;

const cache = path.join(__dirname, 'locations.data.json');
function loadSource() {
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const out = {};
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.html') && x !== 'index.html')) {
    const html = fs.readFileSync(path.join(DIR, f), 'utf8').split('\r\n').join('\n');
    const name = (html.match(/<h1>Home Renovation in ([^<]*)<\/h1>/) || [])[1];
    if (!name) continue; // already rebuilt
    const region = (html.match(/<span class="eyebrow">([^<]*)<\/span>/) || [])[1];
    const intro = (html.match(/<!-- =+ INTRO =+ -->[\s\S]*?<\/section>/) || [''])[0];
    const paras = [...intro.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1].trim());
    const image = (html.match(/background-image:url\('\.\.\/([^']*)'\)/) || [])[1];
    out[f.replace('.html', '')] = { name: name.trim(), region, paras, image };
  }
  fs.writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

const src = loadSource();
const clean = (t) => t.replace(/&amp;/g, '&');
const words = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const report = [];

for (const [slug, d] of Object.entries(src)) {
  const toronto = TORONTO_AREA.has(slug);
  const kept = d.paras.filter((p) => !RISKY.test(p.replace(/<[^>]+>/g, '')) && !NOT_LOCAL.test(p) && p.replace(/<[^>]+>/g, '').length > 70 && !/<a /.test(p));
  const nm = d.name;
  const place = toronto && slug !== 'toronto' ? `${nm}, Toronto` : nm;

  const local = toronto
    ? `<p>${slug === 'toronto' ? 'In Toronto, zoning and building permits are handled by the City of Toronto and Toronto Building.' : `${nm} is part of the City of Toronto, so zoning and building permits are handled by the City and Toronto Building.`} The <a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a> summarizes what the City and the Province publish about secondary suites, and the <a href="${h('blog/basement-renovation-permits-toronto.html')}">permit guide</a> covers what Toronto Building says needs a permit.</p>`
    : `<p>${nm} is outside the City of Toronto, so zoning and building permits are set by your own municipality rather than by Toronto Building. Ask your local building department which work needs a permit. The <a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a> explains the general considerations, but Toronto-specific rules will not apply.</p>`;

  const body = `
    <span class="eyebrow">${d.region || 'Greater Toronto Area'}</span>
    <h2 style="font-size:32px; margin-bottom:20px;">Basement Planning in ${nm}</h2>
${kept.map((p) => `    <p>${p}</p>`).join('\n')}
    <h3 style="margin-top:32px;">Planning a Basement Project in ${nm}</h3>
    ${local}
    <p>Whatever the age of the house, start with the basics: measure ceiling height, look for signs of moisture, and decide whether you want a finished basement or a self-contained suite. See <a href="${h('services/basement-renovation/')}">basement renovation planning</a>, and <a href="${h('services/underpinning/')}">underpinning</a>, <a href="${h('services/interior-waterproofing/')}">waterproofing</a> and <a href="${h('services/egress-windows/')}">egress windows</a> for the most common issues.</p>
    <div class="internal-links" style="margin-top:8px;">
      <a href="${h('services/basement-renovation/')}">Basement Renovation</a>
      <a href="${h('services/legal-basement-apartment-toronto/')}">Legal Secondary Suites</a>
      <a href="${h('services/basement-finishing/')}">Basement Finishing</a>
      <a href="./">All Areas Served</a>
      <a href="${h('assessment/')}">Request a Basement Assessment</a>
    </div>`;

  const wc = words(body);
  // Only pages with real, distinct local paragraphs stay indexable (Toronto needs 2, elsewhere 3).
  const index = kept.length >= (toronto ? 2 : 3);
  report.push(`${slug}: kept ${kept.length}/${d.paras.length}, ${wc} words, ${index ? 'indexed' : 'noindex'}`);

  const hero = PG.pageHero({
    depth,
    h1: `Basement Renovations in ${place}`,
    crumbs: [['Home', ''], ['Areas Served', 'locations/'], [nm, '']],
    variant: 'hero-dark',
  });
  const main = `<!-- ========== INTRO ========== -->
<section class="section">
  <div class="container article-wrap">${body}
  </div>
</section>
`;
  U.write(`locations/${slug}.html`, PG.renderPage({
    depth,
    path: `locations/${slug}.html`,
    title: toronto ? `Basement Renovations in ${place} | Reno Rise` : `${nm} Basement Projects: Local Notes | Reno Rise`,
    description: toronto
      ? `Planning a basement renovation or legal secondary suite in ${place}? Local housing considerations, permits and how to request a basement assessment.`
      : `Planning a basement project in ${nm}? What to confirm locally and how to request a basement assessment from Reno Rise.`,
    robots: index ? '' : 'noindex, follow',
    active: '',
    hero,
    main,
    ctaOpts: { heading: `Planning a Basement Project in ${nm}?` },
  }));
}
console.log(report.join('\n'));

// ---- hub page ----
(function hub() {
  const file = path.join(DIR, 'index.html');
  const html = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const regions = (html.match(/<!-- =+ REGIONS =+ -->[\s\S]*?<\/section>/) || [''])[0];
  if (!regions) { console.log('hub: REGIONS block not found (already rebuilt?)'); return; }
  const hero = PG.pageHero({ depth, h1: 'Areas Served: Toronto First, Across the GTA', crumbs: [['Home', ''], ['Areas Served', '']], variant: 'hero-dark' });
  const main = `<section class="section-tight" style="padding-bottom:0;">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">Areas served</span>
      <h2>Toronto Basements First, With GTA Enquiries Welcome</h2>
      <p style="color:var(--muted); max-width:680px; margin:14px auto 0;">Reno Rise is focused on Toronto basement renovations and legal secondary suites. Enquiries from elsewhere in the Greater Toronto Area are welcome. Rules such as zoning and permits vary by municipality, and whether a professional is available for a given area cannot be guaranteed.</p>
    </div>
  </div>
</section>
${regions}
`;
  U.write('locations/index.html', PG.renderPage({
    depth, path: 'locations/',
    title: 'Areas Served: Toronto Basement Projects & GTA Enquiries | Reno Rise',
    description: 'Reno Rise focuses on Toronto basement renovations and legal secondary suites and welcomes enquiries from across the Greater Toronto Area.',
    hero, main,
  }));
})();

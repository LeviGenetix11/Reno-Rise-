// Rebuilds /locations/* for the Toronto-first positioning.
// Keeps only the location-specific paragraphs of the old pages that contain no claims and no SEO-analytics
// language, adds sourced local information (pages/locations-facts.js), drops the Google Maps embeds, and marks
// pages without enough distinct, sourced local information as noindex,follow.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const F = require('./locations-facts');

const depth = 1;
const h = (t) => L.href(depth, t);
const DIR = path.join(U.ROOT, 'locations');
const TORONTO_AREA = new Set(['toronto', 'downtown-toronto', 'midtown-toronto', 'east-york', 'north-york', 'scarborough', 'etobicoke', 'york']);
const RISKY = /\b(we|we're|we'll|we've|our|us)\b|crew|licen[sc]ed|insured|warrant|search volume|confirmed|demand|quote|guarantee|contracting|general contractor|renovation and remodeling|renovation requests/i;
const NOT_LOCAL = /^(Bathroom|Kitchen|Home renovation|General)/i;
const EXT = 'target="_blank" rel="noopener"';

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
    out[f.replace('.html', '')] = { name: name.trim(), region, paras };
  }
  fs.writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

const src = loadSource();
const words = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const report = [];
const list = (items) => `<ul class="check-list">\n${items.map((t) => `      <li>${L.ICON.check} ${t}</li>`).join('\n')}\n    </ul>`;

const SUITE = `<a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a>`;
const PERMITS = `<a href="${h('blog/basement-renovation-permits-toronto.html')}">permit guide</a>`;

const figure = (file, alt, caption) => `<figure class="stock-figure">
      <img src="${L.up(depth)}images/stock/${file}-700w.webp" width="700" height="467" loading="lazy" alt="${alt}">
      <figcaption>${caption}</figcaption>
    </figure>`;

for (const [slug, d] of Object.entries(src)) {
  const isToronto = TORONTO_AREA.has(slug);
  const kept = d.paras.filter((p) => !RISKY.test(p.replace(/<[^>]+>/g, '')) && !NOT_LOCAL.test(p) && p.replace(/<[^>]+>/g, '').length > 70 && !/<a /.test(p));
  const nm = d.name;
  const place = isToronto && slug !== 'toronto' ? `${nm}, Toronto` : nm;
  const muni = F.MUNICIPAL[slug];

  let local;
  let sourced = false;
  if (slug === 'toronto') {
    sourced = true;
    local = `
    <p>Toronto has its own paperwork, and it rewards people who read it before the demolition starts. Here is what the City publishes that matters most to a basement project (reviewed ${F.REVIEWED}; confirm current details on each page).</p>
    ${list([
      `<strong>Permits.</strong> Zoning and building permits come from the City and Toronto Building. The ${SUITE} and the ${PERMITS} summarize what the City says.`,
      `<strong>Flood protection subsidy.</strong> Toronto&rsquo;s <a href="${F.TORONTO.subsidyUrl}" ${EXT}>Basement Flooding Protection Subsidy Program</a> covers part of the cost of a plumbing assessment, backwater valves, a sump pump, sump pump battery backup and foundation drain severance for eligible owners of one- to four-unit homes. The City lists a program maximum of up to $6,650 per property as of May 1, 2026, requires downspouts to be disconnected from the sewer, and says subsidies are first-come, first-served. Its page (updated June 18, 2026) also says the contractor must hold a valid Toronto business licence, such as a plumbing, drain or building renovator licence.`,
      `<strong>Backwater valves.</strong> The City&rsquo;s <a href="${F.TORONTO.valveUrl}" ${EXT}>backwater valve guidance</a> (updated July 14, 2026) says a standalone drain permit is required, with no plans required for one- and two-unit houses, and the subsidy page adds that the City inspects before the valve is enclosed.`,
      `<strong>Ravines.</strong> Under the <a href="${F.TORONTO.ravineUrl}" ${EXT}>Ravine and Natural Feature Protection By-law</a> (page updated January 29, 2026), excavation, grade changes, retaining walls and new structures in protected areas need City authorization. Check your address on the City&rsquo;s map before planning a walkout, a side entrance or underpinning near a slope.`,
    ])}
    <p>Older Toronto homes tend to bring extras. Old wiring shows up more often than anyone would like, low ceilings show up even more, and neither is a reason to panic. Both are common, both are workable, and both are far easier to plan for than to discover halfway through.</p>
    ${figure('toronto-residential-street', 'Residential street with semi-detached homes in a Toronto neighbourhood', 'Stock photo of a Toronto residential street (Pexels, Parvez Mogal). Illustrative only.')}`;
  } else if (isToronto) {
    local = `
    <p>${nm} is part of the City of Toronto, so zoning and building permits come from the City and Toronto Building. The ${SUITE} and the ${PERMITS} cover the basics, and the <a href="./toronto.html">Toronto page</a> lists the City&rsquo;s flood-protection subsidy, backwater valve permit and ravine rules.</p>
    ${F.TORONTO_GEO[slug] ? `<p>${F.TORONTO_GEO[slug]} Check your address on the <a href="${F.TORONTO.ravineUrl}" ${EXT}>City&rsquo;s ravine by-law guidance</a> before you plan any digging.</p>` : ''}`;
    sourced = !!F.TORONTO_GEO[slug];
  } else if (muni) {
    sourced = true;
    local = `
    <p>Every municipality writes its own rulebook for basement apartments, and ${nm} is no exception. It is not exciting reading, but it is far cheaper than finding out the hard way. Here is what the ${muni.name} published on its own page when Reno Rise reviewed it (${F.REVIEWED}).</p>
    ${list(muni.facts)}
    <p>Read the source before you plan: <a href="${muni.url}" ${EXT}>${muni.name}: additional or second unit information</a>. Rules, fees and program deadlines change, so confirm with the municipality. ${nm} is outside the City of Toronto, so Toronto Building&rsquo;s rules do not apply; the ${SUITE} explains the general considerations.</p>`;
  } else {
    local = `<p>${nm} is outside the City of Toronto, so zoning and building permits are set by your own municipality rather than by Toronto Building. Ask your local building department which work needs a permit. The ${SUITE} explains the general considerations, but Toronto-specific rules will not apply.</p>`;
  }

  const body = `
    <span class="eyebrow">${d.region || 'Greater Toronto Area'}</span>
    <h2 style="font-size:32px; margin-bottom:20px;">Basement Planning in ${nm}</h2>
${kept.map((p) => `    <p>${p}</p>`).join('\n')}
    <h3 style="margin-top:32px;">${muni ? `What ${nm} Says About Second Units` : `Planning a Basement Project in ${nm}`}</h3>
    ${local}
    <p>Whatever the age of the house, the plan starts the same way: measure the ceiling height, look for signs of moisture, and decide whether you want a finished basement or a self-contained suite. Get those answers early and the rest of the project gets calmer. See <a href="${h('services/basement-renovation/')}">basement renovation planning</a>, <a href="${h('services/underpinning/')}">underpinning</a>, <a href="${h('services/interior-waterproofing/')}">waterproofing</a> and <a href="${h('services/egress-windows/')}">egress windows</a> for the most common issues.</p>
    <div class="internal-links" style="margin-top:8px;">
      <a href="${h('services/basement-renovation/')}">Basement Renovation</a>
      <a href="${h('services/legal-basement-apartment-toronto/')}">Legal Secondary Suites</a>
      <a href="${h('services/basement-finishing/')}">Basement Finishing</a>
      <a href="./">All Areas Served</a>
      <a href="${h('assessment/')}">Request a Basement Assessment</a>
    </div>`;

  const wc = words(body);
  // Indexable only with distinct local content: sourced municipal facts, or Toronto pages with two or more local paragraphs.
  const index = slug === 'toronto' || !!muni || (isToronto && kept.length >= 2);
  report.push(`${slug}: kept ${kept.length}/${d.paras.length}, sourced=${sourced}, ${wc} words, ${index ? 'indexed' : 'noindex'}`);

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
  const title = isToronto ? `Basement Renovations in ${place} | Reno Rise` : muni ? `${nm} Second Unit Rules & Basement Planning | Reno Rise` : `${nm} Basement Projects: Local Notes | Reno Rise`;
  const description = isToronto
    ? `Planning a basement renovation or legal secondary suite in ${place}? Local housing notes, City of Toronto rules and how to request a basement assessment.`
    : muni
      ? `Planning a basement apartment in ${nm}? What the ${muni.name} publishes about second units, registration and permits (reviewed ${F.REVIEWED}).`
      : `Planning a basement project in ${nm}? What to confirm locally and how to request a basement assessment from Reno Rise.`;
  U.write(`locations/${slug}.html`, PG.renderPage({
    depth,
    path: `locations/${slug}.html`,
    title,
    description,
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

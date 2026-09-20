// Generates /services/ (directory). Basement group first and visually dominant; everything else under
// "Other Home Improvement Services". Category chips are parsed from the previous version of the page
// on first run and stored in services-index.data.json so re-running is stable.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const PG = require('../page');
const U = require('./util');

const depth = 1;
const h = (t) => L.href(depth, t);
const DATA = path.join(__dirname, 'services-index.data.json');

function loadCategories() {
  if (fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const html = fs.readFileSync(path.join(U.ROOT, 'services/index.html'), 'utf8').split('\r\n').join('\n');
  const cats = [];
  for (const m of html.matchAll(/<div class="region-block" id="([^"]+)">[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<div class="city-chip-grid">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const chips = [...m[3].matchAll(/<a href="([^"]+?)(?:index\.html)?" class="city-chip">([\s\S]*?)<\/a>/g)].map((c) => [c[1].replace(/\/$/, ''), c[2].trim()]);
    cats.push({ id: m[1], title: m[2].replace(/<[^>]+>/g, '').trim(), chips });
  }
  fs.writeFileSync(DATA, JSON.stringify(cats, null, 1));
  return cats;
}

const cats = loadCategories();
const allSlugs = fs.readdirSync(path.join(U.ROOT, 'services'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

const labelOf = {};
for (const c of cats) for (const [slug, label] of c.chips) labelOf[slug] = label;
const label = (s) => labelOf[s] || s.replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());

const GROUPS = [
  ['Structure, height & entrances', ['underpinning', 'bench-footing', 'walkout-construction', 'egress-windows', 'window-well-installation', 'basement-window-replacement', 'crawl-space-conversion']],
  ['Waterproofing & moisture control', ['basement-waterproofing', 'interior-waterproofing', 'exterior-waterproofing', 'wet-basement-repair', 'foundation-crack-repair', 'weeping-tile', 'french-drain', 'sump-pump', 'backwater-valve', 'parging', 'waterproofing-contractor']],
  ['Electrical & plumbing for basement projects', ['panel-upgrade', 'knob-and-tube-removal', 'aluminum-wiring-replacement', 'pot-light-installation', 'water-line-replacement']],
  ['Finishing, comfort & planning', ['basement-finishing', 'basement-flooring', 'basement-soundproofing', 'design-planning', 'laundry-room-renovation']],
  ['Toronto & GTA basement pages', ['basement-renovation-toronto', 'basement-renovation-ajax', 'basement-renovation-oakville', 'basement-renovation-pickering', 'basement-renovation-richmond-hill', 'basement-renovation-vaughan']],
];
const CORE = new Set(['basement-renovation', 'legal-basement-apartment-toronto']);
const usedInBasement = new Set([...CORE]);
for (const [, slugs] of GROUPS) for (const s of slugs) if (allSlugs.includes(s)) usedInBasement.add(s);

const ico = (d) => `<span class="icon-circle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
const arrow = L.ICON.arrow;

const primary = `
<section class="section" id="basement-renovations-secondary-suites">
  <div class="container">
    <div class="directory-primary">
      <span class="eyebrow on-dark">Reno Rise focus</span>
      <h2>Basement Renovations &amp; Secondary Suites</h2>
      <p>Start here. These guides explain what each basement project involves, what to confirm with Toronto Building, and what to ask before hiring an independent professional.</p>
      <div class="topic-grid">
        <article class="topic-card">
          ${ico('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>')}
          <h3><a href="basement-renovation/">Basement Renovations</a></h3>
          <p>Scope options, moisture, height, permits and cost factors for a general basement renovation.</p>
          <a href="basement-renovation/" class="more" aria-label="Plan a basement renovation">Plan a renovation ${arrow}</a>
        </article>
        <article class="topic-card">
          ${ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/>')}
          <h3><a href="legal-basement-apartment-toronto/">Legal Secondary Suites</a></h3>
          <p>What makes a basement apartment legal, and how it differs from a finished basement.</p>
          <a href="legal-basement-apartment-toronto/" class="more" aria-label="Read the legal secondary suite guide">Read the suite guide ${arrow}</a>
        </article>
        <article class="topic-card">
          ${ico('<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>')}
          <h3><a href="underpinning/">Underpinning &amp; Ceiling Height</a></h3>
          <p>When lowering a floor comes up, and what it involves.</p>
          <a href="underpinning/" class="more" aria-label="About underpinning">Learn more ${arrow}</a>
        </article>
        <article class="topic-card">
          ${ico('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>')}
          <h3><a href="basement-waterproofing/">Waterproofing &amp; Moisture</a></h3>
          <p>Find the cause of damp or leaks before finishing.</p>
          <a href="basement-waterproofing/" class="more" aria-label="About basement waterproofing">Learn more ${arrow}</a>
        </article>
        <article class="topic-card">
          ${ico('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>')}
          <h3><a href="egress-windows/">Egress Windows &amp; Entrances</a></h3>
          <p>Safe exits, daylight and separate entrances.</p>
          <a href="egress-windows/" class="more" aria-label="About egress windows">Learn more ${arrow}</a>
        </article>
        <article class="topic-card">
          ${ico('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>')}
          <h3><a href="../blog/">Permits, Costs &amp; Planning</a></h3>
          <p>The Basement Planning Centre: permit, cost and planning guides.</p>
          <a href="../blog/" class="more" aria-label="Open the Basement Planning Centre">Open the Planning Centre ${arrow}</a>
        </article>
      </div>
${GROUPS.map(([title, slugs]) => {
  const present = slugs.filter((s) => allSlugs.includes(s));
  const note = title.startsWith('Finishing') ? `
      <p class="directory-note"><strong>Basement Flooring</strong> covers material selection and installation considerations for below-grade spaces. Flooring for the rest of the home is under <a href="#flooring">Flooring</a> in Other Home Improvement Services.</p>` : '';
  return `      <p class="directory-subhead">${title}</p>${note}
      <div class="city-chip-grid">
${present.map((s) => `        <a href="${s}/" class="city-chip">${label(s)}</a>`).join('\n')}
      </div>`;
}).join('\n')}
    </div>
  </div>
</section>
`;

const otherCats = cats
  .map((c) => ({ ...c, chips: c.chips.filter(([s]) => !usedInBasement.has(s) && allSlugs.includes(s)) }))
  .filter((c) => c.chips.length);
const listed = new Set([...usedInBasement, ...otherCats.flatMap((c) => c.chips.map(([s]) => s))]);
const orphans = allSlugs.filter((s) => !listed.has(s));
if (orphans.length) otherCats.push({ id: 'more', title: 'More Services', chips: orphans.map((s) => [s, label(s)]) });

const other = `
<section class="section-tight section-cream directory-other" id="other-home-improvement-services">
  <div class="container">
    <div class="section-head left-stack" style="margin-bottom:28px;">
      <span class="eyebrow">Secondary resources</span>
      <h2>Other Home Improvement Services</h2>
      <p class="lede note">Reno Rise is focused on basements. These pages are general information about other kinds of home work. The work itself is carried out by independent professionals, and Reno Rise cannot promise a match for every project type.</p>
    </div>
    <div class="region-nav">
${otherCats.map((c) => `      <a href="#${c.id}">${c.title}</a>`).join('\n')}
    </div>
${otherCats.map((c) => `    <div class="region-block" id="${c.id}">
      <div class="region-head">
        <h3>${c.title}</h3>
        <span>${c.chips.length} ${c.chips.length === 1 ? 'page' : 'pages'}</span>
      </div>${c.id === 'flooring' ? `
      <p class="region-note">These pages are general flooring information for the whole home. For floors over a concrete basement slab, see <a href="basement-flooring/">Basement Flooring</a>.</p>` : ''}
      <div class="city-chip-grid">
${c.chips.map(([s, l]) => `        <a href="${s}/" class="city-chip">${l}</a>`).join('\n')}
      </div>
    </div>`).join('\n\n')}
  </div>
</section>
`;

const hero = PG.pageHero({
  depth,
  h1: 'Basement Renovation &amp; Secondary Suite Services',
  sub: 'Planning guides for Toronto basements first, with other home improvement resources below.',
  crumbs: [['Home', ''], ['Services', '']],
  variant: 'hero-dark',
});

const html = PG.renderPage({
  depth,
  path: 'services/',
  title: 'Basement Renovation & Secondary Suite Services in Toronto | Reno Rise',
  description: 'Browse Toronto basement renovation, legal secondary suite, underpinning, waterproofing and egress window guides, plus other home improvement resources.',
  active: '',
  hero,
  main: `<section class="section-tight" style="padding-bottom:0;">
  <div class="container">
    ${U.notice('<p><strong>How Reno Rise works.</strong> Reno Rise is an independent project-enquiry and contractor-matching service. Homeowners submit their project details, Reno Rise reviews them, and where there is a suitable fit the homeowner may be introduced to an independent professional. Estimates, contracts, credentials, warranties and construction are provided by that professional.</p>')}
  </div>
</section>
${primary}
${other}`,
  ctaOpts: { heading: 'Planning a Basement Renovation or Legal Secondary Suite?' },
});

U.write('services/index.html', html);
console.log('orphans added:', orphans.join(', ') || 'none');

// One-off-but-idempotent cleanup of the five pre-existing general-renovation articles:
// removes the invented author card, softens "real pricing" claims, removes "our crews / our team" claims,
// and adds a visible notice that the figures are illustrative and unverified.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./pages/util');
const L = require('./lib');

const NOTICE_MARK = 'data-legacy-notice';
const NOTICE = `<div class="notice notice-strong" role="note" ${NOTICE_MARK}>${L.ICON.info}<div><p><strong>General renovation article.</strong> Reno Rise focuses on <a href="../services/basement-renovation/">basement renovations</a> and <a href="../services/legal-basement-apartment-toronto/">legal secondary suites</a>. Dollar figures and timelines in this article are illustrative planning ranges from general industry information. They are not quotes, may be out of date, and have not been independently verified by Reno Rise. Get itemized quotes for your own project, and see our <a href="basement-renovation-cost-toronto.html">basement cost guide</a>.</p></div></div>`;

const META = {
  'how-much-does-a-home-renovation-cost-gta.html': {
    title: 'Home Renovation Cost in the GTA: Illustrative Planning Ranges | Reno Rise',
    description: 'General, illustrative planning ranges for GTA home renovations by category, and how to compare itemized quotes. Figures are not quotes and are unverified.',
  },
  'renovation-cost-by-room-gta.html': {
    title: 'Renovation Cost by Room in the GTA: Illustrative Ranges | Reno Rise',
    description: 'Illustrative planning ranges for deck, attic, garage, bedroom, closet and basement renovations in the GTA. Not quotes; get itemized quotes for your project.',
  },
  'home-addition-cost-gta.html': {
    title: 'Home Addition Cost in the GTA: Illustrative Planning Ranges | Reno Rise',
    description: 'Illustrative planning ranges for bump-out, single-storey and second-storey additions in the GTA, and what stretches a timeline. Figures are unverified, not quotes.',
  },
  'kitchen-renovation-cost-guide.html': {
    title: 'Kitchen Renovation Cost in the GTA: Illustrative Ranges | Reno Rise',
    description: 'Illustrative planning ranges for GTA kitchen renovations, cabinetry, countertops and backsplash, and how to compare quotes. Figures are unverified, not quotes.',
  },
  'best-renovations-to-do-in-winter-gta.html': {
    title: 'Best Renovations to Do in Winter in the GTA | Reno Rise',
    description: 'Which renovation projects suit winter in the GTA, and which are better left to warmer months. General planning information.',
  },
};

const TEXT = [
  [/Illustrative 2026 Planning Ranges/g, 'Illustrative 2026 Planning Ranges'],
  [/The Real 2026 Numbers/g, 'Illustrative 2026 Planning Ranges'],
  [/The Full 2026 Breakdown/g, 'Illustrative 2026 Planning Ranges'],
  [/House Extension Pricing for 2026/g, 'Illustrative Planning Ranges for 2026'],
  [/Our team walks every GTA home in person before pricing a single line item, because/g, 'Any professional should walk your home in person before pricing a single line item, because'],
  [/, based on the room-level numbers we quote every week/g, ', based on general industry information'],
  [/Our (<a href="[^"]+">[^<]+<\/a>) team walks every GTA (?:property|home) in person before pricing a single (wall|decision), because/g, 'A professional should walk your property in person before pricing a single $2, because'],
  [/Our (<a href="[^"]+">[^<]+<\/a>) team walks every GTA home in person before pricing a single decision\./g, 'A professional should walk your home in person before pricing a single decision.'],
  [/We renovate homes across the entire (<a [^>]*>[^<]*<\/a>|[^,<]+), and every crew we send out carries the paperwork above\./g, 'Reno Rise connects homeowners across the entire $1 with independent professionals; confirm each professional’s paperwork yourself.'],
  [/We handle the permit process for home additions across the entire (<a [^>]*>[^<]*<\/a>), not just the municipalities named here\./g, 'Permit requirements vary across the $1, so confirm them with your municipality.'],
  [/A free in-home assessment gives you a number based on your actual kitchen/g, 'A site visit from a professional gives you a number based on your actual kitchen'],
  [/A free in-home assessment catches what a calculator can(?:'|’)t\./g, 'A site visit catches what a calculator cannot.'],
  [/Below is the real range for every room homeowners actually ask us about/g, 'Below are illustrative ranges for the rooms homeowners commonly ask about'],
  [/Here(?:'|’)s the real range, broken down/g, 'Here are illustrative ranges, broken down'],
  [/waiting eight weeks for a crew and getting one in two/g, 'a shorter wait for a start date'],
  [/ book a free in-home assessment/gi, ' request quotes'],
  [/then book a free in-home assessment[^.<"]*/gi, 'then request itemized quotes'],
];

function process(file) {
  const rel = 'blog/' + file;
  const fp = path.join(ROOT, rel);
  const crlf = fs.readFileSync(fp, 'utf8').includes('\r\n');
  let h = fs.readFileSync(fp, 'utf8').split('\r\n').join('\n');
  const m = META[file];
  // metadata
  h = h.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${L.escapeHtml(m.title)}</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(")/, (a, p, s) => p + L.escapeHtml(m.description) + s);
  h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, (a, p, s) => p + L.escapeHtml(m.title) + s);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, (a, p, s) => p + L.escapeHtml(m.description) + s);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, (a, p, s) => p + L.escapeHtml(m.title) + s);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, (a, p, s) => p + L.escapeHtml(m.description) + s);
  // invented author card
  h = h.replace(/\s*<div class="author-card">[\s\S]*?<\/div>\s*<\/div>/, '');
  for (const [re, rep] of TEXT) h = h.replace(re, rep);
  // notice
  if (!h.includes(NOTICE_MARK)) h = h.replace('<article class="article-wrap">', () => `<article class="article-wrap">\n    ${NOTICE}`);
  // sitemap of article meta row: "By ..." bylines
  h = h.replace(/\s*<span><svg[^>]*>[\s\S]*?<\/svg> By [^<]*<\/span>/g, '');
  fs.writeFileSync(fp, crlf ? h.split('\n').join('\r\n') : h);
  console.log('cleaned', rel);
}

for (const f of Object.keys(META)) process(f);

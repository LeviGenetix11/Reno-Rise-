// Static tests for the header navigation, mobile menu, footer and the homepage hero/structure. Runs in build.js after check.js.
//   node tools/site/nav-check.js
// (The browser behaviour - fit at each width, dropdown and mobile-menu keyboard use - is in tools/site/browser-tests/nav.mjs.)
'use strict';
const fs = require('fs');
const path = require('path');
const { walk, relOf, urlPathOf } = require('./sync');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://www.renosrise.com';
const failures = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) failures.push(msg); };

const pages = new Map();
for (const f of walk(ROOT)) {
  const rel = relOf(f);
  pages.set(rel, { rel, html: fs.readFileSync(f, 'utf8'), urlPath: urlPathOf(rel) });
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const between = (html, start, end) => { const a = html.indexOf(start); if (a < 0) return ''; const b = html.indexOf(end, a); return b < 0 ? html.slice(a) : html.slice(a, b); };
const links = (html) => [...html.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: decode(m[2]), tag: m[0] }));

/** Resolve a link found on `fromRel` to { rel, hash } in the repository. */
function resolve(fromRel, href) {
  const [p0, hash] = href.split('#');
  const u = new URL(p0 || '.', new URL(`${SITE}/${urlPathOf(fromRel)}`));
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return { rel, hash: hash || '', url: `${SITE}${u.pathname}` };
}

// What the brief asks for, as canonical destinations (folder pages end in "/", flat pages keep ".html").
const NAV = [
  ['Home', ''],
  ['Guides', 'blog/'],
  ['Service Areas', 'locations/'],
  ['About', 'about.html'],
  ['Contact', 'contact.html'],
];
const DROPDOWN = [
  ['Basement Renovations', 'services/basement-renovation/'],
  ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'],
  ['Basement Finishing', 'services/basement-finishing/'],
  ['Underpinning', 'services/underpinning/'],
  ['Waterproofing', 'services/basement-waterproofing/'],
  ['Egress Windows', 'services/egress-windows/'],
  ['Separate Entrances', 'services/walkout-construction/'],
  ['Soundproofing', 'services/basement-soundproofing/'],
  ['View All Services', 'services/'],
];
const CTA = ['Get Matched', 'assessment/'];
const FOOTER_REQUIRED = [
  ['About', 'about.html'], ['Contact', 'contact.html'], ['Service Areas', 'locations/'], ['Privacy Policy', 'privacy/'], ['Terms of Service', 'terms/'],
  ['Basement Renovations', 'services/basement-renovation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'],
  ['Basement Services', 'services/#basement-renovations-secondary-suites'], ['Other Home Improvement Services', 'services/#other-home-improvement-services'],
];

const canonicalOf = (html) => (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/i.test(html);
const CLAIM_WORDS = /\b(qualified|vetted|licensed|insured|approved|certified)\b(?=[^.]{0,40}\b(professionals?|contractors?|tradespeople|trades)\b)/i;

let headerPages = 0;
for (const { rel, html, urlPath } of pages.values()) {
  if (!/<header class="site-header/.test(html)) continue; // (every page has one; this guards odd files)
  headerPages++;
  const rendered = (target, from = rel) => resolve(from, target);
  const navBlock = between(html, '<nav class="main-nav"', '</nav>');
  const menuBlock = between(html, '<ul class="nav-dropdown-menu"', '</ul>');
  const ctaBlock = between(html, '<div class="header-cta">', '</div>');
  const mobileBlock = between(html, '<div class="mobile-nav"', '<main');
  const footerBlock = between(html, '<footer class="site-footer">', '</footer>');
  const at = `${rel}:`;

  // ---- desktop nav: exact labels, order and destinations
  const navOuter = navBlock.replace(menuBlock, ''); // the top level only: the dropdown's own links are checked separately
  const topLinks = links(navOuter);
  const topLabels = topLinks.map((l) => l.text);
  const toggleLabel = decode((navBlock.match(/<button[^>]*class="nav-dropdown-toggle[^"]*"[^>]*>([\s\S]*?)<\/button>/) || [])[1] || '');
  const expected = ['Home', 'Services', ...NAV.slice(1).map(([l]) => l)];
  const actual = [];
  let ti = 0;
  for (const chunk of navOuter.split(/(?=<a |<div class="nav-dropdown">)/)) {
    if (chunk.startsWith('<div class="nav-dropdown">')) actual.push(toggleLabel);
    else if (chunk.startsWith('<a ')) actual.push(topLabels[ti++]);
  }
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${at} desktop nav is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  ok(!/Other Services/i.test(navBlock + mobileBlock), `${at} "Other Services" is still in the main navigation`);
  for (const [label, target] of NAV) {
    const l = topLinks.find((x) => x.text === label);
    ok(l && rendered(l.href).url === `${SITE}/${target}`.replace(/index\.html$/, ''), `${at} nav "${label}" should go to /${target}, goes to ${l ? l.href : '(missing)'}`);
  }
  ok(/aria-expanded="false"/.test(navBlock) && /aria-controls="nav-services"/.test(navBlock) && /id="nav-services"/.test(menuBlock + navBlock), `${at} dropdown lacks aria-expanded / aria-controls / matching id`);

  // ---- dropdown: exact items and canonical destinations
  const dd = links(menuBlock);
  ok(JSON.stringify(dd.map((l) => l.text)) === JSON.stringify(DROPDOWN.map(([l]) => l)), `${at} dropdown items are ${JSON.stringify(dd.map((l) => l.text))}`);
  DROPDOWN.forEach(([label, target], i) => {
    const l = dd[i];
    if (!l) return;
    const r = rendered(l.href);
    ok(r.url === `${SITE}/${target.split('#')[0]}` && r.hash === (target.split('#')[1] || ''), `${at} dropdown "${label}" should go to /${target}, goes to ${l.href}`);
  });

  // ---- CTA
  const cta = links(ctaBlock)[0];
  ok(cta && cta.text === CTA[0] && rendered(cta.href).url === `${SITE}/${CTA[1]}`, `${at} header CTA should be "Get Matched" -> /assessment/, is ${cta ? `"${cta.text}" -> ${cta.href}` : 'missing'}`);
  ok(!/Request a Basement Assessment/.test(ctaBlock), `${at} header CTA still uses the old label`);

  // ---- mobile menu carries the same destinations
  const mob = links(mobileBlock);
  const mobWant = ['Home', 'Services', ...DROPDOWN.slice(0, 8).map(([l]) => l), 'Guides', 'Service Areas', 'About', 'Contact', 'Get Matched'];
  ok(JSON.stringify(mob.map((l) => l.text)) === JSON.stringify(mobWant), `${at} mobile menu is ${JSON.stringify(mob.map((l) => l.text))}`);
  ok(/id="site-menu"/.test(mobileBlock) && /aria-controls="site-menu"/.test(html) && /role="dialog"/.test(mobileBlock) && /aria-modal="true"/.test(mobileBlock), `${at} mobile menu lacks id/aria-controls/dialog semantics`);

  // ---- footer
  const foot = links(footerBlock);
  for (const [label, target] of FOOTER_REQUIRED) {
    const l = foot.find((x) => x.text === label && rendered(x.href).url === `${SITE}/${target.split('#')[0]}` && rendered(x.href).hash === (target.split('#')[1] || ''));
    ok(!!l, `${at} footer is missing "${label}" -> /${target}`);
  }

  // ---- every header/footer link points at a real, canonical, indexable page (no duplicate URLs, no noindex pages)
  for (const l of [...links(navBlock), ...links(menuBlock), ...links(ctaBlock), ...mob, ...foot]) {
    if (/^(https?:|mailto:|tel:)/.test(l.href)) continue;
    const r = rendered(l.href);
    const target = pages.get(r.rel);
    if (!target) { ok(false, `${at} link to a missing page: ${l.href}`); continue; }
    const folderish = !/\.html$/.test(r.rel.replace(/index\.html$/, ''));
    ok(!/(^|\/)index\.html$/.test(l.href.split('#')[0]), `${at} link uses /index.html: ${l.href}`);
    ok(!folderish || l.href.split('#')[0] === '' || l.href.split('#')[0].endsWith('/') || l.href.split('#')[0] === '.' || l.href.split('#')[0].endsWith('..'), `${at} folder link without trailing slash: ${l.href}`);
    ok(canonicalOf(target.html) === r.url || (r.rel === 'index.html' && canonicalOf(target.html) === `${SITE}/`), `${at} ${l.href} does not match the target's canonical (${canonicalOf(target.html)})`);
    ok(!isNoindex(target.html), `${at} navigation links to a noindex page: ${l.href}`);
  }
  // ---- wording: no unsupported claims in shared header/footer text
  ok(!CLAIM_WORDS.test(decode(navBlock + mobileBlock + footerBlock)), `${at} header/footer describes professionals as qualified/vetted/licensed/insured/approved`);
  ok(/aria-current="page"/.test(navBlock) === /<a [^>]*class="active"/.test(navBlock), `${at} nav link active state and aria-current disagree`);
}
ok(headerPages > 150, `only ${headerPages} pages checked`);

// ---------------------------------------------------------------- homepage
const home = pages.get('index.html').html;
const main = between(home, '<main', '</main>');
const ld = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const types = ld.flatMap((j) => (j['@graph'] || [j]).map((n) => n['@type']));

ok(canonicalOf(home) === `${SITE}/`, 'homepage canonical changed');
ok((home.match(/<title>([^<]*)<\/title>/) || [])[1] === 'Basement Renovations &amp; Legal Secondary Suites in Toronto | Reno Rise', 'homepage title changed');
ok(!isNoindex(home), 'homepage must stay indexable');
ok(decode(main.match(/<h1>([\s\S]*?)<\/h1>/)[1]) === 'Basement Renovations & Legal Secondary Suites in Toronto', 'homepage H1 changed');
ok(decode(between(main, '<div class="hero-copy">', '<div class="hero-actions">').split('</h1>')[1]) === 'Whether you’re finishing your basement, creating more living space or exploring a legal secondary suite, Reno Rise helps you understand the project and connect with independent local renovation professionals.', 'hero supporting copy is not the requested text');
const heroActions = links(between(main, '<div class="hero-actions">', '</div>'));
ok(heroActions[0] && heroActions[0].text === 'Tell Us About Your Project' && heroActions[0].href === '#assessment-form', 'hero primary button should be "Tell Us About Your Project" -> #assessment-form');
ok(heroActions[1] && heroActions[1].text === 'Explore Legal Suite Requirements' && resolve('index.html', heroActions[1].href).url === `${SITE}/services/legal-basement-apartment-toronto/`, 'hero secondary button changed');
ok(!/class="hero-note"/.test(between(main, '<section class="hero', '</section>')), 'the hero disclosure line above the button was asked to be removed');
ok(decode((main.match(/<figcaption class="diagram-caption">([\s\S]*?)<\/figcaption>/) || [])[1] || '') === 'Planning illustration only. Property requirements vary. Confirm applicable requirements with Toronto Building and the professionals responsible for your project.', 'diagram fine print is not the requested text');
ok((main.match(/class="dg-num"/g) || []).length === 5, 'diagram numbered topics changed');
ok(/id="assessment-form"[\s\S]*data-assessment-form-mount data-source="homepage"/.test(main), 'homepage enquiry form mount is missing');
const heroVideo = (main.match(/<video class="hero-video"[^>]*>/) || [''])[0];
ok(/data-src="\.\/videos\/hero-interior\.mp4"/.test(heroVideo) && /poster="\.\/videos\/hero-poster\.jpg"/.test(heroVideo) && / muted /.test(heroVideo) && / loop /.test(heroVideo) && /aria-hidden="true"/.test(heroVideo) && /preload="none"/.test(heroVideo), `hero background video markup is wrong: ${heroVideo}`);
ok(!/hero-video-toggle/.test(main), 'the hero pause button was asked to be removed');
ok(fs.existsSync(path.join(ROOT, 'videos', 'hero-interior.mp4')) && fs.existsSync(path.join(ROOT, 'videos', 'hero-poster.jpg')), 'hero video files are missing from /videos');
ok(!/<video/.test(pages.get('services/legal-basement-apartment-toronto/index.html').html), 'only the homepage hero should carry the video');

const order = [...main.matchAll(/<section[^>]*>[\s\S]*?<(?:h1|h2)[^>]*>([\s\S]*?)<\/(?:h1|h2)>/g)].map((m) => decode(m[1]));
const wantOrder = ['Basement Renovations & Legal Secondary Suites in Toronto', 'How Reno Rise Works', 'What Would You Like to Do With Your Basement?', 'Finished Basement or Legal Secondary Suite?', 'Cost, Permit & Planning Guides', 'Why Homeowners Use Reno Rise'];
ok(wantOrder.every((h, i) => order[i] === h), `homepage section order is ${JSON.stringify(order)}`);
ok(order[order.length - 2] === 'Frequently Asked Questions' && order[order.length - 1] === 'Tell Us About Your Project', 'homepage must end with the FAQ and then the enquiry form');
ok((main.match(/<h2>How Reno Rise Works<\/h2>/g) || []).length === 1, 'How Reno Rise Works appears more than once');
ok(!/class="cta-band"/.test(main + home.slice(home.indexOf('</main>'), home.indexOf('</main>') + 200)), 'a CTA band follows the final form');
const steps = [...main.matchAll(/<div class="process-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map((m) => decode(m[1]));
ok(JSON.stringify(steps) === JSON.stringify(['Tell us about the project', 'Reno Rise reviews the information', 'You may be connected with a professional', 'You review the options and decide']), `how-it-works steps are ${JSON.stringify(steps)}`);
ok(!/(guarantee[sd]? (a |an |your )?(match|quote|appointment|permit)|we will (match|connect) you|100%|\d+\+? (homeowners|contractors|projects|reviews)|\bstar\b|★|rated)/i.test(decode(main)), 'homepage contains a guarantee, statistic or rating claim');
ok(!CLAIM_WORDS.test(decode(main)), `homepage describes professionals as qualified/vetted/licensed/insured/approved: ${(decode(main).match(CLAIM_WORDS) || [])[0]}`);
ok(!/\b(we|reno rise) (perform|do|carry out|complete)s? (the )?(construction|inspections?|assessments?)|reno rise (pulls?|applies for|submits?) permits?|code[- ]compliant\b/i.test(decode(main)), 'homepage claims Reno Rise performs construction, inspections, assessments or permit/code work');

// structured data: preserved types, no unsupported schema
ok(['Organization', 'WebSite', 'WebPage'].every((t) => types.includes(t)), `homepage structured data lost a type: ${types}`);
ok(!/GeneralContractor|AggregateRating|"Review"|LocalBusiness/.test(home), 'unsupported structured data on the homepage');
const faq = ld.flatMap((j) => j['@graph'] || [j]).find((n) => n['@type'] === 'FAQPage');
const visibleFaq = [...main.matchAll(/<div class="faq-item">\s*<h3>([\s\S]*?)<\/h3>/g)].map((m) => decode(m[1]));
ok(faq && JSON.stringify(faq.mainEntity.map((q) => q.name)) === JSON.stringify(visibleFaq), 'FAQPage markup must match the visible questions exactly');
ok(/independent local renovation professionals/.test((home.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''), 'homepage description was not updated for consistency');

// ---------------------------------------------------------------- location pages stay out of the nav and keep their indexing
for (const [rel, { html }] of pages) {
  if (!/^locations\/[^/]+\.html$/.test(rel)) continue;
  ok(!links(between(html, '<nav class="main-nav"', '</nav>')).some((l) => /locations\/[^/]+\.html/.test(l.href) && l.href !== '../locations/'), `${rel}: individual location pages must not be in the nav`);
}

console.log(`nav-check: ${checks} checks across ${headerPages} pages`);
if (failures.length) {
  const uniq = [...new Set(failures.map((f) => f.replace(/^[^:]+:/, '')))];
  console.log(`${failures.length} failure(s) (${uniq.length} distinct):`);
  for (const f of failures.slice(0, 40)) console.log(' - ' + f);
  process.exit(1);
}
console.log('nav-check: all passed');

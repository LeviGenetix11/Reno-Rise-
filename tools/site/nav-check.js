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
  ['Basement Flooring', 'services/basement-flooring/'],
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
  const mobWant = ['Home', 'Services', ...DROPDOWN.slice(0, 9).map(([l]) => l), 'Guides', 'Service Areas', 'About', 'Contact', 'Get Matched'];
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
ok(!/<figcaption class="diagram-caption">Planning illustration only\./.test(main), 'the homepage hero diagram caption was asked to be removed');
ok((main.match(/class="dg-num"/g) || []).length === 5, 'diagram numbered topics changed');
ok(/id="assessment-form"[\s\S]*data-assessment-form-mount data-source="homepage"/.test(main), 'homepage enquiry form mount is missing');
const heroVideo = (main.match(/<video class="hero-video"[^>]*>/) || [''])[0];
ok(/data-src="\.\/videos\/hero-interior\.mp4"/.test(heroVideo) && /poster="\.\/videos\/hero-poster\.jpg"/.test(heroVideo) && / muted /.test(heroVideo) && / loop /.test(heroVideo) && /aria-hidden="true"/.test(heroVideo) && /preload="none"/.test(heroVideo), `hero background video markup is wrong: ${heroVideo}`);
ok(!/<figcaption>[^<]*(?:Pexels|Photo)/i.test(main), 'homepage photo captions (Pexels / Photo by) were asked to be removed');
ok(!/stock-tag|Stock photography/i.test(decode(between(main, 'class="inspiration"', '</section>'))), 'homepage gallery: the "Stock photography" tag was asked to be removed');
ok(/not Reno Rise projects/.test(decode(main)), 'homepage gallery still says the photos are not Reno Rise projects');
ok(/<button type="button" class="hero-video-toggle" data-hero-video-toggle hidden>Pause background video<\/button>/.test(main), 'homepage needs the visually hidden pause button');
ok(fs.existsSync(path.join(ROOT, 'videos', 'hero-interior.mp4')) && fs.existsSync(path.join(ROOT, 'videos', 'hero-poster.jpg')), 'hero video files are missing from /videos');
ok(!/<video/.test(pages.get('services/legal-basement-apartment-toronto/index.html').html), 'only the homepage hero should carry the video');

const order = [...main.matchAll(/<section[^>]*>[\s\S]*?<(?:h1|h2)[^>]*>([\s\S]*?)<\/(?:h1|h2)>/g)].map((m) => decode(m[1]));
const wantOrder = ['Basement Renovations & Legal Secondary Suites in Toronto', 'How Reno Rise Works', 'What Would You Like to Do With Your Basement?', 'Finished Basement or Legal Secondary Suite?', 'Cost, Permit & Planning Guides', 'Why Homeowners Use Reno Rise'];
ok(wantOrder.every((h, i) => order[i] === h), `homepage section order is ${JSON.stringify(order)}`);
ok(order[order.length - 2] === 'Frequently Asked Questions' && order[order.length - 1] === 'Tell Us About Your Project', 'homepage must end with the FAQ and then the enquiry form');
ok((main.match(/<h2>How Reno Rise Works<\/h2>/g) || []).length === 1, 'How Reno Rise Works appears more than once');
ok(!/class="cta-band"/.test(main + home.slice(home.indexOf('</main>'), home.indexOf('</main>') + 200)), 'a CTA band follows the final form');
const steps = [...main.matchAll(/<div class="process-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map((m) => decode(m[1]));
ok(JSON.stringify(steps) === JSON.stringify(['Tell us about the project', 'Reno Rise reviews the information', 'We find the right contractor']), `how-it-works steps are ${JSON.stringify(steps)}`);
ok(!/(guarantee[sd]? (a |an |your )?(match|quote|appointment|permit)|we will (match|connect) you|100%|\d+\+? (homeowners|contractors|projects|reviews)|\bstar\b|★|rated)/i.test(decode(main)), 'homepage contains a guarantee, statistic or rating claim');
ok(!/suitable fit|not guaranteed|who, if anyone|if anyone, to hire|professional you (?:choose|select)|keeps the decision with you|you review the options/i.test(decode(main)), 'homepage still contains wording that contradicts "Reno Rise chooses the contractor"');
ok(!CLAIM_WORDS.test(decode(main)), `homepage describes professionals as qualified/vetted/licensed/insured/approved: ${(decode(main).match(CLAIM_WORDS) || [])[0]}`);
ok(!/\b(we|reno rise) (perform|do|carry out|complete)s? (the )?(construction|inspections?|assessments?)|reno rise (pulls?|applies for|submits?) permits?|code[- ]compliant\b/i.test(decode(main)), 'homepage claims Reno Rise performs construction, inspections, assessments or permit/code work');

// hours of operation: one statement, the same wherever it appears
{
  const L2 = require('./lib');
  ok(decode(pages.get('contact.html').html).includes('Office & Inquiry Hours ' + L2.HOURS), 'contact page must state the hours of operation from lib.js');
  const bk = pages.get('book/index.html');
  if (bk) ok(decode(bk.html).includes(L2.HOURS_ET), 'book page must state the hours of operation from lib.js');
  for (const [rel, { html }] of pages) {
    const txt = decode(html);
    ok(!/\b(?:Mon(?:day)?\s*(?:-|–|to)\s*Fri(?:day)?|weekdays only|Monday to Friday)\b/i.test(txt.replace(/business days?/gi, '')), rel + ': states weekday-only hours, which contradicts the every-day hours');
    const times = [...txt.matchAll(/\b(\d{1,2}:\d{2}) ?(AM|PM)\b/gi)].map((m) => m[0]);
    ok(times.every((x) => /^(8:00 ?AM|8:00 ?PM)$/i.test(x)) || rel.startsWith('blog/'), rel + ': mentions a time other than the 8:00 AM to 8:00 PM hours: ' + times.join(', '));
  }
}

// consultation booking: when enabled, the page, the thank-you button and the privacy line exist and are safe; when not, nothing leaks
{
  const cfg = require('./booking').load();
  const book = pages.get('book/index.html');
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  ok(!/\/book\//.test(sitemap), 'the booking page should not be in the sitemap');
  if (cfg.enabled) {
    ok(!!book, 'booking is enabled but book/index.html was not built');
    if (book) {
      const h = book.html;
      ok(/<meta name="robots" content="noindex, follow">/.test(h), 'book/: must be noindex, follow');
      ok((h.match(/<h1[\s>]/g) || []).length === 1, 'book/: exactly one h1');
      ok(new RegExp('id="book-embed"[^>]*data-cal-link="' + cfg.calLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(h), 'book/: the embed must point at the configured Cal.com link');
      ok(/data-cal-origin="https:\/\/app\.cal\.com"/.test(h), 'book/: embed origin');
      ok(h.includes('href="' + cfg.hostedUrl + '" target="_blank" rel="noopener noreferrer"'), 'book/: needs the hosted-page fallback link (new tab, noopener)');
      ok(/<noscript>[^]*?href="[^"]*"[^]*?<\/noscript>/.test(h) && h.includes('tel:'), 'book/: needs the no-JavaScript fallback and a phone link');
      ok(/role="region" aria-label="Choose a call time"/.test(h) && /role="status" aria-live="polite"/.test(h), 'book/: embed region and status must be labelled for assistive technology');
      ok(/<script src="\.\.\/js\/book\.js"><\/script>/.test(h), 'book/: loads js/book.js');
      ok(/Privacy Policy/.test(h) && /Cal\.com/.test(h), 'book/: needs the data-handling note that names Cal.com and links to the privacy policy');
      ok(!/dev-placeholder/.test(h), 'book/: development placeholder left in the page');
      ok(!/free-renovation-consultation"|"free-renovation-consultation\//.test(h.replace(cfg.calLink, '')), 'book/: an old event link is still present');
    }
    ok(/class="btn btn-primary">Book Your Free Consultation/.test(pages.get('assessment/thank-you.html').html), 'thank-you page: needs the optional booking button');
    ok(/Cal\.com/.test(pages.get('privacy/index.html').html), 'privacy policy: must name Cal.com when booking is on');
    ok(fs.existsSync(path.join(ROOT, 'js', 'book.js')), 'js/book.js is missing');
    // the booking button/link must not be pushed on every page: only the thank-you page links to /book/
    const linkers = [...pages.keys()].filter((r) => r !== 'book/index.html' && /href="(?:\.\.\/|\.\/|\/)?(?:\.\.\/)*book\/(?:\?[^"]*)?"/.test(pages.get(r).html));
    ok(linkers.every((r) => r === 'assessment/thank-you.html'), 'unexpected pages link to /book/: ' + linkers.join(', '));
  } else {
    ok(!book && !pages.get('assessment/thank-you.html').html.includes('ty-book'), 'booking is disabled but a booking page or button is still published');
  }
}

// web font: self-hosted and preloaded on every page, no Google Fonts requests, size-matched fallbacks in the stylesheet
{
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  for (const f of ['plus-jakarta-sans-v12-latin.woff2', 'plus-jakarta-sans-v12-latin-ext.woff2', 'OFL.txt']) ok(fs.existsSync(path.join(ROOT, 'fonts', f)), `fonts/${f} is missing`);
  ok(/@font-face\s*\{[^}]*font-family: 'Plus Jakarta Sans';[^}]*font-display: swap;[^}]*plus-jakarta-sans-v12-latin\.woff2/.test(css), 'stylesheet must declare the self-hosted Plus Jakarta Sans with font-display: swap');
  ok((css.match(/font-family: 'Plus Jakarta Sans Fallback';/g) || []).length === 2 && (css.match(/size-adjust:/g) || []).length === 2, 'stylesheet needs the two size-matched fallback faces (regular and bold)');
  ok(/font-family: 'Plus Jakarta Sans', 'Plus Jakarta Sans Fallback'/.test(css), 'body and headings must list the fallback face');
  ok(/googleapis|gstatic/.test(css) === false, 'stylesheet still refers to Google Fonts');
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  ok((vercel.headers || []).some((h) => h.source === '/fonts/(.*)' && h.headers.some((x) => x.key === 'Cache-Control' && /max-age=31536000/.test(x.value))), 'vercel.json should cache /fonts/ for a year');
  for (const [rel, { html }] of pages) {
    ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), `${rel}: still loads Google Fonts`);
    ok(/<link rel="preload" href="[^"]*fonts\/plus-jakarta-sans-v12-latin\.woff2" as="font" type="font\/woff2" crossorigin>/.test(html), `${rel}: needs the preload for the self-hosted font (with crossorigin)`);
    ok(html.indexOf('rel="preload"') < html.indexOf('css/style.min.css'), `${rel}: the font preload should come before the stylesheet`);
    ok(!/css\/style\.css"/.test(html), `${rel}: should link the minified stylesheet, not css/style.css`);
  }
}

// security headers: HSTS, COOP and a CSP that is at least restricted to the origins the site actually uses
{
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const site = (vercel.headers || []).find((h) => h.source === '/(.*)');
  ok(!!site, 'vercel.json needs a header rule matching every page');
  const val = (key) => (site.headers.find((x) => x.key === key) || {}).value || '';
  ok(/max-age=\d{7,}/.test(val('Strict-Transport-Security')), 'HSTS max-age missing or too short');
  ok(val('Cross-Origin-Opener-Policy') === 'same-origin', 'COOP should be same-origin');
  const csp = val('Content-Security-Policy');
  ok(!!csp, 'Content-Security-Policy header is missing');
  ok(/object-src 'none'/.test(csp), "CSP: object-src 'none' is missing");
  ok(/base-uri 'self'/.test(csp), "CSP: base-uri 'self' is missing");
  ok(/frame-ancestors 'self'/.test(csp), "CSP: frame-ancestors 'self' is missing");
  ok(/form-action 'self'/.test(csp), "CSP: form-action 'self' is missing");
  ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'CSP: script-src must not allow unsafe-inline (the site has no inline scripts left to justify it)');
  ok(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) && /script-src[^;]*https:\/\/app\.cal\.com/.test(csp), 'CSP: script-src is missing Turnstile or Cal.com');
  ok(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) && /frame-src[^;]*https:\/\/app\.cal\.com/.test(csp), 'CSP: frame-src is missing Turnstile or Cal.com');
  ok(/connect-src[^;]*https:\/\/renorise-forms\.levi-gene-ous\.workers\.dev/.test(csp), 'CSP: connect-src is missing the leads API');
  ok(!/fonts\.googleapis|fonts\.gstatic/.test(csp), 'CSP still allow-lists Google Fonts, which the site no longer uses');
  // the one remaining inline construct on every page is JSON-LD, which browsers never execute as script regardless of CSP
  for (const [rel, { html }] of pages) {
    const inlineScripts = [...html.matchAll(/<script(\b[^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs]) => !/\bsrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs));
    ok(inlineScripts.length === 0, `${rel}: has an inline <script> that a strict script-src (no 'unsafe-inline') would block: ${inlineScripts.map((m) => m[0].slice(0, 60)).join(' | ')}`);
  }
}

// css/style.min.css (the file every page actually links to) must be freshly built from css/style.css
{
  const { minifyCss } = require('./minify-css.js');
  const src = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const min = fs.readFileSync(path.join(ROOT, 'css', 'style.min.css'), 'utf8');
  ok(min === minifyCss(src), 'css/style.min.css is stale: run node tools/site/minify-css.js (part of build.js) after editing css/style.css');
  ok(min.length < src.length, 'css/style.min.css should be smaller than the source stylesheet');
}

// hero video: homepage + the keyword landing pages only
{
  const { LANDINGS } = require('./pages/landing-data');
  const want = new Set(['index.html', ...LANDINGS.map((l) => `services/${l.slug}/index.html`)]);
  const have = [...pages.keys()].filter((rel) => /data-hero-video/.test(pages.get(rel).html));
  ok(LANDINGS.length === 11, `expected 11 landing pages, found ${LANDINGS.length}`);
  ok(have.length === want.size && have.every((r) => want.has(r)), `hero video should be on exactly the homepage and the landing pages; found on ${have.join(', ')}`);
  for (const rel of want) {
    const h = pages.get(rel).html;
    const v = (h.match(/<video class="hero-video"[^>]*>/) || [''])[0];
    ok(/ muted /.test(v) && / loop /.test(v) && /aria-hidden="true"/.test(v) && /preload="none"/.test(v) && /data-src="[^"]*videos\/hero-interior\.mp4"/.test(v) && /poster="[^"]*videos\/hero-poster\.jpg"/.test(v), `${rel}: hero video markup`);
    ok(/<section class="hero hero-basement hero-has-video">/.test(h) || rel === 'index.html', `${rel}: hero needs the video class`);
    ok(/class="hero-video-toggle" data-hero-video-toggle hidden>Pause background video<\/button>/.test(h), `${rel}: needs the visually hidden pause button`);
    ok(!/suitable fit|cannot guarantee a match|you choose who to hire|professional you choose/i.test(decode(between(h, '<main', '</main>'))), `${rel}: still has wording that says the homeowner chooses or that a match is uncertain`);
  }
}

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

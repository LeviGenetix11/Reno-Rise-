// Browser test for the header, dropdown and mobile menu. Not part of `build.js` because it needs a real browser.
//
//   PW_DIR=<folder containing node_modules/playwright-core> node tools/site/browser-tests/nav.mjs [--probe]
//
// Serves the repository root locally (Vercel-like: folder index.html, trailing-slash redirect), drives Microsoft Edge (or
// set PW_CHANNEL=chrome) and only lets Google Fonts through, so real font metrics are measured. Nothing else leaves the
// machine. `--probe` prints a fit table for many widths without asserting, to help choose the hamburger breakpoint.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const require = createRequire(join(process.env.PW_DIR || process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');
const PROBE = process.argv.includes('--probe');
const PORT = 8871;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(308, { Location: p + '/' + url.search }); return res.end(); }
    f = join(f, 'index.html');
  }
  if (!existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const t = (name, ok, extra = '') => { results.push(ok); if (!PROBE || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
async function open(path, width, { touch = false, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto(BASE + path, { waitUntil: 'load' });
  if (process.env.PROBE_FORCE === '1') await page.addStyleTag({ content: '.main-nav{display:flex!important}.nav-toggle{display:none!important}' });
  // Trigger and wait for the real web font so widths are the real ones (the page loads it asynchronously).
  await page.evaluate(() => document.fonts.load('600 14px "Plus Jakarta Sans"').then(() => document.fonts.ready)).catch(() => {});
  await page.waitForFunction(() => document.fonts.check('600 14px "Plus Jakarta Sans"'), null, { timeout: 8000 }).catch(() => {});
  if (!(await page.evaluate(() => document.fonts.check('600 14px "Plus Jakarta Sans"')))) { // one retry: the font comes from the network
    await page.reload({ waitUntil: 'load' });
    if (process.env.PROBE_FORCE === '1') await page.addStyleTag({ content: '.main-nav{display:flex!important}.nav-toggle{display:none!important}' });
    await page.evaluate(() => document.fonts.load('600 14px "Plus Jakarta Sans"').then(() => document.fonts.ready)).catch(() => {});
    await page.waitForFunction(() => document.fonts.check('600 14px "Plus Jakarta Sans"'), null, { timeout: 8000 }).catch(() => {});
  }
  return { ctx, page, errs };
}

// Everything measured in the page, so the numbers are what the browser really laid out.
const MEASURE = () => {
  const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const header = document.querySelector('.site-header');
  const inner = document.querySelector('.header-inner');
  const logo = document.querySelector('.header-inner .logo');
  const nav = document.querySelector('.main-nav');
  const cta = document.querySelector('.header-cta .btn');
  const toggle = document.querySelector('.nav-toggle');
  const items = Array.from(document.querySelectorAll('.main-nav > a, .main-nav .nav-dropdown-toggle'));
  const navVisible = vis(nav);
  const fs = items[0] ? parseFloat(getComputedStyle(items[0]).fontSize) : 0;
  const wrapped = items.filter((el) => {
    const lines = new Set();
    Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).forEach((n) => { const range = document.createRange(); range.selectNodeContents(n); Array.from(range.getClientRects()).filter((r) => r.width > 0).forEach((r) => lines.add(Math.round(r.top))); });
    return navVisible && (lines.size > 1 || getComputedStyle(el).whiteSpace !== 'nowrap');
  }).map((el) => el.textContent.trim());
  const ir = items.map(rect);
  const nr = nav ? rect(nav) : null;
  const content = ir.length ? Math.max(...ir.map((r) => r.r)) - Math.min(...ir.map((r) => r.l)) : 0;
  const gaps = [];
  if (navVisible) {
    const lr = rect(logo), cr = rect(cta);
    gaps.push(Math.round(ir[0].l - lr.r), Math.round(cr.l - ir[ir.length - 1].r));
  }
  const overlaps = [];
  const boxes = [['logo', logo], ...items.map((el, i) => [`nav:${el.textContent.trim()}`, el]), ['cta', cta]].filter(([, el]) => vis(el)).map(([n, el]) => [n, rect(el)]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i][1], b = boxes[j][1];
    if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) overlaps.push(`${boxes[i][0]} x ${boxes[j][0]}`);
  }
  const lg = rect(logo.querySelector('img'));
  return {
    vw: document.documentElement.clientWidth,
    docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    headerOverflow: header.scrollWidth > header.clientWidth || inner.scrollWidth > inner.clientWidth,
    navVisible, toggleVisible: vis(toggle), ctaVisible: vis(cta),
    fontPx: fs, wrapped, overlaps,
    navOverflow: navVisible ? nav.scrollWidth > nav.clientWidth + 0.5 : false,
    slack: navVisible ? Math.round(nr.w - content) : null,
    gaps,
    logoPx: { w: Math.round(lg.w), h: Math.round(lg.h) },
    logoText: vis(logo.querySelector('.logo-text b')),
    ctaBox: vis(cta) ? rect(cta) : null,
    ctaText: cta ? cta.textContent.replace(/\s+/g, ' ').trim() : '',
    ctaPad: cta ? getComputedStyle(cta).paddingLeft : '',
    fontsLoaded: document.fonts.check('600 14px "Plus Jakarta Sans"'),
    headerBottom: header.getBoundingClientRect().bottom,
    // vertical centre of each nav label's text (not its box), the logo mark and the CTA
    centres: navVisible ? {
      items: items.map((el) => { const r = document.createRange(); r.selectNodeContents(Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim())); const b = r.getBoundingClientRect(); return (b.top + b.bottom) / 2; }),
      logo: (lg.t + lg.b) / 2, cta: (rect(cta).t + rect(cta).b) / 2,
    } : null,
  };
};

const WIDTHS = PROBE
  ? [1920, 1600, 1440, 1366, 1300, 1280, 1240, 1200, 1180, 1160, 1140, 1120, 1100, 1080, 1024, 900, 768, 390, 360]
  : [1920, 1440, 1366, 1280, 1180, 1024, 768, 390, 360];
const PAGES = PROBE ? ['/'] : ['/', '/assessment/', '/services/legal-basement-apartment-toronto/'];

// -------------------------------------------------------------------- fit at every width
const table = [];
for (const path of PAGES) {
  for (const w of WIDTHS) {
    // The web font is fetched from Google: retry the page up to 3 times if it did not arrive, so widths are the real ones.
    let ctx, page, errs, m;
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ ctx, page, errs } = await open(path, w));
      m = await page.evaluate(MEASURE);
      if (m.fontsLoaded || attempt === 2) break;
      await ctx.close();
    }
    table.push({ path, w, ...m });
    if (PROBE) { await ctx.close(); continue; }
    const tag = `${path} @${w}px`;
    const desktop = m.navVisible;
    // Real font metrics matter for the fit check (desktop). On phones the nav is in the menu, so a slow font is only a warning.
    if (desktop) t(`${tag}: web font loaded (real metrics)`, m.fontsLoaded);
    else if (!m.fontsLoaded) console.log(`WARN  ${tag}: web font had not loaded (not used for the fit check at this width)`);
    t(`${tag}: either the full desktop nav or the hamburger is shown, never both`, desktop !== m.toggleVisible, `nav=${desktop} toggle=${m.toggleVisible}`);
    t(`${tag}: no horizontal page overflow`, !m.docOverflow && !m.headerOverflow);
    t(`${tag}: logo readable (mark ${m.logoPx.w}px, wordmark visible)`, m.logoPx.w >= 40 && m.logoText);
    t(`${tag}: no overlapping header items`, m.overlaps.length === 0, m.overlaps.join(', '));
    if (desktop) {
      t(`${tag}: no nav label wraps or breaks`, m.wrapped.length === 0, m.wrapped.join(', '));
      t(`${tag}: nav content fits its space (slack ${m.slack}px)`, !m.navOverflow && m.slack >= 0);
      t(`${tag}: nav font ${m.fontPx.toFixed(2)}px is at least 12.5px`, m.fontPx >= 12.48);
      const c = m.centres;
      t(`${tag}: nav labels share one baseline (spread ${(Math.max(...c.items) - Math.min(...c.items)).toFixed(1)}px) and line up with the logo and CTA`, Math.max(...c.items) - Math.min(...c.items) <= 0.75 && Math.abs(c.logo - c.cta) <= 1.5 && Math.abs(c.items[0] - c.cta) <= 2, JSON.stringify({ logo: c.logo, cta: c.cta, items: c.items.map((x) => +x.toFixed(1)) }));
      t(`${tag}: visible gaps around the nav are at least 16px (${m.gaps.join('/')})`, m.gaps.every((g) => g >= 16));
      t(`${tag}: CTA "Get Matched" fully visible inside the viewport`, m.ctaVisible && m.ctaText === 'Get Matched' && m.ctaBox.r <= m.vw - 8 && m.ctaBox.l >= 0);
    } else {
      t(`${tag}: hamburger menu button is visible and 44px`, m.toggleVisible);
    }
    t(`${tag}: no script errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
}

if (PROBE) {
  console.log('width  nav  font   slack  gaps(l/r)  cta-pad  overflow  wrapped');
  for (const r of table) {
    console.log(`${String(r.w).padEnd(6)} ${r.navVisible ? 'yes ' : 'no  '} ${r.fontPx ? r.fontPx.toFixed(2).padEnd(6) : '-     '} ${String(r.slack ?? '-').padEnd(6)} ${r.gaps.join('/').padEnd(10)} ${r.ctaPad.padEnd(8)} ${r.navOverflow || r.docOverflow ? 'YES' : 'no '}       ${r.wrapped.join(',') || '-'}`);
  }
  await browser.close(); server.close(); process.exit(0);
}

// -------------------------------------------------------------------- dropdown: mouse, keyboard, touch
const MENU_ITEMS = [
  ['Basement Renovations', '/services/basement-renovation/'],
  ['Basement Finishing', '/services/basement-finishing/'],
  ['Underpinning', '/services/underpinning/'],
  ['Waterproofing', '/services/basement-waterproofing/'],
  ['Egress Windows', '/services/egress-windows/'],
  ['Separate Entrances', '/services/walkout-construction/'],
  ['Soundproofing', '/services/basement-soundproofing/'],
  ['View All Basement Services', '/services/#basement-renovations-secondary-suites'],
];
const expanded = (page) => page.getAttribute('.nav-dropdown-toggle', 'aria-expanded');
const menuVisible = (page) => page.isVisible('#nav-basement-services');
const focusedText = (page) => page.evaluate(() => (document.activeElement ? document.activeElement.textContent.replace(/\s+/g, ' ').trim() : ''));

{
  const { ctx, page } = await open('/', 1440);
  const toggleBtn = page.locator('.nav-dropdown-toggle');
  t('dropdown: closed by default, aria-expanded=false, aria-controls points at the menu', (await expanded(page)) === 'false' && !(await menuVisible(page)) && (await toggleBtn.getAttribute('aria-controls')) === 'nav-basement-services' && (await page.locator('#nav-basement-services').count()) === 1);
  t('dropdown: the menu has an accessible name', (await page.getAttribute('#nav-basement-services', 'aria-label')) === 'Basement services');
  const links = await page.$$eval('#nav-basement-services a', (as) => as.map((a) => [a.textContent.trim(), new URL(a.href).pathname + new URL(a.href).hash]));
  t('dropdown: exactly the requested items, in order, mapped to existing pages', JSON.stringify(links) === JSON.stringify(MENU_ITEMS), JSON.stringify(links));

  await toggleBtn.focus(); await page.keyboard.press('Enter');
  t('dropdown (keyboard): Enter opens it and sets aria-expanded=true', (await expanded(page)) === 'true' && (await menuVisible(page)));
  const mr = await page.locator('#nav-basement-services').boundingBox();
  t('dropdown: stays inside the viewport', mr.x >= 0 && mr.x + mr.width <= 1440 && mr.y + mr.height <= 900, JSON.stringify(mr));
  await page.keyboard.press('Escape');
  t('dropdown (keyboard): Escape closes it and returns focus to the button', (await expanded(page)) === 'false' && !(await menuVisible(page)) && (await focusedText(page)).startsWith('Basement Services'));
  await page.keyboard.press('ArrowDown');
  t('dropdown (keyboard): ArrowDown opens it and focuses the first item', (await expanded(page)) === 'true' && (await focusedText(page)) === 'Basement Renovations');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
  t('dropdown (keyboard): arrows and End move through the items', (await focusedText(page)) === 'View All Basement Services');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp');
  t('dropdown (keyboard): ArrowUp from the first item wraps to the last', (await focusedText(page)) === 'View All Basement Services');
  await page.keyboard.press('Tab');
  t('dropdown (keyboard): tabbing out of the last item closes it and moves on to the next nav link', (await expanded(page)) === 'false' && (await focusedText(page)) === 'Legal Secondary Suites', await focusedText(page));
  await toggleBtn.click();
  t('dropdown (mouse): click opens it', (await expanded(page)) === 'true');
  await page.mouse.click(700, 600);
  t('dropdown (mouse): clicking elsewhere closes it', (await expanded(page)) === 'false' && !(await menuVisible(page)));
  await page.mouse.move(5, 400); await toggleBtn.hover();
  t('dropdown (mouse): hover opens it and keeps aria-expanded in step', (await expanded(page)) === 'true' && (await menuVisible(page)));
  await page.mouse.move(700, 600); await page.waitForTimeout(400);
  t('dropdown (mouse): moving away closes it', (await expanded(page)) === 'false' && !(await menuVisible(page)));
  await ctx.close();
}
{
  const { ctx, page } = await open('/', 1280, { touch: true });
  await page.locator('.nav-dropdown-toggle').tap();
  t('dropdown (touch): tap opens it', (await expanded(page)) === 'true' && (await menuVisible(page)));
  await page.touchscreen.tap(700, 650);
  t('dropdown (touch): tapping elsewhere closes it', (await expanded(page)) === 'false' && !(await menuVisible(page)));
  await page.locator('.nav-dropdown-toggle').tap(); await page.locator('.nav-dropdown-toggle').tap();
  t('dropdown (touch): a second tap on the button closes it', (await expanded(page)) === 'false');
  await ctx.close();
}
{
  // Only one dropdown item is a button, so opening it cannot leave another open; check the toggle count too.
  const { ctx, page } = await open('/', 1440);
  t('nav: exactly one dropdown', (await page.locator('.nav-dropdown').count()) === 1);
  await ctx.close();
}

// -------------------------------------------------------------------- desktop labels and destinations (rendered)
{
  const { ctx, page } = await open('/', 1440);
  const items = await page.$$eval('.main-nav > a, .main-nav .nav-dropdown-toggle', (els) => els.map((e) => [e.textContent.replace(/\s+/g, ' ').trim(), e.tagName === 'A' ? new URL(e.href).pathname : '(dropdown)']));
  const want = [['Home', '/'], ['Basement Services', '(dropdown)'], ['Legal Secondary Suites', '/services/legal-basement-apartment-toronto/'], ['Cost & Permit Guides', '/blog/'], ['Service Areas', '/locations/'], ['About', '/about.html'], ['Contact', '/contact.html']];
  t('desktop nav: labels and destinations match the brief, in order', JSON.stringify(items) === JSON.stringify(want), JSON.stringify(items));
  t('desktop nav: no "Other Services" item', !items.some(([l]) => /other services/i.test(l)));
  const cta = await page.$eval('.header-cta .btn', (e) => [e.textContent.replace(/\s+/g, ' ').trim(), new URL(e.href).pathname]);
  t('header CTA: "Get Matched" -> /assessment/', cta[0] === 'Get Matched' && cta[1] === '/assessment/', JSON.stringify(cta));
  t('keyboard focus is visible on nav links (3px outline)', await (async () => {
    await page.locator('.main-nav > a').first().focus();
    return page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  })());
  await ctx.close();
}

// -------------------------------------------------------------------- mobile menu
for (const w of [768, 390, 360, 1024, 1119]) {
  const { ctx, page } = await open('/', w);
  const tg = page.locator('.nav-toggle');
  t(`mobile menu @${w}: starts closed with aria-expanded=false`, (await tg.getAttribute('aria-expanded')) === 'false' && !(await page.isVisible('.mobile-nav')));
  await tg.click();
  t(`mobile menu @${w}: opens, aria-expanded=true, focus moves to Close`, (await tg.getAttribute('aria-expanded')) === 'true' && (await page.isVisible('.mobile-nav')) && (await page.evaluate(() => document.activeElement.classList.contains('mobile-nav-close'))));
  const labels = await page.$$eval('.mobile-nav a', (as) => as.map((a) => [a.textContent.replace(/\s+/g, ' ').trim(), new URL(a.href).pathname + new URL(a.href).hash]));
  const wantMobile = [['Home', '/'], ['Basement Services', '/services/#basement-renovations-secondary-suites'], ...MENU_ITEMS.slice(0, 7), ['Legal Secondary Suites', '/services/legal-basement-apartment-toronto/'], ['Cost & Permit Guides', '/blog/'], ['Service Areas', '/locations/'], ['About', '/about.html'], ['Contact', '/contact.html'], ['Get Matched', '/assessment/']];
  t(`mobile menu @${w}: every requested link, in order`, JSON.stringify(labels) === JSON.stringify(wantMobile), JSON.stringify(labels.map((l) => l[0])));
  t(`mobile menu @${w}: page behind it is inert (no focus behind the overlay)`, await page.evaluate(() => document.querySelector('.site-header').inert && document.querySelector('main').inert && document.querySelector('footer').inert));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  t(`mobile menu @${w}: no horizontal overflow while open`, !overflow);
  // Tab through: focus stays on menu items, and Shift+Tab / Tab eventually leave the page rather than looping forever.
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const inMenu = await page.evaluate(() => !!document.activeElement.closest('.mobile-nav'));
    if (!inMenu) break;
    seen.add(await focusedText(page));
  }
  t(`mobile menu @${w}: Tab never lands on inert page content and is not trapped (it eventually leaves)`, await page.evaluate(() => !document.activeElement.closest('.site-header, main, footer')) && seen.size >= 10, `${seen.size} stops`);
  await page.locator('.mobile-nav-close').focus();
  await page.keyboard.press('Escape');
  t(`mobile menu @${w}: Escape closes it, returns focus to the menu button, page is interactive again`, !(await page.isVisible('.mobile-nav')) && (await tg.getAttribute('aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement.classList.contains('nav-toggle'))) && (await page.evaluate(() => !document.querySelector('main').inert)));
  await tg.click(); await page.locator('.mobile-nav-close').click();
  t(`mobile menu @${w}: the Close button closes it`, !(await page.isVisible('.mobile-nav')) && (await page.evaluate(() => !document.body.classList.contains('nav-open'))));
  await tg.click(); await page.locator('.mobile-nav a', { hasText: 'Contact' }).click();
  await page.waitForURL(/contact\.html/);
  t(`mobile menu @${w}: choosing a link navigates`, /contact\.html$/.test(page.url()));
  await ctx.close();
}
{
  // Resizing up past the breakpoint while the menu is open closes it.
  const { ctx, page } = await open('/', 900);
  await page.locator('.nav-toggle').click();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  t('resizing to desktop closes the open mobile menu and makes the page interactive', !(await page.isVisible('.mobile-nav')) && (await page.evaluate(() => !document.querySelector('main').inert)));
  await ctx.close();
}

// -------------------------------------------------------------------- homepage hero + structure
{
  const { ctx, page } = await open('/', 1440);
  const txt = (sel) => page.locator(sel).first().innerText();
  t('hero: H1 unchanged', (await txt('h1')) === 'Basement Renovations & Legal Secondary Suites in Toronto');
  t('hero: new supporting copy', (await txt('.hero-copy > p')).replace(/’/g, "'") === "Whether you're finishing your basement, creating more living space or exploring a legal secondary suite, Reno Rise helps you understand the project and connect with independent local renovation professionals.");
  const btns = await page.$$eval('.hero-actions a', (as) => as.map((a) => { const h = a.getAttribute('href'); return [a.textContent.trim(), h.startsWith('./') ? h.slice(2) : h]; }));
  t('hero: primary "Tell Us About Your Project" -> the enquiry form; secondary -> legal suite page', JSON.stringify(btns) === JSON.stringify([['Tell Us About Your Project', '#assessment-form'], ['Explore Legal Suite Requirements', 'services/legal-basement-apartment-toronto/']]), JSON.stringify(btns));
  t('hero: new disclosure line', (await txt('.hero-note')) === 'Reno Rise helps Toronto homeowners plan projects and connect with independent renovation professionals. You review the options and choose who, if anyone, to hire.');
  t('diagram: new fine print, numbered key kept', (await txt('.diagram-caption')) === 'Planning illustration only. Property requirements vary. Confirm applicable requirements with Toronto Building and the professionals responsible for your project.' && (await page.locator('.diagram-legend li').count()) === 5);
  const order = await page.$$eval('main > section', (ss) => ss.map((s) => (s.querySelector('h1, h2') || {}).textContent?.replace(/\s+/g, ' ').trim()));
  t('homepage sections are in the requested order', ['Basement Renovations & Legal Secondary Suites in Toronto', 'How Reno Rise Works', 'What Would You Like to Do With Your Basement?', 'Finished Basement or Legal Secondary Suite?', 'Cost, Permit & Planning Guides', 'Why Homeowners Use Reno Rise'].every((h, i) => order[i] === h) && order[order.length - 2] === 'Frequently Asked Questions' && order[order.length - 1] === 'Tell Us About Your Project', JSON.stringify(order));
  const steps = await page.$$eval('.how-steps h3', (hs) => hs.map((h) => h.textContent.trim()));
  t('how it works: four steps as briefed', JSON.stringify(steps) === JSON.stringify(['Tell us about the project', 'Reno Rise reviews the information', 'You may be connected with a professional', 'You review the options and decide']), JSON.stringify(steps));
  t('form: still mounted on the homepage with all fields and consent', (await page.locator('#assessment-form .assessment-form input[name="consent"]').count()) === 1 && (await page.locator('#assessment-form .assessment-form input[name="email"]').count()) === 1);
  await page.locator('.hero-actions a.btn-primary').click();
  t('hero button scrolls to the form', (await page.evaluate(() => location.hash)) === '#assessment-form');
  await ctx.close();
}
{
  // Diagram legibility on phones.
  const { ctx, page } = await open('/', 360);
  const box = await page.locator('.diagram-card').boundingBox();
  const key = await page.locator('.diagram-legend li').first().evaluate((li) => parseFloat(getComputedStyle(li).fontSize));
  t('diagram @360px: fits the screen and the key text is at least 13px', box.x >= 0 && box.x + box.width <= 360 && key >= 13, `${Math.round(box.width)}px wide, key ${key}px`);
  const cap = await page.locator('.diagram-caption').evaluate((c) => parseFloat(getComputedStyle(c).fontSize));
  t('diagram @360px: fine print at least 12px', cap >= 12, `${cap}px`);
  await ctx.close();
}

// -------------------------------------------------------------------- forms still submit (API intercepted: nothing is sent anywhere)
const API = 'https://renorise-forms.levi-gene-ous.workers.dev/api/leads';
const REF = 'AbCdEfGhIjKlMnOpQrStUv_-12';
for (const [path, source] of [['/', 'homepage'], ['/assessment/', 'assessment'], ['/contact.html', 'contact']]) {
  const { ctx, page } = await open(path, 1280);
  let posted = null;
  await page.route(API, async (r) => { posted = JSON.parse(r.request().postData()); await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, leadId: 'x', bookingRef: REF }) }); });
  await page.route('https://challenges.cloudflare.com/**', (r) => r.abort());
  await page.evaluate(() => { window.turnstile = { render: () => 'w1', getResponse: () => 'tok', reset() {} }; });
  await page.waitForSelector('.assessment-form');
  await page.fill('.assessment-form #af-name', 'Test Person'); await page.fill('.assessment-form #af-email', 'test@example.test');
  await page.fill('.assessment-form #af-phone', '(416) 555-0100'); await page.fill('.assessment-form #af-city', 'M4L 1A1');
  await page.selectOption('.assessment-form #af-type', 'Finished basement'); await page.selectOption('.assessment-form #af-start-timeframe', 'Just exploring');
  await page.check('.assessment-form #af-consent');
  await Promise.all([page.waitForURL(/thank-you\.html/), page.click('.assessment-form button[type=submit]')]);
  t('form on ' + path + ' submits with source "' + source + '", consent, and lands on the thank-you page', !!posted && posted.source === source && /Consent: agreed/.test(posted.details) && posted.turnstile_token === 'tok' && /thank-you\.html$/.test(page.url()), JSON.stringify(posted && posted.source));
  await ctx.close();
}

// -------------------------------------------------------------------- accessibility (axe wcag2a/2aa) on the changed pages
const axeSource = readFileSync(join(process.env.PW_DIR || process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
for (const [path, w] of [['/', 1440], ['/', 390], ['/services/legal-basement-apartment-toronto/', 390]]) {
  const { ctx, page } = await open(path, w);
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((x) => x.id + '(' + x.nodes.length + ') ' + x.nodes[0].target.join(' ')));
  t('axe ' + path + ' @' + w + 'px: no WCAG 2.1 A/AA violations', v.length === 0, v.join(' ; '));
  await ctx.close();
}
{
  // ...and with the dropdown open and the mobile menu open.
  const { ctx, page } = await open('/', 1440);
  await page.evaluate(axeSource); await page.locator('.nav-dropdown-toggle').click();
  const v1 = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((x) => x.id + '(' + x.nodes.length + ') ' + x.nodes[0].target.join(' ')));
  t('axe: dropdown open', v1.length === 0, v1.join(' ; '));
  await ctx.close();
  const m = await open('/', 390);
  await m.page.evaluate(axeSource); await m.page.locator('.nav-toggle').click();
  const v2 = await m.page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((x) => x.id + '(' + x.nodes.length + ') ' + x.nodes[0].target.join(' ')));
  t('axe: mobile menu open', v2.length === 0, v2.join(' ; '));
  await m.ctx.close();
}

await browser.close(); server.close();
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);

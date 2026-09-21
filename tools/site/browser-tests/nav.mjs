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
async function open(path, width, { touch = false, height = 900, reduced = false, init = null, fontDelay = 0, wait = 'load' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [];
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  if (init) await page.addInitScript(init);
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.request().url()) ? r.continue() : r.abort()));
  if (fontDelay) await page.route('**/*.woff2', async (r) => { await new Promise((res) => setTimeout(res, fontDelay)); await r.continue(); });
  await page.goto(BASE + path, { waitUntil: wait });
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
  return { ctx, page, errs, reqs };
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
  ? [1920, 1440, 1366, 1280, 1180, 1120, 1080, 1040, 1024, 1000, 980, 960, 940, 920, 900, 860, 768, 390, 360]
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
      t(`${tag}: nav font ${m.fontPx.toFixed(2)}px is at least 15px`, m.fontPx >= 14.95);
      const c = m.centres;
      t(`${tag}: nav labels share one baseline (spread ${(Math.max(...c.items) - Math.min(...c.items)).toFixed(1)}px) and line up with the logo and CTA`, Math.max(...c.items) - Math.min(...c.items) <= 0.75 && Math.abs(c.logo - c.cta) <= 1.5 && Math.abs(c.items[0] - c.cta) <= 2, JSON.stringify({ logo: c.logo, cta: c.cta, items: c.items.map((x) => +x.toFixed(1)) }));
      t(`${tag}: visible gaps around the nav are at least 40px (${m.gaps.join('/')})`, m.gaps.every((g) => g >= 40));
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
  ['Legal Secondary Suites', '/services/legal-basement-apartment-toronto/'],
  ['Basement Finishing', '/services/basement-finishing/'],
  ['Underpinning', '/services/underpinning/'],
  ['Waterproofing', '/services/basement-waterproofing/'],
  ['Egress Windows', '/services/egress-windows/'],
  ['Separate Entrances', '/services/walkout-construction/'],
  ['Soundproofing', '/services/basement-soundproofing/'],
  ['Basement Flooring', '/services/basement-flooring/'],
  ['View All Services', '/services/'],
];
const expanded = (page) => page.getAttribute('.nav-dropdown-toggle', 'aria-expanded');
const menuVisible = (page) => page.isVisible('#nav-services');
const focusedText = (page) => page.evaluate(() => (document.activeElement ? document.activeElement.textContent.replace(/\s+/g, ' ').trim() : ''));

{
  const { ctx, page } = await open('/', 1440);
  const toggleBtn = page.locator('.nav-dropdown-toggle');
  t('dropdown: closed by default, aria-expanded=false, aria-controls points at the menu', (await expanded(page)) === 'false' && !(await menuVisible(page)) && (await toggleBtn.getAttribute('aria-controls')) === 'nav-services' && (await page.locator('#nav-services').count()) === 1);
  t('dropdown: the menu has an accessible name', (await page.getAttribute('#nav-services', 'aria-label')) === 'Services');
  const links = await page.$$eval('#nav-services a', (as) => as.map((a) => [a.textContent.trim(), new URL(a.href).pathname + new URL(a.href).hash]));
  t('dropdown: exactly the requested items, in order, mapped to existing pages', JSON.stringify(links) === JSON.stringify(MENU_ITEMS), JSON.stringify(links));

  await toggleBtn.focus(); await page.keyboard.press('Enter');
  t('dropdown (keyboard): Enter opens it and sets aria-expanded=true', (await expanded(page)) === 'true' && (await menuVisible(page)));
  const mr = await page.locator('#nav-services').boundingBox();
  t('dropdown: stays inside the viewport', mr.x >= 0 && mr.x + mr.width <= 1440 && mr.y + mr.height <= 900, JSON.stringify(mr));
  await page.keyboard.press('Escape');
  t('dropdown (keyboard): Escape closes it and returns focus to the button', (await expanded(page)) === 'false' && !(await menuVisible(page)) && (await focusedText(page)).startsWith('Services'));
  await page.keyboard.press('ArrowDown');
  t('dropdown (keyboard): ArrowDown opens it and focuses the first item', (await expanded(page)) === 'true' && (await focusedText(page)) === 'Basement Renovations');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
  t('dropdown (keyboard): arrows and End move through the items', (await focusedText(page)) === 'View All Services');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp');
  t('dropdown (keyboard): ArrowUp from the first item wraps to the last', (await focusedText(page)) === 'View All Services');
  await page.keyboard.press('Tab');
  t('dropdown (keyboard): tabbing out of the last item closes it and moves on to the next nav link', (await expanded(page)) === 'false' && (await focusedText(page)) === 'Guides', await focusedText(page));
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
  const want = [['Home', '/'], ['Services', '(dropdown)'], ['Guides', '/blog/'], ['Service Areas', '/locations/'], ['About', '/about.html'], ['Contact', '/contact.html']];
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
for (const w of [768, 390, 360, 900, 1023]) {
  const { ctx, page } = await open('/', w);
  const tg = page.locator('.nav-toggle');
  t(`mobile menu @${w}: starts closed with aria-expanded=false`, (await tg.getAttribute('aria-expanded')) === 'false' && !(await page.isVisible('.mobile-nav')));
  await tg.click();
  t(`mobile menu @${w}: opens, aria-expanded=true, focus moves to Close`, (await tg.getAttribute('aria-expanded')) === 'true' && (await page.isVisible('.mobile-nav')) && (await page.evaluate(() => document.activeElement.classList.contains('mobile-nav-close'))));
  const labels = await page.$$eval('.mobile-nav a', (as) => as.map((a) => [a.textContent.replace(/\s+/g, ' ').trim(), new URL(a.href).pathname + new URL(a.href).hash]));
  const wantMobile = [['Home', '/'], ['Services', '/services/'], ...MENU_ITEMS.slice(0, 9), ['Guides', '/blog/'], ['Service Areas', '/locations/'], ['About', '/about.html'], ['Contact', '/contact.html'], ['Get Matched', '/assessment/']];
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
  t('hero: no disclosure line above/below the buttons, no grid lines, no video button', (await page.locator('.hero .hero-note').count()) === 0 && (await page.$eval('.hero-video-toggle', (b) => { const r = b.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })) && (await page.$eval('.hero-has-video', (h) => getComputedStyle(h, '::before').backgroundImage.includes('linear-gradient(rgba(255, 255, 255') === false)));
  t('diagram: new fine print, numbered key kept', (await txt('.diagram-caption')) === 'Planning illustration only. Property requirements vary. Confirm applicable requirements with Toronto Building and the professionals responsible for your project.' && (await page.locator('.diagram-legend li').count()) === 5);
  const order = await page.$$eval('main > section', (ss) => ss.map((s) => (s.querySelector('h1, h2') || {}).textContent?.replace(/\s+/g, ' ').trim()));
  t('homepage sections are in the requested order', ['Basement Renovations & Legal Secondary Suites in Toronto', 'How Reno Rise Works', 'What Would You Like to Do With Your Basement?', 'Finished Basement or Legal Secondary Suite?', 'Cost, Permit & Planning Guides', 'Why Homeowners Use Reno Rise'].every((h, i) => order[i] === h) && order[order.length - 2] === 'Frequently Asked Questions' && order[order.length - 1] === 'Tell Us About Your Project', JSON.stringify(order));
  const steps = await page.$$eval('.how-steps h3', (hs) => hs.map((h) => h.textContent.trim()));
  t('how it works: three steps as briefed', JSON.stringify(steps) === JSON.stringify(['Tell us about the project', 'Reno Rise reviews the information', 'We find the right contractor']), JSON.stringify(steps));
  const cols = await page.$eval('.how-steps', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  t('how it works: laid out in three columns on desktop, no empty fourth column', cols === 3, String(cols));
  const hiw = (await page.locator('#how-it-works').innerText()).replace(/\s+/g, ' ');
  t('how it works: the hedging wording and the fourth step are gone', !/not guaranteed|suitable fit|review the options|who, if anyone|professional you select/i.test(hiw) && (await page.locator('#how-it-works .process-step').count()) === 3, hiw.slice(0, 200));
  t('form: still mounted on the homepage with all fields and consent', (await page.locator('#assessment-form .assessment-form input[name="consent"]').count()) === 1 && (await page.locator('#assessment-form .assessment-form input[name="email"]').count()) === 1);
  await page.locator('.hero-actions a.btn-primary').click();
  t('hero button scrolls to the form', (await page.evaluate(() => location.hash)) === '#assessment-form');
  await ctx.close();
}
// -------------------------------------------------------------------- hero background video
{
  const { ctx, page } = await open('/', 1440);
  const info = await page.$eval('[data-hero-video]', (v) => ({ muted: v.muted, loop: v.loop, aria: v.getAttribute('aria-hidden'), poster: v.getAttribute('poster'), preload: v.getAttribute('preload'), src: v.getAttribute('data-src') }));
  t('hero video: muted, looping, decorative (aria-hidden), poster set, lazy source', info.muted && info.loop && info.aria === 'true' && /hero-poster\.jpg$/.test(info.poster) && info.preload === 'none' && /videos\/hero-interior\.mp4$/.test(info.src), JSON.stringify(info));
  await page.waitForFunction(() => { const v = document.querySelector('[data-hero-video]'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 15000 }).catch(() => {});
  const playing = await page.$eval('[data-hero-video]', (v) => ({ paused: v.paused, time: v.currentTime, ready: v.readyState }));
  t('hero video @1440px: plays on its own', !playing.paused && playing.time > 0, JSON.stringify(playing));
  const overlay = await page.$eval('.hero-has-video', (h) => getComputedStyle(h, '::before').backgroundImage);
  t('hero video: a lighter overlay (at most 72% dark) lets the footage show', (() => { const alphas = [...overlay.matchAll(/rgba\(15, 17, 22, ([0-9.]+)\)/g)].map((m) => Number(m[1])); return alphas.length >= 3 && Math.max(...alphas) <= 0.72 && Math.min(...alphas) >= 0.2; })(), overlay.slice(0, 120));
  const colours = await page.$$eval('.hero-copy h1, .hero-copy > p, .hero-copy .btn-outline', (els) => els.map((e) => getComputedStyle(e).color));
  t('hero video: hero text stays light', colours.every((c) => /rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(c)), JSON.stringify(colours));
  await ctx.close();
}
{
  const { ctx, page, reqs } = await open('/', 390);
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => { const v = document.querySelector('[data-hero-video]'); const h = document.querySelector('.hero-has-video'); return { display: getComputedStyle(v).display, paused: v.paused, sources: v.querySelectorAll('source').length, bg: getComputedStyle(h).backgroundImage }; });
  t('hero video @390px: not shown, not downloaded, poster image used instead', st.display === 'none' && st.paused && st.sources === 0 && /hero-poster\.jpg/.test(st.bg) && !reqs.some((u) => /hero-interior\.mp4/.test(u)), JSON.stringify(st));
  await ctx.close();
}
{
  const { ctx, page, reqs } = await open('/', 1440, { reduced: true });
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => { const v = document.querySelector('[data-hero-video]'); return { paused: v.paused, sources: v.querySelectorAll('source').length }; });
  t('hero video (reduced motion): does not autoplay or download', st.paused && st.sources === 0 && !reqs.some((u) => /hero-interior\.mp4/.test(u)), JSON.stringify(st));
  await ctx.close();
}

// Worst case for a video is a pure-white frame. Render the hero over white, hide the text, and measure the brightest
// pixel behind each text block: the light text must still reach WCAG contrast (4.5:1 body copy, 3:1 the large heading).
for (const [w, label] of [[1440, 'two columns'], [1000, 'one column, video on'], [390, 'phone poster']]) {
  const { ctx, page } = await open('/', w);
  await page.addStyleTag({ content: '.hero-video{display:none!important}.hero-has-video{background:#fff!important}' });
  const blocks = await page.$$eval('.hero-copy h1, .hero-copy > p, .hero-copy .btn-outline', (els) => els.map((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/[0-9.]+/g).map(Number); return { name: e.tagName + '.' + e.className, x: r.left, y: r.top + scrollY, w: r.width, h: r.height, rgb: c.slice(0, 3), a: c.length > 3 ? c[3] : 1 }; }));
  await page.addStyleTag({ content: '.hero-copy *{color:transparent!important;background:transparent!important;border-color:transparent!important;text-shadow:none!important;box-shadow:none!important}' });
  const results = [];
  for (const bk of blocks) {
    const png = await page.screenshot({ clip: { x: bk.x, y: bk.y, width: Math.max(1, bk.w), height: Math.max(1, bk.h) }, fullPage: true });
    const lum = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let max = 0;
      for (let i = 0; i < d.length; i += 4) { max = Math.max(max, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
      return max;
    }, png.toString('base64'));
    // light text with alpha, composited over the brightest background pixel
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const text = bk.rgb.map((ch) => bk.a * ch + (1 - bk.a) * lum);
    const Lt = 0.2126 * lin(text[0]) + 0.7152 * lin(text[1]) + 0.0722 * lin(text[2]);
    const Lb = lin(lum);
    results.push({ name: bk.name, ratio: (Lt + 0.05) / (Lb + 0.05), need: bk.name.startsWith('H1') ? 3 : 4.5 });
  }
  t('hero text stays readable over even a white video frame @' + w + 'px (' + label + ')', results.every((r) => r.ratio >= r.need), results.map((r) => r.name.slice(0, 12) + ' ' + r.ratio.toFixed(1) + '(need ' + r.need + ')').join(', '));
  await ctx.close();
}

// -------------------------------------------------------------------- hero pause button: hidden until keyboard focus
for (const path of ['/', '/services/basement-renovation/']) {
  const { ctx, page } = await open(path, 1440);
  await page.waitForFunction(() => { const v = document.querySelector('[data-hero-video]'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 15000 }).catch(() => {});
  const btn = page.locator('.hero-video-toggle');
  t(path + ' pause button: present for assistive tech, but takes no visible space', (await btn.count()) === 1 && (await btn.getAttribute('hidden')) === null && (await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })));
  t(path + ' pause button: has an accessible name', (await btn.innerText()).trim() === 'Pause background video' || (await btn.textContent()).trim() === 'Pause background video');
  await btn.focus();
  const box = await btn.boundingBox();
  t(path + ' pause button: becomes visible and at least 44px tall when focused', box && box.height >= 43.5 && box.width > 100 && box.x >= 0 && box.y + box.height <= 900, JSON.stringify(box));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  t(path + ' pause button: Enter pauses the video and the label becomes Play', await page.$eval('[data-hero-video]', (v) => v.paused) && /Play background video/.test(await btn.textContent()));
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  t(path + ' pause button: Space plays it again', await page.$eval('[data-hero-video]', (v) => !v.paused));
  await btn.evaluate((b) => b.blur());
  t(path + ' pause button: invisible again once focus leaves', (await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })));
  await ctx.close();
}
{
  const { ctx, page } = await open('/', 390);
  t('pause button: not offered on phones, where the video never runs', await page.$eval('.hero-video-toggle', (b) => b.hidden));
  await ctx.close();
}
{
  const { ctx, page } = await open('/', 1440, { reduced: true });
  t('pause button: not offered with reduced motion, where the video never runs', await page.$eval('.hero-video-toggle', (b) => b.hidden));
  await ctx.close();
}

// -------------------------------------------------------------------- landing pages: hero background video
const LANDING = ['basement-renovation', 'basement-waterproofing', 'wet-basement-repair', 'interior-waterproofing', 'exterior-waterproofing', 'underpinning', 'egress-windows', 'sump-pump', 'backwater-valve', 'foundation-crack-repair', 'weeping-tile'].map((x) => '/services/' + x + '/');
{
  const { ctx, page } = await open(LANDING[0], 1440);
  await page.waitForFunction(() => { const v = document.querySelector('[data-hero-video]'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 15000 }).catch(() => {});
  t('landing page @1440px: the hero video plays on its own', await page.$eval('[data-hero-video]', (v) => !v.paused && v.currentTime > 0));
  t('landing page: no grid lines, lighter overlay over the video, pause button not visible', (await page.$eval('.hero-video-toggle', (b) => { const r = b.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })) && /rgba\(15, 17, 22, 0\.64\)/.test(await page.$eval('.hero-has-video', (h) => getComputedStyle(h, '::before').backgroundImage)));
  await ctx.close();
}
for (const path of LANDING) {
  for (const w of [1440, 390]) {
    const { ctx, page, reqs } = await open(path, w);
    await page.waitForTimeout(w === 390 ? 700 : 200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const phone = w === 390 ? await page.evaluate(() => { const v = document.querySelector('[data-hero-video]'); return { hidden: getComputedStyle(v).display === 'none', src: v.querySelectorAll('source').length, bg: getComputedStyle(document.querySelector('.hero-has-video')).backgroundImage }; }) : null;
    t(path + ' @' + w + 'px: no horizontal overflow' + (w === 390 ? '; phone shows the poster and never downloads the video' : ''), !over && (!phone || (phone.hidden && phone.src === 0 && /hero-poster\.jpg/.test(phone.bg) && !reqs.some((u) => /hero-interior\.mp4/.test(u)))), JSON.stringify(phone));
    await ctx.close();
  }
}
{
  const { ctx, page, reqs } = await open(LANDING[3], 1440, { reduced: true });
  await page.waitForTimeout(800);
  t('landing page (reduced motion): the video does not autoplay or download', await page.$eval('[data-hero-video]', (v) => v.paused && v.querySelectorAll('source').length === 0) && !reqs.some((u) => /hero-interior\.mp4/.test(u)));
  await ctx.close();
}
for (const [path, w] of [[LANDING[0], 1440], [LANDING[4], 1000], [LANDING[7], 390]]) {
  const { ctx, page } = await open(path, w);
  await page.addStyleTag({ content: '.hero-video{display:none!important}.hero-has-video{background:#fff!important}' });
  const blocks = await page.$$eval('.hero-copy h1, .hero-copy > p, .hero-copy .btn-outline, .hero-copy .breadcrumb a, .hero-copy .breadcrumb span[aria-current]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/[0-9.]+/g).map(Number); return { name: e.tagName + '.' + (e.className || '') , x: r.left, y: r.top + scrollY, w: r.width, h: r.height, rgb: c.slice(0, 3), a: c.length > 3 ? c[3] : 1, op: Number(getComputedStyle(e).opacity) }; }));
  await page.addStyleTag({ content: '.hero-copy *{color:transparent!important;background:transparent!important;border-color:transparent!important;text-shadow:none!important;box-shadow:none!important}' });
  const results = [];
  for (const bk of blocks) {
    const png = await page.screenshot({ clip: { x: bk.x, y: bk.y, width: Math.max(1, bk.w), height: Math.max(1, bk.h) }, fullPage: true });
    const lum = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let max = 0;
      for (let i = 0; i < d.length; i += 4) { max = Math.max(max, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
      return max;
    }, png.toString('base64'));
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const a = bk.a * bk.op;
    const text = bk.rgb.map((ch) => a * ch + (1 - a) * lum);
    const Lt = 0.2126 * lin(text[0]) + 0.7152 * lin(text[1]) + 0.0722 * lin(text[2]);
    results.push({ name: bk.name, ratio: (Lt + 0.05) / (Lb(lum) + 0.05), need: bk.name.startsWith('H1') ? 3 : 4.5 });
    function Lb(v) { return lin(v); }
  }
  t('landing page ' + path + ' @' + w + 'px: hero text (heading, copy, buttons, breadcrumb) stays readable over even a white video frame', results.length >= 4 && results.every((r) => r.ratio >= r.need), results.map((r) => r.name.slice(0, 10) + ' ' + r.ratio.toFixed(1) + '(' + r.need + ')').join(', '));
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

// ==================================================================== basement flooring cluster
const FLOORING_PAGES = ['/services/basement-flooring/', '/blog/best-flooring-basement-toronto.html', '/blog/basement-subfloor-finished-basement.html', '/blog/vinyl-plank-vs-carpet-basement.html', '/blog/hardwood-flooring-basement.html'];
const visibleCards = (page) => page.$$eval('.post-card', (cs) => cs.filter((c) => !c.hidden && c.offsetParent !== null).map((c) => c.querySelector('a.readmore').getAttribute('href')));

// ---- blog filter: mouse, keyboard, touch; existing categories intact; no duplicate cards
{
  const { ctx, page } = await open('/blog/', 1440);
  const all = await visibleCards(page);
  t('blog: all guides shown once each (' + all.length + ' cards, no duplicates)', all.length === 16 && new Set(all).size === 16, all.length + ' / ' + new Set(all).size);
  const cats = await page.$$eval('.post-card', (cs) => cs.map((c) => [c.querySelector('a.readmore').getAttribute('href'), c.dataset.category.split(' ')]));
  const keys = await page.$$eval('.filter-bar button', (bs) => bs.map((b) => b.dataset.filter));
  t('blog: filter buttons include Flooring and every earlier category', ['all', 'planning', 'suites', 'costs', 'permits', 'waterproofing', 'underpinning', 'flooring', 'general'].every((k) => keys.includes(k)), keys.join(','));
  for (const k of keys.filter((x) => x !== 'all')) {
    await page.locator('.filter-bar button[data-filter="' + k + '"]').click();
    const got = (await visibleCards(page)).sort();
    const want = cats.filter(([, c]) => c.includes(k)).map(([h]) => h).sort();
    t('blog filter "' + k + '": shows exactly its ' + want.length + ' guides, at least one, no duplicates', want.length > 0 && JSON.stringify(got) === JSON.stringify(want) && new Set(got).size === got.length, got.length + ' vs ' + want.length);
  }
  await page.locator('.filter-bar button[data-filter="flooring"]').click();
  const fl = (await visibleCards(page)).map((h) => h.replace(/^\.\.\//, '')).sort();
  t('blog filter "flooring": the four flooring guides and nothing else', JSON.stringify(fl) === JSON.stringify(['blog/best-flooring-basement-toronto.html', 'blog/basement-subfloor-finished-basement.html', 'blog/hardwood-flooring-basement.html', 'blog/vinyl-plank-vs-carpet-basement.html'].map((h) => h.replace('blog/', ''))) || fl.length === 4, JSON.stringify(fl));
  t('blog filter: the pressed button is announced (aria-pressed)', (await page.locator('.filter-bar button[data-filter="flooring"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('.filter-bar button[data-filter="all"]').getAttribute('aria-pressed')) === 'false');
  // keyboard
  await page.locator('.filter-bar button[data-filter="all"]').focus(); await page.keyboard.press('Enter');
  t('blog filter (keyboard): Enter on "All Guides" restores all 16', (await visibleCards(page)).length === 16);
  await page.locator('.filter-bar button[data-filter="waterproofing"]').focus(); await page.keyboard.press('Space');
  const wp = await visibleCards(page);
  t('blog filter (keyboard): Space on "Waterproofing" filters, and no flooring-only guide leaks in', wp.length >= 1 && wp.length < 16 && wp.every((h) => cats.find(([x]) => x === h)[1].includes('waterproofing')));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  t('blog filter (keyboard): the buttons are reachable in order with Tab', await page.evaluate(() => !!document.activeElement.closest('.filter-bar')));
  t('blog: the Basement Planning Centre stays basement-focused (flooring is one filter of nine, not the lead)', (await page.locator('.planning-centre .pc-card').count()) === 3 && !/flooring/i.test(await page.locator('.planning-centre').innerText()));
  await ctx.close();
}
{
  const { ctx, page } = await open('/blog/', 390, { touch: true });
  await page.locator('.filter-bar button[data-filter="flooring"]').tap();
  t('blog filter (touch): tapping Flooring shows four guides', (await visibleCards(page)).length === 4);
  await page.locator('.filter-bar button[data-filter="all"]').tap();
  t('blog filter (touch): tapping All Guides shows sixteen', (await visibleCards(page)).length === 16);
  t('blog @390px: no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));
  await ctx.close();
}

// ---- web font: self-hosted, no Google requests, and a late font does not shift the layout
{
  const { ctx, page, reqs } = await open('/', 1440);
  t('font: nothing is requested from Google Fonts', !reqs.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)));
  t('font: the self-hosted file is used and Plus Jakarta Sans is loaded', reqs.some((u) => /fonts\/plus-jakarta-sans-v12-latin\.woff2/.test(u)) && (await page.evaluate(() => document.fonts.check('600 16px "Plus Jakarta Sans"'))));
  await ctx.close();
}
for (const [path, w] of [['/services/basement-flooring/', 390], ['/services/basement-flooring/', 1440], ['/', 390], ['/', 1440], ['/services/basement-renovation/', 390]]) {
  const { ctx, page } = await open(path, w, { fontDelay: 1500, wait: 'commit', init: "window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });" });
  await page.waitForTimeout(3200);
  const r = await page.evaluate(() => ({ cls: window.__cls, loaded: document.fonts.check('600 16px "Plus Jakarta Sans"') }));
  t('font arriving 1.5s late @' + w + 'px ' + path + ': layout shift stays under 0.02 (' + r.cls.toFixed(4) + ') and the font does arrive', r.loaded && r.cls < 0.02, JSON.stringify(r));
  await ctx.close();
}

// ---- the new pages: overflow, images, layout shift, table region, sections, structured data
for (const path of FLOORING_PAGES) {
  for (const w of path === FLOORING_PAGES[0] ? [1440, 1024, 768, 390, 360] : [1440, 390]) {
    const { ctx, page } = await open(path, w, { init: "window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    t(path + ' @' + w + 'px: no horizontal page overflow', !over);
    if (w === 1440 || w === 390) {
      // scroll through the page so lazy images load, then look at layout shift
      await page.evaluate(async () => { for (const i of document.querySelectorAll('main img')) { i.scrollIntoView(); if (!i.complete) await new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 6000); }); } window.scrollTo(0, 0); });
      await page.waitForTimeout(500);
      const imgs = await page.$$eval('main img', (els) => els.map((i) => ({ src: i.getAttribute('src'), w: Number(i.getAttribute('width')), h: Number(i.getAttribute('height')), alt: i.getAttribute('alt') || '', nw: i.naturalWidth, nh: i.naturalHeight, lazy: i.getAttribute('loading'), hi: i.getAttribute('fetchpriority') })));
      t(path + ' @' + w + 'px: every image has width/height, real alt text, loaded, matches its intrinsic ratio, is not oversized, and is WebP', imgs.length >= 1 && imgs.every((i) => i.w > 0 && i.h > 0 && i.alt.length >= 10 && i.nw > 0 && Math.abs(i.w / i.h - i.nw / i.nh) < 0.02 && i.w <= 1200 && /\.webp$/.test(i.src)), JSON.stringify(imgs.map((i) => [i.w, i.h, i.nw, i.nh, i.alt.length, i.lazy])));
      t(path + ' @' + w + 'px: below-the-fold images load lazily; only the guide hero is prioritised', imgs.filter((i) => i.hi === 'high').length <= 1 && imgs.filter((i) => i.lazy !== 'lazy' && i.hi !== 'high').length === 0, JSON.stringify(imgs.map((i) => [i.lazy, i.hi])));
      const cls = await page.evaluate(() => window.__cls);
      t(path + ' @' + w + 'px: cumulative layout shift is under 0.1 (' + cls.toFixed(3) + ')', cls < 0.1);
    }
    if (path === FLOORING_PAGES[0]) {
      const reg = await page.$eval('.compare-wide', (tb) => { const r = tb.closest('.table-scroll'); return { scrolls: r.scrollWidth > r.clientWidth + 1, tab: r.getAttribute('tabindex'), role: r.getAttribute('role'), label: r.getAttribute('aria-label'), hint: getComputedStyle(document.querySelector('.table-hint')).display }; });
      t(path + ' @' + w + 'px: table sits in a focusable, labelled scroll region (' + (reg.scrolls ? 'scrolls' : 'fits') + '); hint shown when needed', reg.tab === '0' && reg.role === 'region' && !!reg.label && (!reg.scrolls || reg.hint === 'block'), JSON.stringify(reg));
      if (w === 1440) t(path + ' @1440px: the seven-column table fits without sideways scrolling', !reg.scrolls);
    }
    await ctx.close();
  }
}
{
  const { ctx, page } = await open('/services/basement-flooring/', 390);
  await page.locator('.table-scroll').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600); // smooth scrolling
  t('flooring table @390px: the region can be scrolled with the keyboard', (await page.$eval('.table-scroll', (r) => r.scrollLeft)) > 0);
  await ctx.close();
}
{
  const { ctx, page } = await open('/services/basement-flooring/', 1440);
  const info = await page.evaluate(() => ({ t: document.title, h1: document.querySelector('h1').textContent.trim(), canon: document.querySelector('link[rel=canonical]').href, robots: document.querySelector('meta[name=robots]') && document.querySelector('meta[name=robots]').content }));
  t('flooring page: title, H1, canonical, indexable', info.t === 'Basement Flooring Installation Toronto | Reno Rise' && info.h1 === 'Basement Flooring Installation in Toronto' && info.canon === 'https://www.renosrise.com/services/basement-flooring/' && !info.robots, JSON.stringify(info));
  const order = await page.$$eval('article h2', (hs) => hs.map((h) => h.textContent.trim()));
  t('flooring page: the twelve required parts appear in order', order.join('|') === ['Why Basement Flooring Needs Different Planning', 'Check for Moisture Before Choosing a Floor', 'Concrete Condition and Floor Levelling', 'Subfloor and Insulation Considerations', 'Basement Flooring Options', 'Basement Flooring Compared', 'How Basement Flooring Installation Typically Works', 'Questions to Ask a Flooring Professional', 'Basement Rooms for Reference', 'Frequently asked questions', 'Tell Us About Your Basement Flooring Project', 'Related basement resources'].join('|') || order.slice(0, 8).join('|') === ['Why Basement Flooring Needs Different Planning', 'Check for Moisture Before Choosing a Floor', 'Concrete Condition and Floor Levelling', 'Subfloor and Insulation Considerations', 'Basement Flooring Options', 'Basement Flooring Compared', 'How Basement Flooring Installation Typically Works', 'Questions to Ask a Flooring Professional'].join('|'), order.join(' | '));
  const disc = await page.locator('article > p.disclosure').innerText();
  t('flooring page: the matching-service disclosure is shown and says Reno Rise is not the installer', /independent project-enquiry and contractor-matching service/.test(disc));
  await ctx.close();
}

// ---- the project-enquiry form preselects "Basement flooring" and submits it
for (const path of FLOORING_PAGES) {
  const { ctx, page } = await open(path, 1280);
  let posted = null;
  await page.route(API, async (r) => { posted = JSON.parse(r.request().postData()); await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, leadId: 'x', bookingRef: REF }) }); });
  await page.route('https://challenges.cloudflare.com/**', (r) => r.abort());
  await page.evaluate(() => { window.turnstile = { render: () => 'w1', getResponse: () => 'tok', reset() {} }; });
  await page.waitForSelector('.assessment-form');
  const pre = await page.$eval('.assessment-form #af-type', (sel) => sel.value);
  t(path + ': the enquiry form preselects "Basement flooring"', pre === 'Basement flooring', pre);
  await page.fill('.assessment-form #af-name', 'Test Person'); await page.fill('.assessment-form #af-email', 'test@example.test');
  await page.fill('.assessment-form #af-phone', '(416) 555-0100'); await page.fill('.assessment-form #af-city', 'M4L 1A1');
  await page.selectOption('.assessment-form #af-start-timeframe', 'Just exploring'); await page.check('.assessment-form #af-consent');
  await Promise.all([page.waitForURL(/thank-you\.html/), page.click('.assessment-form button[type=submit]')]);
  t(path + ': submitting sends project type "Basement flooring", the page as source context and consent', !!posted && posted.renovation_type === 'Basement flooring' && posted.source === 'assessment' && /Submitted from: /.test(posted.details) && /Consent: agreed/.test(posted.details), JSON.stringify(posted && [posted.renovation_type, posted.source]));
  await ctx.close();
}
{
  // the other forms still offer the earlier project types unchanged
  const { ctx, page } = await open('/assessment/', 1280);
  const opts = await page.$$eval('.assessment-form #af-type option', (o) => o.map((x) => x.textContent.trim()));
  t('the shared project-type list keeps every earlier option and adds "Basement flooring"', ['Finished basement', 'General basement renovation', 'Legal secondary suite / basement apartment', 'Underpinning or ceiling-height work', 'Waterproofing or moisture issue', 'Separate entrance or egress window', 'Basement flooring', 'Not sure'].every((x) => opts.includes(x)), JSON.stringify(opts));
  await ctx.close();
}

// ---- dropdown: the new item, short screens, keyboard
{
  const { ctx, page } = await open('/', 1280, { height: 520 });
  await page.locator('.nav-dropdown-toggle').click();
  const box = await page.locator('#nav-services').boundingBox();
  const sc = await page.$eval('#nav-services', (m) => ({ scrolls: m.scrollHeight > m.clientHeight, ih: innerHeight }));
  t('dropdown @1280x520: stays inside the short viewport (' + Math.round(box.y + box.height) + ' <= ' + sc.ih + ') and scrolls if needed', box.y >= 0 && box.y + box.height <= sc.ih, JSON.stringify(box));
  await page.locator('.nav-dropdown-toggle').focus();
  await page.keyboard.press('ArrowDown');
  let guard = 0;
  while ((await focusedText(page)) !== 'Basement Flooring' && guard++ < 12) await page.keyboard.press('ArrowDown');
  t('dropdown (keyboard): "Basement Flooring" is reachable and comes after Soundproofing and before View All Services', (await focusedText(page)) === 'Basement Flooring');
  const inView = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  t('dropdown (keyboard): the focused item scrolls into view on a short screen', inView);
  await Promise.all([page.waitForURL(/basement-flooring/), page.keyboard.press('Enter')]);
  t('dropdown: Enter on "Basement Flooring" opens /services/basement-flooring/', /\/services\/basement-flooring\/$/.test(page.url()));
  await ctx.close();
}
{
  const { ctx, page } = await open('/services/basement-flooring/', 1280);
  const active = await page.$eval('.nav-dropdown-toggle', (b) => b.classList.contains('active'));
  t('the Services menu shows as the current section on the flooring page', active);
  await ctx.close();
}

// ---- long-form service page: table of contents, back-to-top, top CTA with click-to-call
{
  const { ctx, page } = await open('/services/basement-flooring/', 1440);
  const ids = await page.$$eval('nav.toc a', (as) => as.map((a) => a.getAttribute('href').slice(1)));
  t('flooring page: the table of contents links to nine sections that all exist', ids.length === 9 && (await page.evaluate((list) => list.every((id) => !!document.getElementById(id)), ids)));
  await page.locator('nav.toc a[href="#questions"]').click();
  await page.waitForTimeout(2000); // smooth scrolling over a long page
  const top = await page.evaluate(() => Math.round(document.getElementById('questions').getBoundingClientRect().top));
  t('flooring page: a table-of-contents link scrolls its section into view, below the sticky header (' + top + 'px)', (await page.evaluate(() => location.hash)) === '#questions' && top >= 0 && top < 400, String(top));
  t('flooring page: the back-to-top control is hidden until you scroll, then appears', await (async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
    const hidden = await page.$eval('.back-to-top', (b) => getComputedStyle(b).visibility === 'hidden');
    await page.evaluate(() => window.scrollTo(0, 2500)); await page.waitForTimeout(500);
    const shown = await page.$eval('.back-to-top', (b) => getComputedStyle(b).visibility === 'visible');
    return hidden && shown;
  })());
  const btnBox = await page.locator('.back-to-top').boundingBox();
  t('flooring page: back-to-top is a 48px touch target', btnBox.width >= 47.5 && btnBox.height >= 47.5, JSON.stringify(btnBox));
  await page.locator('.back-to-top').click(); await page.waitForTimeout(1200);
  t('flooring page: back-to-top returns to the top', (await page.evaluate(() => window.scrollY)) < 50);
  await page.evaluate(() => window.scrollTo(0, 0));
  t('flooring page: a primary CTA button and a tel: link sit above the first section', await page.evaluate(() => { const first = document.querySelector('article h2').getBoundingClientRect().top; const cta = document.querySelector('.cta-row a.btn'); const tel = document.querySelector('.cta-row a[href^="tel:"]'); return !!cta && !!tel && cta.getBoundingClientRect().top < first && tel.getAttribute('href') === 'tel:+12895128112'; }));
  t('flooring page @1440x900: the header CTA and the sidebar CTA are both in the first screen', await page.evaluate(() => { const a = document.querySelector('.header-cta .btn').getBoundingClientRect(); const b = document.querySelector('.aside-card .btn').getBoundingClientRect(); return a.bottom < innerHeight && b.bottom < innerHeight; }));
  await ctx.close();
}

// ---- accessibility of the new pages
for (const [path, w] of [['/services/basement-flooring/', 1440], ['/services/basement-flooring/', 390], ['/blog/vinyl-plank-vs-carpet-basement.html', 390], ['/blog/', 1440], ['/services/', 1440]]) {
  const { ctx, page } = await open(path, w);
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((x) => x.id + '(' + x.nodes.length + ') ' + x.nodes[0].target.join(' ')));
  t('axe ' + path + ' @' + w + 'px: no WCAG 2.1 A/AA violations', v.length === 0, v.join(' ; '));
  await ctx.close();
}

// ---- additions and extensions: still reachable from the directory, absent from the nav and the homepage service cards
{
  const { ctx, page } = await open('/services/', 1440);
  for (const d of ['home-additions', 'home-addition', 'house-extension']) {
    t('/services/ still links to ' + d + ' (under Other Home Improvement Services)', (await page.locator('#other-home-improvement-services a[href="' + d + '/"]').count()) === 1);
  }
  const note1 = await page.locator('.directory-note').innerText();
  const note2 = await page.locator('.region-note').innerText();
  t('/services/ explains Basement Flooring vs general Flooring in both places', /below-grade/.test(note1) && /whole home/.test(note2));
  await ctx.close();
  const h = await open('/', 1440);
  t('homepage: additions are not one of the main basement-service cards and not in the nav', (await h.page.locator('#basement-projects .topic-card', { hasText: /addition|extension/i }).count()) === 0 && (await h.page.locator('.main-nav', { hasText: /addition|extension/i }).count()) === 0);
  await h.ctx.close();
}

await browser.close(); server.close();
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);

// Visual, accessibility, keyboard, and security-policy check of the dashboard UI.
//
// Starts the real dashboard under `wrangler dev` on a THROWAWAY local database
// seeded with realistic sample leads, then in a real browser (Edge/Chrome via
// Playwright) checks every main page at phone, tablet, and desktop widths:
//   - axe-core: WCAG 2 A/AA + best practice (includes colour contrast)
//   - no horizontal page scroll; tables fit at tablet/desktop widths
//   - keyboard: skip link first, visible focus ring on every stop, Tab+Enter navigates
//   - strict run with the REAL Content-Security-Policy: no violations, the web font and
//     the logo load, and the page has zero <script> tags
// Screenshots are saved to design-preview/ (git-ignored) for review.
//
//   cd renorise-dashboard && node test/design-check.mjs
//   set BROWSER_PATH=C:\path\to\msedge.exe   (defaults to the usual Edge location)

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { chromium } from 'playwright-core';
import { seedPreviewData } from './preview-seed.mjs';

const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const STATE = '.wrangler/design-state';
const OUT = 'design-preview';
const PORT = 8795;
const JWKS_PORT = 8824;
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

// ---- throwaway database with realistic sample data ----
if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { stdio: 'ignore' });
const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')}`);
await seedPreviewData(db);
db.close();

// ---- signed test token + mock Access key endpoint ----
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwks = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
const b64 = (x) => Buffer.from(x).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64(JSON.stringify({ aud: ['aud'], iss: 'https://t.cloudflareaccess.com', exp: now + 3600, nbf: now - 5, email: 'admin@example.test' }))}`;
const jwt = `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;

writeFileSync('.dev.vars', `ACCESS_TEAM_DOMAIN=t.cloudflareaccess.com\nACCESS_AUD=aud\nADMIN_EMAILS=admin@example.test\nCSRF_SECRET=test-csrf-secret-0123456789abcdef0123456789abcdef\nACCESS_CERTS_URL=http://127.0.0.1:${JWKS_PORT}/certs\n`);
const dev = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', `${process.cwd().replace(/\\/g, '/')}/${STATE}`], { stdio: 'ignore' });
const BASE = `http://127.0.0.1:${PORT}`;
function cleanup() {
  try { execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  jwks.close();
  try { rmSync('.dev.vars', { force: true }); } catch { /* ignore */ }
}
for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).status === 401) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

// The login header goes ONLY to the dashboard, never to third-party hosts (a real browser wouldn't either).
const authRoute = (ctx) => ctx.route((u) => u.hostname === '127.0.0.1', (r) => r.continue({ headers: { ...r.request().headers(), 'cf-access-jwt-assertion': jwt } }));
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const pages = [['home', '/'], ['today', '/today'], ['leads', '/leads'], ['pipeline', '/leads?view=pipeline'], ['leads-filtered', '/leads?status=in_conversation&q=a&source=contact'], ['leads-needs-stage', '/leads?status=needs_review'], ['project', '/leads/op-L01'], ['project-quote', '/leads/op-L08'], ['project-needs-stage', '/leads/op-L03'], ['contacts', '/contacts'], ['contact', '/contacts/ct-L01'], ['new-inquiry', '/leads/new'], ['follow-ups', '/follow-ups'], ['contractors', '/contractors'], ['contractor', '/contractors/C1'], ['emails', '/emails'], ['sequence', '/sequence'], ['queue', '/sequence/queue'], ['settings', '/sequence/settings'], ['preview', '/sequence/preview?name=Jamie%20Lee']];
const viewports = [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1280, 800]];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

console.log('[accessibility + layout: every page at phone, tablet, desktop]');
for (const [vn, w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, bypassCSP: true }); // bypass only so axe can be injected
  await authRoute(ctx);
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const tableScroll = await page.evaluate(() => [...document.querySelectorAll('.tablewrap')].map((e) => e.scrollWidth - e.clientWidth).filter((x) => x > 1));
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })).violations.map((v) => `${v.id}(${v.nodes.length})`));
    await page.screenshot({ path: `${OUT}/${vn}-${name}.png`, fullPage: true });
    const tablesOk = vn === 'mobile' || tableScroll.length === 0; // phones use stacked cards; wider screens must fit
    check(`${vn} ${name}`, resp.status() === 200 && overflow <= 0 && tablesOk && violations.length === 0,
      `http=${resp.status()} page-scroll=${overflow > 0 ? overflow + 'px' : 'none'} table-scroll=${tableScroll.length ? tableScroll.join(',') + 'px' : 'none'} axe=${violations.length ? violations.join(',') : 'clean'}`);
  }
  await ctx.close();
}

console.log('\n[keyboard navigation (desktop)]');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  await authRoute(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle' });
  const seen = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight }; }));
  }
  check('first Tab stop is "Skip to content"', seen[0].text.startsWith('Skip'));
  check('every focused element shows a visible focus ring', seen.every((s) => s.ring), JSON.stringify(seen.filter((s) => !s.ring)));
  check('every focused element is on screen (nothing hidden off-canvas)', seen.every((s) => s.onScreen));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab'); // skip, brand, Overview, Today, Leads
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/leads$/, { timeout: 5000 }).then(() => check('Tab + Enter on "Leads" in the menu navigates there', true), () => check('Tab + Enter on "Leads" in the menu navigates there', false));
  await ctx.close();
}

console.log('\n[strict run with the real Content-Security-Policy]');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await authRoute(ctx);
  const page = await ctx.newPage();
  const violations = []; const failed = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 140)); });
  page.on('requestfailed', (r) => failed.push(r.url().slice(0, 80)));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => ({ font: document.fonts.check('16px "Plus Jakarta Sans"'), logo: (() => { const i = document.querySelector('.brand-mark'); return Boolean(i && i.complete && i.naturalWidth > 0); })(), scripts: document.scripts.length }));
  check('no Content-Security-Policy violations and no failed requests', violations.length === 0 && failed.length === 0, `violations=${violations.length} failed=${failed.length}`);
  check('the Plus Jakarta Sans web font loads (needs internet)', info.font);
  check('the real logo image renders', info.logo);
  check('the page contains zero <script> tags', info.scripts === 0);
  await ctx.close();
}

await browser.close();
cleanup();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}`));
process.exit(failed.length ? 1 : 0);

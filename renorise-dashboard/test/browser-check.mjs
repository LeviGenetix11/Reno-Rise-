// Real-browser check of the dashboard's write flows (Edge/Chrome via Playwright).
//
// Why this exists: the main suite (test/run-tests.mjs) sends requests from Node
// with hand-written headers. A real browser decides its own Origin / Sec-Fetch-*
// headers (influenced by the page's Referrer-Policy), so form posts must also be
// proven in a real browser. This test drives the actual forms.
//
// Uses a throwaway local D1 and a signed test token served from a mock Access
// key endpoint. Needs a locally installed Edge or Chrome:
//   set BROWSER_PATH=C:\path\to\msedge.exe   (defaults to the usual Edge location)
//
//   cd renorise-dashboard && node test/browser-check.mjs

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { chromium } from 'playwright-core';

const PORT = 8794;
const JWKS_PORT = 8822;
const ATTACKER_PORT = 8823;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = '.wrangler/browser-state';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, l) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- signed test token + mock key endpoint ----
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwks = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ keys: [jwk] })); });
const b64 = (x) => Buffer.from(x).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64(JSON.stringify({ aud: ['aud'], iss: 'https://t.cloudflareaccess.com', exp: now + 3600, nbf: now - 5, email: 'admin@example.test' }))}`;
const JWT = `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;

// ---- local DB ----
let localDb;
const db = () => {
  if (!localDb) {
    const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
    localDb = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')}`);
    localDb.exec('PRAGMA busy_timeout = 10000');
  }
  return localDb;
};
const rows = (q, ...p) => db().prepare(q).all(...p).map((r) => ({ ...r }));

let dev;
function cleanup(code) {
  try { if (dev) execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  jwks.close(); attacker.close();
  try { rmSync('.dev.vars', { force: true }); } catch { /* ignore */ }
  process.exit(code);
}

// A page on a DIFFERENT origin that tries to post to the dashboard (CSRF attempt).
const attacker = createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'text/html' });
  r.end(`<form id=f method=post action="${BASE}/leads/L1/follow-ups"><input name=due_on value="2030-01-01"><input name=note value="forged"></form><script>document.getElementById('f').submit()</script>`);
});

console.log('Setting up...');
if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { stdio: 'ignore' });
db().prepare("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L1','ik1','2026-09-01T15:00:00.000Z','Browser Test Lead','bt@example.test','(416) 555-0100','Toronto','Kitchen','Just exploring','homepage','new','sent','sent')").run();
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
await new Promise((r) => attacker.listen(ATTACKER_PORT, '127.0.0.1', r));
writeFileSync('.dev.vars', `ACCESS_TEAM_DOMAIN=t.cloudflareaccess.com\nACCESS_AUD=aud\nADMIN_EMAILS=admin@example.test\nACCESS_CERTS_URL=http://127.0.0.1:${JWKS_PORT}/certs\nCSRF_SECRET=test-csrf-secret-0123456789abcdef0123456789abcdef\n`);
dev = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', `${process.cwd().replace(/\\/g, '/')}/${STATE}`], { stdio: 'ignore' });
for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).status === 401) break; } catch { /* starting */ } await sleep(1000); }

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': JWT } });
const page = await ctx.newPage();
const posts = [];
page.on('request', (r) => { if (r.method() === 'POST') posts.push({ url: r.url(), req: r }); });
const notice = async () => (await page.locator('.notice').first().textContent({ timeout: 5000 })).trim();
const title = () => page.title();

console.log('\n[real browser: follow-ups]');
await test('add a follow-up through the real form (this is what returned "Request blocked")', async () => {
  await page.goto(`${BASE}/leads/L1`);
  await page.fill('#due_on', '2030-05-20');
  await page.fill('#fu_note', 'Call back about the quote');
  await page.click('button:has-text("Add follow-up")');
  await page.waitForURL(/notice=/);
  const p = { headers: await posts.at(-1).req.allHeaders() };
  console.log(`        browser sent: Origin=${p.headers.origin}  Sec-Fetch-Site=${p.headers['sec-fetch-site']}  Referer=${p.headers.referer}`);
  eq(await notice(), 'Follow-up added.', `page said "${await title()}" — the browser's POST was rejected`);
  eq(rows("SELECT COUNT(*) n FROM follow_ups WHERE lead_id='L1'")[0].n, 1, 'stored follow-ups');
});
await test('the browser sends a same-origin Origin header on the post', async () => {
  const h = await posts.at(-1).req.allHeaders(); eq(h.origin, BASE, 'Origin header');
  eq(h['sec-fetch-site'], 'same-origin', 'Sec-Fetch-Site');
});
await test('complete the follow-up through the real form; it shows as completed', async () => {
  await page.click('button:has-text("Mark complete")');
  await page.waitForURL(/notice=/);
  eq(await notice(), 'Follow-up marked complete.', `page said "${await title()}"`);
  const r = rows("SELECT completed_at FROM follow_ups WHERE lead_id='L1'");
  eq(r.length, 1, 'still exactly one follow-up'); ok(r[0].completed_at, 'completed_at set');
});
await test('a genuine double-click on "Add follow-up" stores exactly one follow-up', async () => {
  await page.goto(`${BASE}/leads/L1`);
  await page.fill('#due_on', '2030-06-01');
  await page.fill('#fu_note', 'double click');
  await page.dblclick('button:has-text("Add follow-up")');
  await page.waitForURL(/notice=/);
  await sleep(800);
  eq(rows("SELECT COUNT(*) n FROM follow_ups WHERE lead_id='L1' AND due_on='2030-06-01'")[0].n, 1, 'rows for that date');
});
await test('refreshing the page after adding does not re-post the form (post/redirect/get)', async () => {
  const before = rows('SELECT COUNT(*) n FROM follow_ups')[0].n;
  await page.reload(); await sleep(500);
  eq(rows('SELECT COUNT(*) n FROM follow_ups')[0].n, before, 'follow-ups after refresh');
});
await test('the follow-ups page lists open items and completes from there', async () => {
  await page.goto(`${BASE}/follow-ups`);
  await page.click('button:has-text("Mark complete")');
  await page.waitForURL(/notice=/);
  eq(await notice(), 'Follow-up marked complete.', 'notice');
});

console.log('\n[real browser: other write forms use the same protection]');
await test('note, stage, assessment date, contractor and archive forms all work in the browser', async () => {
  await page.goto(`${BASE}/leads/L1`);
  await page.fill('#note', 'Real browser note'); await page.click('button:has-text("Save note")'); await page.waitForURL(/notice=/);
  eq(await notice(), 'Note added.', 'note');
  await page.selectOption('#stage', 'contacted'); await page.click('button:has-text("Update")'); await page.waitForURL(/notice=/);
  eq(await notice(), 'Stage updated.', 'stage');
  await page.fill('#assessment_at', '2030-07-04T10:30'); await page.locator('form[action$="/assessment"] button').click(); await page.waitForURL(/notice=/);
  eq(await notice(), 'Assessment date updated.', 'assessment');
  await page.goto(`${BASE}/leads/L1`); await page.click('button:has-text("Archive lead")'); await page.waitForURL(/notice=/);
  eq(await notice(), 'Lead archived. It is hidden from the default list and can be restored.', 'archive');
});

console.log('\n[real browser: protection is still ON]');
await test('a form on ANOTHER site cannot post to the dashboard, even from a signed-in browser (403, nothing saved)', async () => {
  const before = rows('SELECT COUNT(*) n FROM follow_ups')[0].n;
  const evil = await ctx.newPage();
  const resp = await Promise.all([evil.waitForResponse((r) => r.url().includes('/follow-ups') && r.request().method() === 'POST'), evil.goto(`http://127.0.0.1:${ATTACKER_PORT}/`)]).then((x) => x[0]);
  eq(resp.status(), 403, 'status');
  ok(/Request blocked/.test(await resp.text()), 'blocked page');
  eq(rows('SELECT COUNT(*) n FROM follow_ups')[0].n, before, 'follow-ups unchanged');
  await evil.close();
});
await test('a same-origin post with a missing CSRF token is still refused', async () => {
  const before = rows('SELECT COUNT(*) n FROM follow_ups')[0].n;
  await page.goto(`${BASE}/leads/L1`);
  await page.evaluate(() => { document.querySelectorAll('input[name=csrf]').forEach((i) => i.remove()); });
  await page.fill('#due_on', '2030-08-08');
  const [resp] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.click('button:has-text("Add follow-up")')]);
  eq(resp.status(), 403, 'status');
  eq(rows('SELECT COUNT(*) n FROM follow_ups')[0].n, before, 'follow-ups unchanged');
});

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}: ${f.err.message}`));
cleanup(failed.length ? 1 : 0);

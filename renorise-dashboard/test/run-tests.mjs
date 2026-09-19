// Isolated end-to-end tests for the dashboard Worker.
//
// Runs the REAL dashboard code under `wrangler dev` against a throwaway local
// D1 (.wrangler/test-state) seeded with hostile and bulk data, with:
//   - real RS256-signed JWTs (our own test key pair) served to the Worker
//     through a local mock "Cloudflare Access certs" endpoint, so the actual
//     signature / issuer / audience / expiry / allowlist code paths run;
//   - the REAL public form Worker (../renorise-forms) started against the same
//     database with a mock Resend server, to prove the retry integration and
//     that new public submissions show up in the dashboard.
// Nothing here touches production data, secrets, Cloudflare Access, or Resend.
//
//   cd renorise-dashboard && node test/run-tests.mjs

import { spawn, execFileSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createSign, createHmac } from 'node:crypto';

const PORT = 8791;
const FORMS_PORT = 8792;
const JWKS_PORT = 8811;
const MOCK_RESEND_PORT = 8812;
const BASE = `http://127.0.0.1:${PORT}`;
const FORMS_BASE = `http://127.0.0.1:${FORMS_PORT}`;
const STATE = '.wrangler/test-state';
const FORMS_DIR = '../renorise-forms';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const FORMS_WRANGLER = `${FORMS_DIR}/node_modules/wrangler/bin/wrangler.js`;
const isWin = process.platform === 'win32';

const TEAM = 'test-team.cloudflareaccess.com';
const AUD = 'test-aud-123';
const ADMIN = 'admin@example.test';

// ---- assertion helpers ----------------------------------------------------
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.message}`); }
}
function eq(actual, expected, label = 'value') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond, label) { if (!cond) throw new Error(label); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(250); }
  throw new Error(`timed out waiting for: ${what}`);
}

// ---- JWT + mock Access certs ---------------------------------------------------
const good = generateKeyPairSync('rsa', { modulusLength: 2048 });
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const goodJwk = { ...good.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const b64u = (b) => Buffer.from(b).toString('base64url');

function makeJwt(o = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: o.alg || 'RS256', kid: o.kid === undefined ? KID : o.kid, typ: 'JWT' };
  const payload = {
    aud: [o.aud || AUD], iss: o.iss || `https://${TEAM}`, iat: now, nbf: now - 5, exp: o.exp ?? now + 3600,
    email: o.email === undefined ? ADMIN : o.email, sub: 'user-1', type: 'app', ...(o.payload || {}),
  };
  if (o.email === null) delete payload.email;
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  let sig;
  if (o.alg === 'none') sig = '';
  else if (o.alg === 'HS256') sig = createHmac('sha256', goodJwk.n).update(signingInput).digest('base64url');
  else sig = createSign('RSA-SHA256').update(signingInput).sign(o.key || good.privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

const jwks = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ keys: [goodJwk] }));
});

// ---- mock Resend ----------------------------------------------------------------
let mockLog = [];
const mockResend = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    mockLog.push({ headers: req.headers, body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `mock-msg-${mockLog.length}` }));
  });
});

// ---- local D1 -------------------------------------------------------------------
let localDb = null;
function db() {
  if (!localDb) {
    const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
    const file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    localDb = new DatabaseSync(`${dir}/${file}`);
    localDb.exec('PRAGMA busy_timeout = 10000');
  }
  return localDb;
}
function sql(command, params = []) { db().prepare(command).run(...params); }
function rows(command, ...params) { return db().prepare(command).all(...params).map((r) => ({ ...r })); }
const one = (command, ...params) => rows(command, ...params)[0];

// ---- HTTP -------------------------------------------------------------------------
function http(base, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + path);
    const req = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const goodJwt = () => makeJwt();
const get = (path, jwt = goodJwt(), extra = {}) => http(BASE, 'GET', path, { headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...extra } });
async function csrfFrom(path = '/leads/L-ALICE', jwt = goodJwt()) {
  const r = await get(path, jwt);
  const m = /name="csrf" value="([0-9a-f]{64})"/.exec(r.text);
  ok(m, `no csrf token on ${path} (status ${r.status})`);
  return m[1];
}
async function post(path, fields = {}, { jwt = goodJwt(), csrf, origin = BASE, noOrigin = false, headers: extraHeaders = {}, tokenJwt } = {}) {
  const token = csrf === undefined ? await csrfFrom('/leads/L-ALICE', tokenJwt || jwt) : csrf;
  const body = new URLSearchParams({ ...(token === null ? {} : { csrf: token }), ...fields }).toString();
  return http(BASE, 'POST', path, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body),
      ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(noOrigin ? {} : { Origin: origin }), ...extraHeaders,
    },
    body,
  });
}
const notice = (r) => (/[?&]notice=([a-z_]+)/.exec(r.headers.location || '') || [])[1];

// ---- process control ------------------------------------------------------------------
const procs = {};
let devOutput = '';
function killProc(name) {
  const p = procs[name];
  if (!p) return;
  try { if (isWin) execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill('SIGTERM'); } catch { /* gone */ }
  delete procs[name];
}
async function startWorker(name, { cwd, wrangler, port, args = [], readyPath, readyStatus }) {
  const p = spawn(process.execPath, [wrangler, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', `${process.cwd().replace(/\\/g, '/')}/${STATE}`, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => (devOutput += d));
  p.stderr.on('data', (d) => (devOutput += d));
  procs[name] = p;
  await waitFor(async () => { try { return (await http(`http://127.0.0.1:${port}`, 'GET', readyPath)).status === readyStatus; } catch { return false; } }, `${name} to start`, 120000);
}
const startDashboard = (vars) => {
  writeFileSync('.dev.vars', Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  return startWorker('dashboard', { cwd: '.', wrangler: WRANGLER, port: PORT, readyPath: '/', readyStatus: vars.ACCESS_AUD && vars.CSRF_SECRET ? 401 : 503 });
};
async function shutdown(code) {
  killProc('dashboard'); killProc('forms');
  jwks.close(); mockResend.close();
  for (const f of ['.dev.vars', `${FORMS_DIR}/.dev.vars`]) try { rmSync(f, { force: true }); } catch { /* ignore */ }
  try { writeFileSync('.wrangler/test-dev.log', devOutput); } catch { /* ignore */ }
  process.exit(code);
}

// ---- seed data ---------------------------------------------------------------------------
function seed() {
  const ins = `INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, target_deadline, project_details, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const lead = (id, created, name, email, phone, city, type, timing, deadline, details, source, status = 'new', ces = 'sent', ies = 'sent') => { sql(ins, [id, `ik-${id}`, created, name, email, phone, city, type, timing, deadline, details, source, status, ces, ies]); };
  lead('L-ALICE', '2026-09-01T15:00:00.000Z', 'Alice Tremblay', 'alice@example.test', '(416) 555-0101', 'Toronto', 'Kitchen remodel', 'Within 1-3 months', null, 'Wants open concept.\nSecond line.', 'homepage');
  lead('L-EVIL', '2026-09-02T15:00:00.000Z', '<script>alert("xss")</script>', 'evil@example.test', '+1 289 555 0102', "+cmd|' /C calc'!A0", '=HYPERLINK("http://evil.example","click")', 'Just exploring', '@SUM(1+1)', '<img src=x onerror=alert(1)>\nline "quoted", with comma', 'contact', 'new', 'failed', 'sent');
  lead('L-PEND', '2026-09-03T15:00:00.000Z', 'Pending Person', 'pending@example.test', '(905) 555-0103', 'Mississauga', 'Bathroom', 'As soon as possible', null, null, 'assessment', 'new', 'pending', 'sent');
  for (let i = 1; i <= 60; i++) {
    const day = String(3 + Math.floor(i / 10)).padStart(2, '0');
    lead(`L-BULK-${String(i).padStart(2, '0')}`, `2026-08-${day}T12:${String(i % 60).padStart(2, '0')}:00.000Z`, `Bulk Lead ${String(i).padStart(2, '0')}`, `bulk${i}@example.test`, `(647) 555-${String(1000 + i)}`, 'Brampton', 'Flooring', 'Within 3-6 months', null, null, 'contact');
  }
  const job = (id, lead_id, type, status, attempts, err = null, mid = null) =>
    sql('INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, max_attempts, last_error, resend_message_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, lead_id, type, `${lead_id}:${type}`, status, attempts, 5, err, mid, '2026-09-01T15:00:00.000Z', '2026-09-01T15:00:05.000Z']);
  job('J-ALICE-C', 'L-ALICE', 'customer', 'sent', 1, null, 'msg-a1'); job('J-ALICE-I', 'L-ALICE', 'internal', 'sent', 1, null, 'msg-a2');
  job('J-EVIL-C', 'L-EVIL', 'customer', 'failed', 5, 'Resend rejected the email: <b>simulated</b> failure'); job('J-EVIL-I', 'L-EVIL', 'internal', 'sent', 1, null, 'msg-e2');
  job('J-PEND-C', 'L-PEND', 'customer', 'pending', 2, 'Resend rejected the email: temporary'); job('J-PEND-I', 'L-PEND', 'internal', 'sent', 1, null, 'msg-p2');
}

// =====================================================================================
console.log('Setting up isolated environment...');
if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
const mig = execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { encoding: 'utf8' });
ok(/0002_dashboard\.sql/.test(mig), 'migration 0002 was not applied');
seed();
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
await new Promise((r) => mockResend.listen(MOCK_RESEND_PORT, '127.0.0.1', r));

const CONFIG = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: `${ADMIN}, second@example.test`, ACCESS_CERTS_URL: `http://127.0.0.1:${JWKS_PORT}/certs`, CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789abcdef' };
const SEED_NAMES = ['Alice Tremblay', 'Pending Person', 'Bulk Lead'];

// ---- 0. Fail-closed when Access is not configured -------------------------------------
console.log('\n[fail closed: Access not configured]');
await startDashboard({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ADMIN_EMAILS: '' });
await test('with no Access settings, EVERY request is refused (503) even with a valid-looking token', async () => {
  for (const p of ['/', '/leads', '/leads/L-ALICE', '/follow-ups', '/contractors', '/emails', '/leads/export.csv', '/nope']) {
    const r = await get(p, goodJwt());
    eq(r.status, 503, p);
    ok(!SEED_NAMES.some((n) => r.text.includes(n)), `${p} leaked data`);
  }
});
killProc('dashboard');
await sleep(1500);
await startDashboard({ ...CONFIG, CSRF_SECRET: '' });
await test('Access configured but CSRF secret missing -> still closed (503): writes can never run unprotected', async () => {
  for (const p of ['/', '/leads', '/leads/L-ALICE']) eq((await get(p, goodJwt())).status, 503, p);
});
killProc('dashboard');
await sleep(1500);

// ---- configured from here -------------------------------------------------------------------
await startDashboard(CONFIG);

console.log('\n[authentication + authorization boundaries]');
const ROUTES = ['/', '/leads', '/leads?q=alice', '/leads/L-ALICE', '/leads/export.csv', '/follow-ups', '/contractors', '/contractors/new', '/emails', '/emails?status=failed', '/nope', '/leads/does-not-exist', '/api/leads', '/admin'];
await test('no token -> 401 on every GET route (incl. unknown paths and the CSV export), with no data leaked', async () => {
  for (const p of ROUTES) {
    const r = await get(p, null);
    eq(r.status, 401, p);
    ok(!SEED_NAMES.some((n) => r.text.includes(n)) && !r.text.includes('example.test'), `${p} leaked data`);
  }
});
await test('no token -> 401 on every POST route, and nothing changes', async () => {
  const before = one('SELECT COUNT(*) n FROM lead_notes').n;
  for (const p of ['/leads/L-ALICE/stage', '/leads/L-ALICE/notes', '/leads/L-ALICE/archive', '/contractors', '/emails/J-EVIL-C/retry']) {
    const r = await post(p, { stage: 'won', body: 'x', name: 'x' }, { jwt: null, csrf: 'a'.repeat(64) });
    eq(r.status, 401, p);
  }
  eq(one('SELECT COUNT(*) n FROM lead_notes').n, before, 'notes');
  eq(one("SELECT status FROM leads WHERE id='L-ALICE'").status, 'new', 'stage');
  eq(one("SELECT status FROM email_jobs WHERE id='J-EVIL-C'").status, 'failed', 'job');
});
const bad = (name, jwtOpts, expected = 401) =>
  test(`${name} -> ${expected}`, async () => {
    const jwt = typeof jwtOpts === 'string' ? jwtOpts : makeJwt(jwtOpts);
    for (const p of ['/', '/leads/L-ALICE', '/leads/export.csv']) {
      const r = await get(p, jwt);
      eq(r.status, expected, p);
      ok(!r.text.includes('Alice Tremblay'), 'leaked data');
    }
  });
await bad('token signed by the wrong key', { key: attacker.privateKey });
await bad('expired token', { exp: Math.floor(Date.now() / 1000) - 600 });
await bad('wrong audience (a different Access app)', { aud: 'some-other-app' });
await bad('wrong issuer (a different Access team)', { iss: 'https://evil-team.cloudflareaccess.com' });
await bad('alg "none" (unsigned) token', { alg: 'none' });
await bad('alg HS256 forged with the public key', { alg: 'HS256' });
await bad('unknown key id', { kid: 'not-a-real-key' });
await bad('garbage token', 'not.a.jwt');
await bad('token with a tampered payload', (() => { const [h, , s] = makeJwt().split('.'); return `${h}.${b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: 9999999999, email: ADMIN }))}.${s}`; })());
await bad('valid signature but email not on the admin list', { email: 'stranger@example.test' }, 403);
await bad('valid signature but no email claim (e.g. a service token)', { email: null }, 403);
await test('a second allowlisted admin email is accepted; case-insensitive', async () => {
  eq((await get('/', makeJwt({ email: 'Second@Example.Test' }))).status, 200);
});
await test('valid admin -> 200 with hardening headers (no-store, CSP, nosniff, frame deny, noindex)', async () => {
  const r = await get('/');
  eq(r.status, 200);
  eq(r.headers['cache-control'], 'no-store', 'cache-control');
  ok(/default-src 'none'/.test(r.headers['content-security-policy']) && /frame-ancestors 'none'/.test(r.headers['content-security-policy']), 'csp');
  eq(r.headers['x-content-type-options'], 'nosniff', 'nosniff'); eq(r.headers['x-frame-options'], 'DENY', 'xfo');
  ok(/noindex/.test(r.headers['x-robots-tag']), 'noindex');
  ok(!/style="/.test(r.text), 'inline style attribute would violate the CSP');
});
await test('the signed-in email is shown', async () => { ok((await get('/')).text.includes(`Signed in as ${ADMIN}`), 'email'); });

console.log('\n[CSRF]');
const snapshot = () => JSON.stringify([rows('SELECT status, updated_at FROM leads WHERE id=?', 'L-ALICE'), rows('SELECT COUNT(*) n FROM lead_notes'), rows('SELECT COUNT(*) n FROM lead_activity')]);
await test('POST without an Origin header -> 403, nothing changes', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { noOrigin: true }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('POST from another site (wrong Origin) -> 403, nothing changes', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { origin: 'https://evil.example' }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('POST with Origin "null" -> still 403 (a real browser sends this if Referrer-Policy is no-referrer; the check must not be loosened)', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { origin: 'null' }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('POST with the right Origin but Sec-Fetch-Site: cross-site -> 403', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('a browser-style same-origin POST (right Origin + Sec-Fetch-Site: same-origin) succeeds', async () => {
  const r = await post('/leads/L-ALICE/notes', { body: 'browser-style post' }, { headers: { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate' } });
  eq(r.status, 303); eq(notice(r), 'note_saved'); sql("DELETE FROM lead_notes WHERE body='browser-style post'"); sql("DELETE FROM lead_activity WHERE lead_id='L-ALICE' AND type='note_added'");
});
await test('responses use Referrer-Policy: same-origin (root cause of the original "Request blocked": no-referrer makes browsers send Origin: null)', async () => {
  for (const p of ['/', '/leads/L-ALICE']) eq((await get(p)).headers['referrer-policy'], 'same-origin', p);
});
await test('a token fetched with one Access token still works after Access re-issues the token (same person, new signature)', async () => {
  const jwtA = makeJwt({ payload: { iat: Math.floor(Date.now() / 1000) - 60 } });
  await sleep(1100);
  const jwtB = makeJwt({ payload: { iat: Math.floor(Date.now() / 1000) } });
  ok(jwtA.split('.')[2] !== jwtB.split('.')[2], 'test needs two different tokens');
  const r = await post('/leads/L-ALICE/notes', { body: 'reissued-token note' }, { jwt: jwtB, tokenJwt: jwtA });
  eq(r.status, 303); eq(notice(r), 'note_saved', 'form rendered under token A, posted under token B');
  sql("DELETE FROM lead_notes WHERE body='reissued-token note'"); sql("DELETE FROM lead_activity WHERE lead_id='L-ALICE' AND type='note_added'");
});
await test('the CSRF token is not the same for two different admins, and is not a constant', async () => {
  const a = await csrfFrom('/leads/L-ALICE', makeJwt()); const b = await csrfFrom('/leads/L-ALICE', makeJwt({ email: 'second@example.test' }));
  ok(a !== b && /^[0-9a-f]{64}$/.test(a), 'per-admin token'); eq(a, await csrfFrom('/leads/L-ALICE', makeJwt()), 'stable for one admin within a day');
});
await test('POST with no CSRF token -> 403', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { csrf: null }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('POST with a wrong CSRF token -> 403', async () => {
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { csrf: 'f'.repeat(64) }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test("POST using another session's CSRF token -> 403", async () => {
  const other = makeJwt({ email: 'second@example.test' });
  const otherToken = await csrfFrom('/leads/L-ALICE', other);
  const s = snapshot(); const r = await post('/leads/L-ALICE/stage', { stage: 'won' }, { csrf: otherToken }); eq(r.status, 403); eq(snapshot(), s, 'db');
});
await test('PUT / DELETE are not supported (405); there is no delete route for leads', async () => {
  for (const m of ['PUT', 'DELETE', 'PATCH']) eq((await http(BASE, m, '/leads/L-ALICE', { headers: { 'Cf-Access-Jwt-Assertion': goodJwt() } })).status, 405, m);
  eq((await post('/leads/L-ALICE/delete', {})).status, 404, 'POST delete');
  eq(one('SELECT COUNT(*) n FROM leads').n, 63, 'lead count');
});

console.log('\n[reading data]');
await test('overview shows correct counts', async () => {
  const t = (await get('/')).text;
  ok(/<div class="n">63<\/div><div class="l">New leads/.test(t), 'new leads = 63');
  ok(/<div class="n">1<\/div><div class="l">Email failures/.test(t), 'email failures = 1');
  ok(/<div class="n">0<\/div><div class="l">Overdue follow-ups/.test(t), 'overdue = 0');
});
await test('leads list: paginated 25 per page, newest first, Previous/Next links', async () => {
  const p1 = await get('/leads'); ok(/Showing 1–25 of 63/.test(p1.text), 'page 1 summary'); ok(/page=2/.test(p1.text), 'next link');
  const p3 = await get('/leads?page=3'); ok(/Showing 51–63 of 63/.test(p3.text), 'page 3 summary');
  eq((await get('/leads?page=9999')).status, 200, 'out-of-range page');
  eq((await get('/leads?page=abc')).status, 200, 'junk page');
});
await test('search by name, email, phone (with and without punctuation), city, project', async () => {
  const count = async (q) => Number(/of (\d+)|No results/.exec((await get(`/leads?q=${encodeURIComponent(q)}`)).text)?.[1] ?? 0);
  eq(await count('alice'), 1, 'name'); eq(await count('pending@example'), 1, 'email'); eq(await count('4165550101'), 1, 'phone digits');
  eq(await count('(416) 555-0101'), 1, 'phone formatted'); eq(await count('Mississauga'), 1, 'city'); eq(await count('Bathroom'), 1, 'project');
  eq(await count('Flooring'), 60, 'bulk project'); eq(await count('zzz-none'), 0, 'no match');
});
await test('search treats % _ \\ and quotes literally (no wildcard/SQL injection)', async () => {
  for (const q of ['%', '_', "'; DROP TABLE leads;--", '\\', '" OR 1=1']) eq((await get(`/leads?q=${encodeURIComponent(q)}`)).status, 200, q);
  eq(one("SELECT COUNT(*) n FROM sqlite_master WHERE name='leads'").n, 1, 'table intact');
  const r = await get('/leads?q=%25'); ok(/No results|Showing/.test(r.text), 'renders'); ok(!/Showing 1–25 of 63/.test(r.text), '% must not match everything');
});
await test('filters: stage, source, unassigned contractor', async () => {
  ok(/of 1\b/.test((await get('/leads?source=homepage')).text), 'source'); ok(/of 63\b/.test((await get('/leads?status=new')).text), 'stage');
  ok(/No results/.test((await get('/leads?status=won')).text), 'stage none'); ok(/of 63\b/.test((await get('/leads?contractor=none')).text), 'unassigned');
  eq((await get('/leads?status=bogus&source=bogus&contractor=%27%3B--')).status, 200, 'junk filters ignored');
});

console.log('\n[safe rendering of customer input]');
await test('hostile lead fields are HTML-escaped everywhere (list, detail, emails page)', async () => {
  for (const p of ['/leads?q=script', '/leads/L-EVIL', '/emails']) {
    const r = await get(p);
    ok(!/<script>alert|<img src=x/i.test(r.text), `${p}: raw markup present`);
  }
  const d = (await get('/leads/L-EVIL')).text;
  ok(d.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'script tag escaped'); ok(d.includes('&lt;img src=x onerror=alert(1)&gt;'), 'img escaped');
  ok((await get('/emails')).text.includes('&lt;b&gt;simulated&lt;/b&gt;'), 'provider error text escaped');
});
await test('contact links are safe (mailto/tel built from escaped values only)', async () => {
  const d = (await get('/leads/L-EVIL')).text;
  ok(/href="tel:\+12895550102"/.test(d), 'tel'); ok(/href="mailto:evil@example.test"/.test(d), 'mailto');
});

console.log('\n[lead updates]');
await test('update stage: saved, activity + updated_at recorded; same value is a no-op', async () => {
  const r = await post('/leads/L-ALICE/stage', { stage: 'contacted' });
  eq(r.status, 303); eq(notice(r), 'stage_saved');
  eq(one("SELECT status FROM leads WHERE id='L-ALICE'").status, 'contacted', 'status');
  ok(one("SELECT updated_at FROM leads WHERE id='L-ALICE'").updated_at, 'updated_at');
  ok(/Stage changed from New to Contacted/.test((await get('/leads/L-ALICE')).text), 'activity shown');
  const n = one("SELECT COUNT(*) n FROM lead_activity WHERE lead_id='L-ALICE'").n;
  eq(notice(await post('/leads/L-ALICE/stage', { stage: 'contacted' })), 'no_change');
  eq(one("SELECT COUNT(*) n FROM lead_activity WHERE lead_id='L-ALICE'").n, n, 'no duplicate activity');
});
await test('all six stages are accepted; an invented stage is rejected', async () => {
  for (const s of ['assessment_booked', 'quote_sent', 'won', 'lost', 'new']) eq(notice(await post('/leads/L-ALICE/stage', { stage: s })), 'stage_saved', s);
  eq(notice(await post('/leads/L-ALICE/stage', { stage: 'hacked' })), 'bad_stage'); eq(one("SELECT status FROM leads WHERE id='L-ALICE'").status, 'new');
});
await test('email delivery state is untouched by stage changes (kept separate)', async () => {
  eq(one("SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='L-ALICE'"), { c: 'sent', i: 'sent' });
});
await test('notes: add, preserved verbatim, shown escaped; empty and >5000 rejected', async () => {
  eq(notice(await post('/leads/L-ALICE/notes', { body: 'Called back <b>twice</b>\nLeft voicemail' })), 'note_saved');
  const d = (await get('/leads/L-ALICE')).text; ok(d.includes('Called back &lt;b&gt;twice&lt;/b&gt;'), 'escaped note'); ok(d.includes(ADMIN), 'author');
  eq(notice(await post('/leads/L-ALICE/notes', { body: '   ' })), 'note_empty');
  eq(notice(await post('/leads/L-ALICE/notes', { body: 'x'.repeat(5001) })), 'note_long');
  eq(one("SELECT COUNT(*) n FROM lead_notes WHERE lead_id='L-ALICE'").n, 1, 'one note stored');
});
let contractorId;
await test('contractors: create (name required, email validated), edit, list', async () => {
  eq(notice(await post('/contractors', { name: '' })), 'contractor_name');
  eq(notice(await post('/contractors', { name: 'X', email: 'not-an-email' })), 'contractor_email');
  const r = await post('/contractors', { name: 'Sam Builder', company: 'Sam <Builds> Inc', service_types: 'kitchens, basements', service_area: 'Peel', email: 'sam@example.test', phone: '(905) 555-0199', notes: 'n' });
  eq(notice(r), 'contractor_created'); contractorId = /\/contractors\/([\w-]+)\?/.exec(r.headers.location)[1];
  eq(notice(await post(`/contractors/${contractorId}`, { name: 'Sam Builder', company: 'Sam Builds Inc', email: 'sam@example.test' })), 'contractor_updated');
  const list = (await get('/contractors')).text; ok(list.includes('Sam Builder') && list.includes('Sam Builds Inc'), 'listed');
});
await test('assign contractor: recorded internally, NO email is sent to anyone', async () => {
  mockLog.length = 0;
  const jobsBefore = one('SELECT COUNT(*) n FROM email_jobs').n;
  eq(notice(await post('/leads/L-ALICE/contractor', { contractor_id: contractorId })), 'contractor_saved');
  eq(one("SELECT contractor_id c FROM leads WHERE id='L-ALICE'").c, contractorId, 'assigned');
  eq(one('SELECT COUNT(*) n FROM email_jobs').n, jobsBefore, 'no email job created');
  eq(mockLog.length, 0, 'no outbound email');
  ok(/nothing was sent to them/.test((await get('/leads/L-ALICE')).text), 'activity says internal only');
  eq(notice(await post('/leads/L-ALICE/contractor', { contractor_id: 'nonexistent' })), 'bad_contractor');
});
await test('archived contractors cannot be newly assigned; existing assignment kept; can be restored', async () => {
  eq(notice(await post(`/contractors/${contractorId}/archive`, {})), 'contractor_archived');
  eq(one("SELECT contractor_id c FROM leads WHERE id='L-ALICE'").c, contractorId, 'assignment kept');
  eq(notice(await post('/leads/L-PEND/contractor', { contractor_id: contractorId })), 'bad_contractor');
  eq(notice(await post(`/contractors/${contractorId}/unarchive`, {})), 'contractor_unarchived');
  eq(notice(await post('/leads/L-ALICE/contractor', { contractor_id: '' })), 'contractor_saved'); eq(one("SELECT contractor_id c FROM leads WHERE id='L-ALICE'").c, null, 'unassigned');
});
await test('follow-ups: add, appear as due today/overdue/upcoming, complete once (double click safe)', async () => {
  const today = one("SELECT strftime('%Y-%m-%d','now','-4 hours') d").d; // close enough to Toronto for seeding relative dates
  const day = (offset) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: day(-3), note: 'overdue one' })), 'followup_saved');
  eq(notice(await post('/leads/L-PEND/follow-ups', { due_on: day(5), note: 'later' })), 'followup_saved');
  eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: 'not-a-date' })), 'bad_date'); eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: '2026-02-30' })), 'bad_date');
  const page = (await get('/follow-ups')).text;
  ok(/Overdue \(1\)/.test(page) && /Upcoming \(1\)/.test(page), 'sections counted'); ok((await get('/')).text.includes('<div class="n">1</div><div class="l">Overdue follow-ups'), 'overview overdue');
  const fu = one("SELECT id FROM follow_ups WHERE note='overdue one'").id;
  const [a, b] = await Promise.all([post(`/leads/L-ALICE/follow-ups/${fu}/complete`, { back: 'followups' }), post(`/leads/L-ALICE/follow-ups/${fu}/complete`, { back: 'followups' })]);
  eq([notice(a), notice(b)].sort(), ['followup_done', 'no_change'], 'exactly one completes');
  eq(one("SELECT COUNT(*) n FROM lead_activity WHERE type='follow_up_completed'").n, 1, 'one activity entry');
  ok(/Recently completed \(1\)/.test((await get('/follow-ups')).text), 'in completed');
});
await test('adding the SAME follow-up twice (double click / resubmit / retry) creates exactly one row and one activity entry', async () => {
  const acts = () => one("SELECT COUNT(*) n FROM lead_activity WHERE lead_id='L-ALICE' AND type='follow_up_set'").n;
  const before = acts();
  const rs = await Promise.all([1, 2, 3].map(() => post('/leads/L-ALICE/follow-ups', { due_on: '2031-01-15', note: 'dup check' })));
  eq(rs.map(notice).sort(), ['followup_saved', 'no_change', 'no_change'], 'one saved, two no-ops');
  eq(one("SELECT COUNT(*) n FROM follow_ups WHERE lead_id='L-ALICE' AND due_on='2031-01-15' AND note='dup check'").n, 1, 'rows');
  eq(acts(), before + 1, 'activity entries');
  eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: '2031-01-15', note: 'dup check' })), 'no_change', 'sequential repeat');
  eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: '2031-01-15', note: 'a different note' })), 'followup_saved', 'a genuinely different follow-up is still allowed');
  eq(notice(await post('/leads/L-ALICE/follow-ups', { due_on: '2031-01-16', note: 'dup check' })), 'followup_saved', 'a different date is still allowed');
  sql("DELETE FROM follow_ups WHERE due_on IN ('2031-01-15','2031-01-16')"); sql("DELETE FROM lead_activity WHERE lead_id='L-ALICE' AND type='follow_up_set' AND summary LIKE '%2031%'");
});
await test('assessment date: entered in Toronto time, stored UTC, shown back in Toronto (EST and EDT)', async () => {
  eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: '2026-11-05T09:00' })), 'assessment_saved');
  eq(one("SELECT assessment_at a FROM leads WHERE id='L-ALICE'").a, '2026-11-05T14:00:00.000Z', 'EST = UTC-5');
  eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: '2026-07-15T09:00' })), 'assessment_saved');
  eq(one("SELECT assessment_at a FROM leads WHERE id='L-ALICE'").a, '2026-07-15T13:00:00.000Z', 'EDT = UTC-4');
  ok(/value="2026-07-15T09:00"/.test((await get('/leads/L-ALICE')).text), 'round-trips to the form as 09:00');
  ok(/Jul 15, 2026, 9:00 a\.m\./.test((await get('/leads/L-ALICE')).text) || /Jul 15, 2026, 9:00 AM/i.test((await get('/leads/L-ALICE')).text), 'displayed in Toronto time');
});
await test('assessment date: DST edge cases (skipped hour rejected; repeated hour accepted) and junk rejected', async () => {
  eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: '2027-03-14T02:30' })), 'bad_datetime', 'spring-forward gap');
  eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: '2026-11-01T01:30' })), 'assessment_saved', 'fall-back repeated hour');
  for (const junk of ['tomorrow', '2026-13-01T10:00', '2026-02-30T10:00', '2026-01-01T25:00']) eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: junk })), 'bad_datetime', junk);
  eq(notice(await post('/leads/L-ALICE/assessment', { assessment_at: '' })), 'assessment_saved'); eq(one("SELECT assessment_at a FROM leads WHERE id='L-ALICE'").a, null, 'cleared');
});
await test('recording an assessment does not change the stage or email anyone', async () => {
  mockLog.length = 0; const before = one("SELECT status s FROM leads WHERE id='L-PEND'").s;
  await post('/leads/L-PEND/assessment', { assessment_at: '2027-05-05T10:00' });
  eq(one("SELECT status s FROM leads WHERE id='L-PEND'").s, before, 'stage'); eq(mockLog.length, 0, 'emails');
});
await test('archive hides from default list but keeps the row; restore brings it back; nothing is deleted', async () => {
  eq(notice(await post('/leads/L-PEND/archive', {})), 'archived');
  ok(!(await get('/leads?q=Pending%20Person')).text.includes('href="/leads/L-PEND"'), 'hidden by default');
  ok((await get('/leads?q=Pending%20Person&archived=only')).text.includes('href="/leads/L-PEND"'), 'visible in archived');
  ok(/Restore from archive/.test((await get('/leads/L-PEND')).text), 'detail still reachable');
  eq(one("SELECT COUNT(*) n FROM leads WHERE id='L-PEND'").n, 1, 'row exists');
  eq(notice(await post('/leads/L-PEND/unarchive', {})), 'unarchived'); ok((await get('/leads?q=Pending%20Person')).text.includes('href="/leads/L-PEND"'), 'restored');
});
await test('archived leads are excluded from follow-up dashboards', async () => {
  await post('/leads/L-PEND/archive', {}); ok(!/Upcoming \(1\)/.test((await get('/follow-ups')).text), 'archived lead follow-up hidden'); await post('/leads/L-PEND/unarchive', {});
});
await test('unknown lead/contractor/email ids -> 404 or not_found notice, never a crash', async () => {
  eq((await get('/leads/nope')).status, 404); eq((await get('/contractors/nope')).status, 404);
  eq(notice(await post('/leads/nope/stage', { stage: 'won' })), 'not_found'); eq(notice(await post('/emails/nope/retry', {})), 'not_found');
});

console.log('\n[CSV export]');
await test('CSV: correct type/headers, BOM, Toronto times, attachment, no-store', async () => {
  const r = await get('/leads/export.csv');
  eq(r.status, 200); ok(/text\/csv/.test(r.headers['content-type']), 'type'); ok(/attachment; filename="renorise-leads-\d{4}-\d{2}-\d{2}\.csv"/.test(r.headers['content-disposition']), 'disposition');
  eq(r.headers['cache-control'], 'no-store', 'no-store'); ok(r.text.startsWith('﻿'), 'BOM');
  ok(/Sep 1, 2026, 11:00 a\.m\./.test(r.text) || /Sep 1, 2026, 11:00 AM/i.test(r.text), 'Toronto time');
  eq(r.text.trim().split('\r\n').length > 60, true, 'rows');
});
await test('CSV: formula-injection cells are neutralised; quotes/commas/newlines escaped', async () => {
  const csv = (await get('/leads/export.csv?q=evil')).text;
  ok(csv.includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`), 'starts with = is prefixed');
  ok(csv.includes(`'+cmd|`), '+ prefixed'); ok(csv.includes(`'@SUM(1+1)`), '@ prefixed'); ok(csv.includes(`'+1 289 555 0102`), 'phone + prefixed');
  ok(csv.includes(`line ""quoted"", with comma`), 'quotes doubled and cell quoted');
  // strict check: parse cells and make sure none STARTS with a formula character
  const parsed = parseCsv(csv.replace(/^﻿/, ''));
  for (const row of parsed.slice(1)) for (const cell of row) ok(!/^[\s]*[=+\-@]/.test(cell) && !/^[\t\r]/.test(cell), `unsafe cell: ${cell}`);
});
await test('CSV: honours filters and excludes archived by default', async () => {
  const all = parseCsv((await get('/leads/export.csv')).text.replace(/^﻿/, '')); eq(all.length - 1, 63, 'all active');
  const homepage = parseCsv((await get('/leads/export.csv?source=homepage')).text.replace(/^﻿/, '')); eq(homepage.length - 1, 1, 'homepage only');
  await post('/leads/L-PEND/archive', {}); eq(parseCsv((await get('/leads/export.csv')).text.replace(/^﻿/, '')).length - 1, 62, 'archived excluded');
  eq(parseCsv((await get('/leads/export.csv?archived=all')).text.replace(/^﻿/, '')).length - 1, 63, 'archived included on request'); await post('/leads/L-PEND/unarchive', {});
});
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\r') { /* skip */ } else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

console.log('\n[email retry — reuses the existing retry logic]');
await test('failed email: retry re-queues it for the existing sweep (one more bounded attempt); nothing is sent from the dashboard', async () => {
  mockLog.length = 0;
  const r = await post('/emails/J-EVIL-C/retry', { back: 'emails' });
  eq(notice(r), 'retry_queued');
  eq(one("SELECT status, attempts, max_attempts FROM email_jobs WHERE id='J-EVIL-C'"), { status: 'pending', attempts: 5, max_attempts: 6 }, 'job');
  eq(one("SELECT customer_email_status c FROM leads WHERE id='L-EVIL'").c, 'pending', 'lead mirror');
  eq(mockLog.length, 0, 'dashboard sent nothing');
  ok(/re-queued for retry/.test((await get('/leads/L-EVIL')).text), 'activity');
});
await test('double click / concurrent retries queue it once only', async () => {
  sql("UPDATE email_jobs SET status='failed', attempts=5, max_attempts=5 WHERE id='J-EVIL-C'");
  const acts = one("SELECT COUNT(*) n FROM lead_activity WHERE type='email_retry_queued'").n;
  const rs = await Promise.all([post('/emails/J-EVIL-C/retry', {}), post('/emails/J-EVIL-C/retry', {}), post('/emails/J-EVIL-C/retry', {})]);
  const codes = rs.map(notice).sort();
  eq(codes.filter((c) => c === 'retry_queued').length, 1, `exactly one queued (${codes})`);
  eq(one("SELECT max_attempts m FROM email_jobs WHERE id='J-EVIL-C'").m, 6, 'max_attempts raised once, not three times');
  eq(one("SELECT COUNT(*) n FROM lead_activity WHERE type='email_retry_queued'").n, acts + 1, 'one activity entry');
});
await test('only failed jobs are eligible: sent / pending / sending are refused; unchanged', async () => {
  sql("UPDATE email_jobs SET status='sending' WHERE id='J-ALICE-I'");
  const before = JSON.stringify(rows('SELECT id, status, attempts, max_attempts FROM email_jobs ORDER BY id'));
  eq(notice(await post('/emails/J-ALICE-C/retry', {})), 'retry_not_eligible', 'sent');
  eq(notice(await post('/emails/J-ALICE-I/retry', {})), 'retry_not_eligible', 'sending');
  eq(notice(await post('/emails/J-EVIL-C/retry', {})), 'retry_already_queued', 'pending');
  eq(JSON.stringify(rows('SELECT id, status, attempts, max_attempts FROM email_jobs ORDER BY id')), before, 'no rows changed');
  sql("UPDATE email_jobs SET status='sent' WHERE id='J-ALICE-I'");
});
await test('email wording: "sent" is labelled as accepted by Resend, not delivered', async () => {
  const t = (await get('/emails')).text;
  ok(/Accepted by Resend \(inbox delivery not verified\)/.test(t), 'label'); ok(!/[>\s]Delivered[<\s]/.test(t), 'must not claim delivered');
  ok(/cannot confirm the email reached an inbox/.test(t), 'explanation');
});
await test('email activity page: failed filter, counts, and retry button only on failed rows', async () => {
  sql("UPDATE email_jobs SET status='failed', attempts=5, max_attempts=5 WHERE id='J-EVIL-C'");
  const t = (await get('/emails?status=failed')).text;
  ok(/Retry this email/.test(t), 'retry button'); ok(/Failed \(1\)/.test(t), 'tab count');
  ok(!/Retry this email/.test((await get('/emails?status=sent')).text), 'no retry on sent');
});

console.log('\n[integration with the real public Worker (same database)]');
writeFileSync(`${FORMS_DIR}/.dev.vars`, [`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, 'RESEND_API_KEY=re_TEST_NOT_A_REAL_KEY', `RESEND_API_URL=http://127.0.0.1:${MOCK_RESEND_PORT}/emails`].join('\n') + '\n');
await startWorker('forms', { cwd: FORMS_DIR, wrangler: 'node_modules/wrangler/bin/wrangler.js', port: FORMS_PORT, args: ['--test-scheduled'], readyPath: '/api/leads', readyStatus: 405 });
const formsSweep = () => http(FORMS_BASE, 'GET', '/__scheduled?cron=*%2F15+*+*+*+*');
await test('existing cron sweep sends the re-queued email exactly once, with the ORIGINAL idempotency key, then marks it sent', async () => {
  sql("UPDATE email_jobs SET status='failed', attempts=5, max_attempts=5 WHERE id='J-EVIL-C'");
  sql("UPDATE email_jobs SET status='sent' WHERE lead_id='L-PEND' AND email_type='customer'"); // keep the sweep focused
  eq(notice(await post('/emails/J-EVIL-C/retry', {})), 'retry_queued'); mockLog.length = 0;
  await formsSweep();
  await waitFor(() => one("SELECT status s FROM email_jobs WHERE id='J-EVIL-C'").s === 'sent', 'sweep to send');
  const mine = mockLog.filter((m) => m.headers['idempotency-key'] === 'L-EVIL:customer');
  eq(mine.length, 1, 'emails for the retried job'); eq(mine[0].body.to, ['evil@example.test'], 'recipient is the lead');
  eq(one("SELECT customer_email_status c FROM leads WHERE id='L-EVIL'").c, 'sent', 'lead mirror updated by the sweep');
  const n = mockLog.length; await formsSweep(); await formsSweep(); await sleep(1500); eq(mockLog.length, n, 'no further sends');
  ok(/Accepted by Resend/.test((await get('/leads/L-EVIL')).text), 'dashboard now shows accepted');
});
await test('the public form still works on the extended schema, and the new lead appears in the dashboard as "New"', async () => {
  const r = await http(FORMS_BASE, 'POST', '/api/leads', { headers: { 'Content-Type': 'application/json', Origin: 'https://renosrise.com', 'CF-Connecting-IP': '203.0.113.77' }, body: JSON.stringify({ name: 'Live Form Person', email: 'live@example.test', phone: '(416) 555-0177', city: 'Toronto', renovation_type: 'deck', start_timeframe: 'Just exploring', source: 'homepage', idempotency_key: 'integration-1', turnstile_token: 'dummy-token' }) });
  eq(r.status, 201, 'public POST');
  // Two local Worker processes share one SQLite file here, which can hit SQLITE_BUSY (not possible on production D1). The durable design recovers it: leave it pending and let the sweep finish it.
  const bothSent = () => one("SELECT COUNT(*) n FROM email_jobs WHERE status='sent' AND lead_id=(SELECT id FROM leads WHERE idempotency_key='integration-1')").n === 2;
  for (let i = 0; i < 6 && !bothSent(); i++) { await sleep(1500); if (!bothSent()) await formsSweep(); }
  ok(bothSent(), 'both emails sent (directly or via the sweep)');
  const d = (await get('/leads?q=Live%20Form%20Person')).text; ok(d.includes('Live Form Person') && /st-new/.test(d), 'in dashboard as New');
  const lead = one("SELECT * FROM leads WHERE idempotency_key='integration-1'"); eq([lead.status, lead.archived_at, lead.contractor_id, lead.assessment_at], ['new', null, null, null], 'new columns default to NULL');
  eq((await get(`/leads/${lead.id}`)).status, 200, 'detail page');
});
killProc('forms');

console.log('\n[data safety]');
await test('no lead was deleted, and no dashboard code path deletes leads', async () => {
  eq(one('SELECT COUNT(*) n FROM leads').n, 64, 'leads (63 seeded + 1 live)');
});
await test('no secrets or customer contact details in Worker logs', async () => {
  ok(!/re_TEST_NOT_A_REAL_KEY|1x0000000000000000000000000000000AA/.test(devOutput), 'secret in logs');
  const scrubbed = devOutput.replace(/^.*\[wrangler:info\]\s+(GET|POST|HEAD|OPTIONS|PUT|DELETE|PATCH)\s.*$/gm, '').replace(/^.*(ACCESS_|ADMIN_EMAILS|ALLOWED_ORIGINS|CUSTOMER_FROM_EMAIL|INTERNAL_NOTIFY_EMAIL|REPLY_TO_EMAIL).*$/gm, '');
  ok(!/alice@example\.test|555-0101|Alice Tremblay|evil@example\.test/.test(scrubbed), 'contact details in logs');
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}: ${f.err.message}`));
await shutdown(failed.length ? 1 : 0);

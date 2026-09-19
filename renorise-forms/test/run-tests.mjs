// Isolated end-to-end test harness for the renorise-forms Worker.
//
// Runs the real Worker code under `wrangler dev` against a THROWAWAY local
// D1 database (.wrangler/test-state), with:
//   - Cloudflare's documented Turnstile TEST secrets (always-pass, then
//     always-fail), and
//   - a local mock Resend server (no real email is sent, no real API key
//     is used).
// Nothing here touches the production database, secrets, or Resend.
//
//   cd renorise-forms && node test/run-tests.mjs

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = 8790;
const MOCK_PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = '.wrangler/test-state';
const ORIGIN = 'https://renosrise.com';
const PREVIEW_ORIGIN = 'https://reno-rise-git-cloudflare-forms-backend-reno-rise.vercel.app';
const isWin = process.platform === 'win32';
// Call wrangler through node directly (no shell) so SQL arguments with
// spaces/quotes are passed intact on Windows.
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';

// ---- tiny assertion framework -------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
function eq(actual, expected, label = 'value') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

// ---- mock Resend ---------------------------------------------------------
let mockMode = 'ok'; // ok | 500 | 422
let mockLog = [];
let mockCounter = 0;
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    mockLog.push({ headers: req.headers, body: body ? JSON.parse(body) : null, mode: mockMode });
    if (mockMode === '500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'application_error', message: 'simulated Resend outage' }));
    } else if (mockMode === '422') {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'validation_error', message: 'simulated invalid recipient' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `mock-msg-${++mockCounter}` }));
    }
  });
});

// ---- DB helpers (local, isolated) ----------------------------------------
let localDb = null;
function sql(command) {
  if (!localDb) {
    const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
    const file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    localDb = new DatabaseSync(`${dir}/${file}`);
    localDb.exec('PRAGMA busy_timeout = 10000');
  }
  if (/^s*select/i.test(command)) return localDb.prepare(command).all().map((r) => ({ ...r }));
  localDb.exec(command);
  return [];
}

// ---- request helpers -----------------------------------------------------
let keyCounter = 0;
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter}`;
function leadBody(overrides = {}) {
  return {
    name: 'Test Person',
    email: 'hello@renosrise.com',
    phone: '(416) 555-0100',
    city: 'Toronto',
    renovation_type: 'kitchen remodel',
    start_timeframe: 'Within 1-3 months',
    completion_deadline: '',
    details: 'Isolated harness test.',
    source: 'assessment',
    idempotency_key: `harness-${Date.now()}-${++keyCounter}`,
    turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX',
    ...overrides,
  };
}
async function post(body, { ip = nextIp(), origin = ORIGIN, raw } = {}) {
  const payload = raw !== undefined ? raw : JSON.stringify(body);
  const res = await http('POST', '/api/leads', {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) },
    body: payload,
  });
  let json = null;
  try { json = JSON.parse(res.text); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}
function http(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${BASE}${path}`, { method, headers, agent: false }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: (k) => res.headers[k.toLowerCase()] ?? null }, text: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const sweep = () => http('GET', '/__scheduled?cron=*%2F15+*+*+*+*').then((r) => r.text);
const sent = () => mockLog.filter((e) => e.mode === 'ok');
// Quiesce: wait until no email job is pending/mid-flight so one test's leftover
// sends can't leak into the next. Jobs left pending (e.g. by a deliberately
// broken DB) are exactly what the cron sweep exists for, so run it.
async function settle() {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (sql("SELECT COUNT(*) n FROM email_jobs WHERE status IN ('pending','sending')")[0].n === 0) {
      await sleep(300);
      return;
    }
    // A job stuck in 'sending' is recovered by the stale-claim rule (tested separately); age it so this run doesn't wait 10 minutes.
    sql(`UPDATE email_jobs SET updated_at='${new Date(Date.now() - 11 * 60 * 1000).toISOString()}' WHERE status='sending' AND updated_at < '${new Date(Date.now() - 3000).toISOString()}'`);
    await sweep();
    await sleep(1500);
  }
  throw new Error('email jobs did not settle');
}
const leadCount = () => sql('SELECT COUNT(*) n FROM leads')[0].n;

// ---- Worker process control ------------------------------------------------
let dev = null;
let devOutput = '';
function killDev() {
  if (!dev) return;
  try {
    if (isWin) execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
    else dev.kill('SIGTERM');
  } catch { /* already gone */ }
  dev = null;
}
async function startDev(turnstileSecret, { scheduled }) {
  writeFileSync(
    '.dev.vars',
    [
      `TURNSTILE_SECRET_KEY=${turnstileSecret}`,
      'RESEND_API_KEY=re_TEST_NOT_A_REAL_KEY',
      `RESEND_API_URL=http://127.0.0.1:${MOCK_PORT}/emails`,
    ].join('\n') + '\n'
  );
  // ALLOWED_ORIGINS comes from wrangler.toml [vars] — i.e. this run also
  // proves the real config admits the preview origin.
  const args = ['dev', '--port', String(PORT), '--persist-to', STATE, '--ip', '127.0.0.1'];
  if (scheduled) args.push('--test-scheduled');
  dev = spawn(process.execPath, [WRANGLER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  dev.stdout.on('data', (d) => (devOutput += d));
  dev.stderr.on('data', (d) => (devOutput += d));
  await waitFor(async () => {
    try { return (await http('GET', '/api/leads')).status === 405; } catch { return false; }
  }, 'wrangler dev to become ready', 90000);
}
async function shutdown(code) {
  killDev();
  try { writeFileSync('.wrangler/test-dev.log', devOutput); } catch { /* ignore */ }
  mock.close();
  try { rmSync('.dev.vars', { force: true }); } catch { /* ignore */ }
  process.exit(code);
}

// ---- setup ---------------------------------------------------------------
console.log('Setting up isolated local environment...');
if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { stdio: 'ignore' });
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

try {
  await startDev('1x0000000000000000000000000000000AA', { scheduled: true }); // test secret: always passes
} catch (e) {
  console.log(devOutput);
  console.log('Worker failed to start:', e.message);
  await shutdown(2);
}

console.log('\nRunning tests');

// ---- 1. happy path + storage ---------------------------------------------
console.log('\n[storage + emails]');
let happy;
await test('valid submission -> 201 {ok:true, leadId}', async () => {
  mockLog = [];
  happy = leadBody({ name: 'Happy Path', details: 'line1\nline2' });
  const r = await post(happy);
  eq(r.status, 201, 'status');
  eq(r.json.ok, true, 'ok');
  if (!r.json.leadId) throw new Error('no leadId');
  happy.leadId = r.json.leadId;
});
await test('lead row stored with every field, separate email + phone', async () => {
  const rows = sql(`SELECT * FROM leads WHERE id='${happy.leadId}'`);
  eq(rows.length, 1, 'rows');
  const l = rows[0];
  eq(l.name, 'Happy Path', 'name'); eq(l.email, 'hello@renosrise.com', 'email'); eq(l.phone, '(416) 555-0100', 'phone');
  eq(l.city, 'Toronto', 'city'); eq(l.renovation_type, 'kitchen remodel', 'renovation_type');
  eq(l.project_timing, 'Within 1-3 months', 'timing'); eq(l.target_deadline, null, 'deadline');
  eq(l.project_details, 'line1\nline2', 'details'); eq(l.source, 'assessment', 'source');
});
await test('exactly 2 emails sent: customer ack + internal notification', async () => {
  await waitFor(() => sent().length >= 2, '2 emails at mock Resend');
  await sleep(1500); // make sure no third one sneaks in
  eq(sent().length, 2, 'emails sent');
  const customer = sent().find((e) => e.body.subject.startsWith('We received'));
  const internal = sent().find((e) => e.body.subject.startsWith('New lead'));
  eq(customer.body.from, 'RenoRise <hello@notify.renosrise.com>', 'customer from');
  eq(customer.body.to, ['hello@renosrise.com'], 'customer to');
  eq(customer.body.reply_to, 'hello@renosrise.com', 'customer reply-to');
  eq(internal.body.to, ['hello@renosrise.com'], 'internal to');
  eq(internal.body.reply_to, 'hello@renosrise.com', 'internal reply-to (lead email)');
  if (!internal.body.html.includes('Happy Path')) throw new Error('internal email missing lead data');
  eq(customer.headers['idempotency-key'], `${happy.leadId}:customer`, 'customer Idempotency-Key');
  eq(internal.headers['idempotency-key'], `${happy.leadId}:internal`, 'internal Idempotency-Key');
});
await test('email statuses recorded separately, message ids stored', async () => {
  const l = await waitFor(() => {
    const r = sql(`SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='${happy.leadId}'`)[0];
    return r.c === 'sent' && r.i === 'sent' ? r : null;
  }, 'both statuses sent');
  eq(l, { c: 'sent', i: 'sent' });
  const jobs = sql(`SELECT email_type, status, attempts, resend_message_id FROM email_jobs WHERE lead_id='${happy.leadId}' ORDER BY email_type`);
  eq(jobs.map((j) => [j.email_type, j.status, j.attempts, !!j.resend_message_id]), [['customer', 'sent', 1, true], ['internal', 'sent', 1, true]]);
});

// ---- 2. duplicate protection ---------------------------------------------
console.log('\n[duplicate protection]');
let dupBody;
await test('same idempotency_key sent 3 times (2 concurrent) -> one lead, same leadId', async () => {
  await settle();
  mockLog = [];
  dupBody = leadBody({ name: 'Dup Test' });
  const [a, b] = await Promise.all([post(dupBody), post(dupBody)]);
  const c = await post(dupBody);
  for (const r of [a, b, c]) { eq(r.status, 201, 'status'); eq(r.json.ok, true, 'ok'); }
  eq(new Set([a.json.leadId, b.json.leadId, c.json.leadId]).size, 1, 'distinct leadIds');
  dupBody.leadId = a.json.leadId;
});
await test('duplicate created 1 lead, 2 email_jobs, and exactly 2 real emails', async () => {
  eq(sql(`SELECT COUNT(*) n FROM leads WHERE idempotency_key='${dupBody.idempotency_key}'`)[0].n, 1, 'lead rows');
  eq(sql(`SELECT COUNT(*) n FROM email_jobs WHERE lead_id='${dupBody.leadId}'`)[0].n, 2, 'job rows');
  await waitFor(() => sent().length >= 2, 'emails');
  await sleep(2000);
  eq(sent().length, 2, 'emails sent after 3 identical submissions');
});

// ---- 3. validation ---------------------------------------------------------
console.log('\n[validation + request handling]');
const bad = (name, overrides, field) =>
  test(`rejects ${name}`, async () => {
    const before = leadCount();
    const r = await post(leadBody(overrides));
    eq(r.status, 400, 'status');
    eq(r.json.ok, false, 'ok');
    eq(Object.keys(r.json.fields), [field], 'failing field');
    eq(leadCount(), before, 'lead count unchanged');
  });
await bad('missing email', { email: '' }, 'email');
await bad('malformed email', { email: 'not-an-email' }, 'email');
await bad('missing phone (email cannot stand in for it)', { phone: '' }, 'phone');
await bad('malformed phone', { phone: 'abc' }, 'phone');
await bad('missing name', { name: '   ' }, 'name');
await bad('missing city', { city: '' }, 'city');
await bad('missing renovation_type', { renovation_type: '' }, 'renovation_type');
await bad('unknown timeframe', { start_timeframe: 'whenever' }, 'start_timeframe');
await bad('unknown source', { source: 'evil' }, 'source');
await bad('over-long details (5001 chars)', { details: 'x'.repeat(5001) }, 'details');
await bad('over-long name (201 chars)', { name: 'x'.repeat(201) }, 'name');
await bad('missing idempotency_key', { idempotency_key: '' }, 'idempotency_key');
await bad('missing turnstile token', { turnstile_token: '' }, 'turnstile_token');
await test('accepts free-text renovation type (no enum) and optional blanks', async () => {
  const r = await post(leadBody({ renovation_type: 'Custom: tear down a wall & add skylight', completion_deadline: '', details: '' }));
  eq(r.status, 201, 'status');
});
await test('non-JSON body -> 400 invalid_json', async () => {
  const r = await post(null, { raw: 'this is not json' });
  eq(r.status, 400, 'status'); eq(r.json.error, 'invalid_json', 'error');
});
await test('oversize body (>20 KB) -> 413, nothing saved', async () => {
  const before = leadCount();
  const r = await post(null, { raw: JSON.stringify(leadBody({ details: 'x'.repeat(30000) })) });
  eq(r.status, 413, 'status');
  eq(leadCount(), before, 'lead count unchanged');
});
await test('SQL-injection-shaped input is stored literally (prepared statements)', async () => {
  const evil = "Robert'); DROP TABLE leads;--";
  const r = await post(leadBody({ name: evil }));
  eq(r.status, 201, 'status');
  eq(sql(`SELECT name FROM leads WHERE id='${r.json.leadId}'`)[0].name, evil, 'stored name');
  eq(sql("SELECT COUNT(*) n FROM sqlite_master WHERE name='leads'")[0].n, 1, 'leads table still exists');
});
await test('HTML in fields is escaped in both emails', async () => {
  await settle();
  mockLog = [];
  const r = await post(leadBody({ name: '<script>alert(1)</script>', details: '<img src=x onerror=alert(2)>' }));
  eq(r.status, 201, 'status');
  await waitFor(() => sent().length >= 2, 'emails');
  for (const e of sent()) {
    if (/<script>|<img src=x/.test(e.body.html)) throw new Error('unescaped HTML in email: ' + e.body.subject);
  }
  if (!sent().some((e) => e.body.html.includes('&lt;script&gt;'))) throw new Error('escaped form not found');
});

// ---- 4. CORS / routing -----------------------------------------------------
console.log('\n[CORS + routing]');
const opts = (origin) => http('OPTIONS', '/api/leads', { headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
await test('OPTIONS from renosrise.com, www, and preview origin -> 204 + matching ACAO', async () => {
  for (const o of [ORIGIN, 'https://www.renosrise.com', PREVIEW_ORIGIN]) {
    const r = await opts(o);
    eq(r.status, 204, o);
    eq(r.headers.get('access-control-allow-origin'), o, `ACAO for ${o}`);
  }
});
await test('OPTIONS from an unlisted origin -> no ACAO header', async () => {
  const r = await opts('https://evil.example');
  eq(r.headers.get('access-control-allow-origin'), null, 'ACAO');
});
await test('POST from an unlisted origin -> 403, nothing saved', async () => {
  const before = leadCount();
  const r = await post(leadBody(), { origin: 'https://evil.example' });
  eq(r.status, 403, 'status'); eq(r.json.error, 'origin_not_allowed', 'error');
  eq(leadCount(), before, 'lead count unchanged');
});
await test('POST from a look-alike origin (renosrise.com.evil.example) -> 403', async () => {
  eq((await post(leadBody(), { origin: 'https://renosrise.com.evil.example' })).status, 403, 'status');
});
await test('success response carries ACAO for the (preview) origin', async () => {
  const r = await post(leadBody(), { origin: PREVIEW_ORIGIN });
  eq(r.status, 201, 'status');
  eq(r.headers.get('access-control-allow-origin'), PREVIEW_ORIGIN, 'ACAO');
});
await test('GET /api/leads -> 405 (no public read endpoint)', async () => {
  eq((await http('GET', '/api/leads')).status, 405, 'status');
});
await test('other paths (/, /api/leads/x, /admin, /leads, /api/export) -> 404, no lead data', async () => {
  for (const p of ['/', '/api/leads/abc', '/admin', '/leads', '/api/export']) {
    const r = await http('GET', p);
    eq(r.status, 404, p);
    eq(JSON.parse(r.text), { ok: false, error: 'not_found' }, `${p} body`);
  }
});

// ---- 5. rate limiting -------------------------------------------------------------
console.log('\n[rate limiting]');
await test('6th request from one IP in the window -> 429; a different IP is unaffected', async () => {
  const ip = '198.51.100.50';
  const codes = [];
  for (let n = 0; n < 6; n++) codes.push((await post(leadBody(), { ip })).status);
  eq(codes, [201, 201, 201, 201, 201, 429], 'status sequence');
  eq((await post(leadBody(), { ip: '198.51.100.51' })).status, 201, 'other IP');
});
await test('a 429 saves nothing', async () => {
  const before = leadCount();
  const r = await post(leadBody({ name: 'Rate Limited' }), { ip: '198.51.100.50' });
  eq(r.status, 429, 'status'); eq(r.json.error, 'rate_limited', 'error');
  eq(leadCount(), before, 'lead count unchanged');
});
await test('rate-limit rows store a SHA-256 hash, never the raw IP', async () => {
  const rows = sql('SELECT ip_hash FROM rate_limit_events LIMIT 50');
  if (rows.some((r) => /\d+\.\d+\.\d+\.\d+/.test(r.ip_hash))) throw new Error('raw IP stored');
  eq(rows[0].ip_hash.length, 64, 'sha-256 hex length');
});

// ---- 6. DB failure -------------------------------------------------------------------
console.log('\n[database failure]');
await settle(); // never break tables while background sends are mid-flight
await test('D1 write failure -> 500 server_error, NOT a success (frontend must not redirect)', async () => {
  sql('ALTER TABLE leads RENAME TO leads_broken');
  try {
    const r = await post(leadBody({ name: 'Should Not Save' }));
    eq(r.status, 500, 'status');
    eq(r.json, { ok: false, error: 'server_error' }, 'body');
  } finally {
    sql('ALTER TABLE leads_broken RENAME TO leads');
  }
});
await test('after the DB recovers, submissions succeed again', async () => {
  eq((await post(leadBody({ name: 'After Recovery' }))).status, 201, 'status');
  await settle(); // let this lead's background emails finish before the next test breaks another table
});
await test('rate-limit table failure also fails closed (500, nothing saved)', async () => {
  sql('ALTER TABLE rate_limit_events RENAME TO rle_broken');
  try {
    eq((await post(leadBody({ name: 'Should Not Save 2' }))).status, 500, 'status');
  } finally {
    sql('ALTER TABLE rle_broken RENAME TO rate_limit_events');
  }
  eq(sql("SELECT COUNT(*) n FROM leads WHERE name LIKE 'Should Not Save%'")[0].n, 0, 'rows saved');
});

// ---- 7. email failure --------------------------------------------------------------------
console.log('\n[email failure + retry]');
let failLead;
await test('Resend outage: lead still saved, visitor still gets 201', async () => {
  await settle();
  mockMode = '500'; mockLog = [];
  failLead = leadBody({ name: 'Email Outage' });
  const r = await post(failLead);
  eq(r.status, 201, 'status'); eq(r.json.ok, true, 'ok');
  failLead.leadId = r.json.leadId;
  eq(sql(`SELECT COUNT(*) n FROM leads WHERE id='${failLead.leadId}'`)[0].n, 1, 'lead retained');
});
await test('failed sends stay retryable: jobs pending, attempts=1, error recorded, lead statuses pending', async () => {
  await waitFor(() => mockLog.length >= 2, 'both send attempts');
  await sleep(700);
  const jobs = sql(`SELECT status, attempts, last_error FROM email_jobs WHERE lead_id='${failLead.leadId}'`);
  eq(jobs.map((j) => [j.status, j.attempts]), [['pending', 1], ['pending', 1]], 'jobs');
  if (!/simulated Resend outage/.test(jobs[0].last_error)) throw new Error('last_error not recorded');
  eq(sql(`SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='${failLead.leadId}'`)[0], { c: 'pending', i: 'pending' }, 'lead statuses');
});
await test('cron sweep while Resend is still down: attempts increment, no success claimed', async () => {
  await sweep();
  await waitFor(() => sql(`SELECT MIN(attempts) m FROM email_jobs WHERE lead_id='${failLead.leadId}'`)[0].m === 2, 'attempts=2');
  eq(sql(`SELECT customer_email_status c FROM leads WHERE id='${failLead.leadId}'`)[0].c, 'pending', 'status');
});
await test('Resend recovers: next sweep delivers both, reusing the SAME Idempotency-Keys', async () => {
  mockMode = 'ok'; mockLog = [];
  await sweep();
  await waitFor(() => sent().length >= 2, 'recovered sends');
  eq(sent().map((e) => e.headers['idempotency-key']).sort(), [`${failLead.leadId}:customer`, `${failLead.leadId}:internal`], 'idempotency keys');
  await waitFor(() => {
    const l = sql(`SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='${failLead.leadId}'`)[0];
    return l.c === 'sent' && l.i === 'sent';
  }, 'statuses sent');
});
await test('sweep never re-sends jobs that are already sent', async () => {
  mockLog = [];
  await sweep(); await sweep();
  await sleep(1500);
  eq(mockLog.length, 0, 'unexpected re-sends');
});
await test('retries are bounded: after max_attempts (5) jobs -> failed and stay failed; lead retained', async () => {
  await settle();
  mockMode = '500'; mockLog = [];
  const r = await post(leadBody({ name: 'Always Failing' }));
  eq(r.status, 201, 'status');
  const id = r.json.leadId;
  await waitFor(() => mockLog.length >= 2, 'first attempts');
  for (let n = 0; n < 6; n++) { await sweep(); await sleep(700); }
  await waitFor(
    () => sql(`SELECT COUNT(*) n FROM email_jobs WHERE lead_id='${id}' AND status='failed' AND attempts=5`)[0].n === 2,
    'both jobs exhausted'
  );
  const callsAtExhaustion = mockLog.length;
  await sweep(); await sweep(); await sleep(1500);
  eq(mockLog.length, callsAtExhaustion, 'attempts beyond the bound');
  eq(sql(`SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='${id}'`)[0], { c: 'failed', i: 'failed' }, 'lead statuses');
  eq(sql(`SELECT COUNT(*) n FROM leads WHERE id='${id}'`)[0].n, 1, 'lead retained');
});
await test('permanent 4xx from Resend (e.g. invalid recipient): jobs fail at once, not retried', async () => {
  await settle();
  mockMode = '422'; mockLog = [];
  const r = await post(leadBody({ name: 'Bad Recipient' }));
  eq(r.status, 201, 'status');
  await waitFor(() => mockLog.length >= 2, 'attempts');
  await sleep(700);
  eq(sql(`SELECT status FROM email_jobs WHERE lead_id='${r.json.leadId}'`).map((j) => j.status), ['failed', 'failed'], 'job statuses');
  const n = mockLog.length;
  mockMode = 'ok';
  await sweep(); await sleep(1500);
  eq(mockLog.length, n, 'permanent failures were retried');
});
await test("job stuck in 'sending' (crashed invocation) is recovered by the sweep once stale, not before", async () => {
  await settle();
  mockMode = '500'; mockLog = [];
  const r = await post(leadBody({ name: 'Crash Recovery' }));
  const id = r.json.leadId;
  await waitFor(() => mockLog.length >= 2, 'attempts');
  await sleep(700);
  mockMode = 'ok'; mockLog = [];
  sql(`UPDATE email_jobs SET status='sending', updated_at='${new Date().toISOString()}' WHERE lead_id='${id}'`);
  await sweep(); await sleep(1500);
  eq(mockLog.length, 0, 'a FRESH sending row was re-sent');
  sql(`UPDATE email_jobs SET updated_at='${new Date(Date.now() - 11 * 60 * 1000).toISOString()}' WHERE lead_id='${id}'`);
  await sweep();
  await waitFor(() => sent().length >= 2, 'recovery sends');
  await waitFor(() => {
    const l = sql(`SELECT customer_email_status c, internal_email_status i FROM leads WHERE id='${id}'`)[0];
    return l.c === 'sent' && l.i === 'sent';
  }, 'statuses sent');
});
await test('no secrets or customer contact details in Worker logs', async () => {
  if (/re_TEST_NOT_A_REAL_KEY|1x0000000000000000000000000000000AA/.test(devOutput)) throw new Error('secret in logs');
  const scrubbed = devOutput.replace(/^.*(ALLOWED_ORIGINS|CUSTOMER_FROM_EMAIL|INTERNAL_NOTIFY_EMAIL|REPLY_TO_EMAIL).*$/gm, '');
  if (/555-0100|Happy Path|Email Outage|Bad Recipient/.test(scrubbed)) throw new Error('contact details in logs');
});

// ---- 8. Turnstile rejection (needs the always-FAIL test secret) ------------------------------
console.log('\n[Turnstile rejection — restarting Worker with the always-FAIL test secret]');
killDev();
await sleep(1500);
await startDev('2x0000000000000000000000000000000AA', { scheduled: false });
mockMode = 'ok'; mockLog = [];
await test('Turnstile rejects token -> 403 spam_check_failed; no lead, no email', async () => {
  const before = leadCount();
  const r = await post(leadBody({ name: 'Bot' }));
  eq(r.status, 403, 'status'); eq(r.json, { ok: false, error: 'spam_check_failed' }, 'body');
  await sleep(1000);
  eq(leadCount(), before, 'lead count unchanged');
  eq(mockLog.length, 0, 'emails sent for a rejected submission');
});
killDev();
await sleep(1000);
await startDev('', { scheduled: false }); // secret present but empty => "not configured"
await test('missing Turnstile secret fails closed -> 403 (never silently skips the check)', async () => {
  const before = leadCount();
  const r = await post(leadBody({ name: 'No Secret' }));
  eq(r.status, 403, 'status');
  eq(leadCount(), before, 'lead count unchanged');
});

// ---- summary -----------------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}: ${f.err.message}`));
await shutdown(failed.length ? 1 : 0);

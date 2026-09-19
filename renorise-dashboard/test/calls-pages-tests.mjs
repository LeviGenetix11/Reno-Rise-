// Calls pages, actions and private voicemail playback (dashboard).
//
// The REAL dashboard Worker in Node, an in-memory D1 with every migration, genuinely
// signed Access-style tokens, and a LOCAL MOCK of Twilio's recording server (checks the
// credentials it receives, supports Range). No real Twilio, no real audio, no email.
//
//   cd renorise-dashboard && node test/calls-pages-tests.mjs

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import worker from '../src/index.js';
import { freshDb } from '../../renorise-forms/test/d1-shim.mjs';
import { torontoToday } from '../src/time.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };

// ---- signed sign-in + mock Access keys ----
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const JWKS_PORT = 8871;
const jwks = createServer((rq, rs) => { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
const b64 = (x) => Buffer.from(x).toString('base64url');
function jwtFor(email = 'admin@example.test') {
  const now = Math.floor(Date.now() / 1000);
  const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64(JSON.stringify({ aud: ['aud'], iss: 'https://t.cloudflareaccess.com', exp: now + 3600, nbf: now - 5, email }))}`;
  return `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;
}
const JWT = jwtFor();

// ---- mock Twilio recording server ----
const MEDIA_PORT = 8872;
const ACCOUNT = `AC${'c'.repeat(32)}`;
const KEY_SID = `SK${'d'.repeat(32)}`;
const KEY_SECRET = 'api-key-secret-not-real';
const REC = `RE${'1'.repeat(32)}`;
const AUDIO = Buffer.from('ID3-fake-mp3-bytes-0123456789abcdefghijklmnopqrstuvwxyz'.repeat(4));
let mediaLog = [];
let mediaMode = 'ok';
const media = createServer((rq, rs) => {
  mediaLog.push({ url: rq.url, auth: rq.headers.authorization, range: rq.headers.range });
  const expected = `Basic ${Buffer.from(`${KEY_SID}:${KEY_SECRET}`).toString('base64')}`;
  if (rq.headers.authorization !== expected) { rs.writeHead(401); return rs.end('unauthorized'); }
  if (mediaMode === '500') { rs.writeHead(500); return rs.end('boom secret detail'); }
  if (rq.url !== `/2010-04-01/Accounts/${ACCOUNT}/Recordings/${REC}.mp3`) { rs.writeHead(404); return rs.end('no'); }
  const m = /^bytes=(\d+)-(\d*)$/.exec(rq.headers.range || '');
  if (m) { const a = Number(m[1]); const z = m[2] ? Number(m[2]) : AUDIO.length - 1; rs.writeHead(206, { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${a}-${z}/${AUDIO.length}`, 'Content-Length': z - a + 1 }); return rs.end(AUDIO.subarray(a, z + 1)); }
  rs.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': AUDIO.length }); rs.end(AUDIO);
});
await new Promise((r) => media.listen(MEDIA_PORT, '127.0.0.1', r));

const ORIGIN = 'https://dash.test';
const makeEnv = (db, extra = {}) => ({ DB: db, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'admin@example.test', ACCESS_CERTS_URL: `http://127.0.0.1:${JWKS_PORT}/certs`, CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789abcdef', TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_API_KEY_SID: KEY_SID, TWILIO_API_KEY_SECRET: KEY_SECRET, TWILIO_API_BASE: `http://127.0.0.1:${MEDIA_PORT}`, ...extra });
const NOW = () => new Date().toISOString();

let seq = 0;
function addCall(db, o = {}) {
  seq++;
  const id = o.id || `c${seq}`;
  const started = o.started || '2026-10-14T14:00:00.000Z';
  db.run(
    `INSERT INTO calls (id, call_sid, from_number, from_norm, caller_withheld, to_number, started_at, ended_at, duration_seconds, parent_status, forward_status, forward_answered_at, screen_outcome, accepted_at, voicemail_offered_at, recording_sid, recording_status, recording_duration_seconds, recording_confirmed_at, outcome, hangup_stage, match_status, contact_id, opportunity_id, disposition, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, `CA${String(seq).padStart(32, '0')}`, o.withheld ? null : (o.from || '+14165550100'), o.withheld ? null : (o.norm || '4165550100'), o.withheld ? 1 : 0, '+12895128112', started, o.ended === undefined ? new Date(Date.parse(started) + 60000).toISOString() : o.ended, 60, 'completed',
    o.forward || null, o.answered || null, o.screen || null, o.accepted || null, o.vmOffered || null, o.rec || null, o.recStatus || null, o.recSecs ?? null, o.recStatus === 'completed' ? started : null, o.outcome || 'missed', o.stage || (o.outcome ? null : 'ringing'),
    o.match || 'unmatched', o.contact || null, o.opp || null, o.disposition || 'open', o.notes || null, started, started
  );
  return id;
}
function seedContact(db, id, name, phone = '(416) 555-0100') { db.run("INSERT INTO contacts (id, display_name, phone, phone_norm, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?)", id, name, phone, phone.replace(/\D/g, '').slice(-10), '2026-09-01T00:00:00.000Z', 't', '2026-09-01T00:00:00.000Z'); db.run("INSERT INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?,?,?,?,?,?,?)", `i-${id}`, id, 'phone', phone, phone.replace(/\D/g, '').slice(-10), 'manual', '2026-09-01T00:00:00.000Z'); }
function seedOpp(db, id, contact, title = 'Kitchen') { db.run("INSERT INTO opportunities (id, contact_id, title, stage, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?)", id, contact, title, 'new_inquiry', '2026-09-01T00:00:00.000Z', 't', '2026-09-01T00:00:00.000Z'); }
function fresh(extra) { const db = freshDb(); return { db, env: makeEnv(db, extra) }; }

const req = (env, method, path, { jwt = JWT, form, headers = {} } = {}) => {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN } : {}), ...headers }, body }), env);
};
const get = (env, path, jwt, headers) => req(env, 'GET', path, { jwt, headers });
const text = async (env, path) => { const r = await get(env, path); eq(r.status, 200, `GET ${path}`); return r.text(); };
async function token(env) { const t = await (await get(env, '/today')).text(); const m = /name="csrf" value="([0-9a-f]{64})"/.exec(t); ok(m, 'no csrf token'); return m[1]; }
async function post(env, path, fields = {}) { return req(env, 'POST', path, { form: { csrf: await token(env), ...fields } }); }
const notice = (r) => (/[?&]notice=([a-z_]+)/.exec(r.headers.get('location') || '') || [])[1];
const loc = (r) => r.headers.get('location') || '';
const callRow = (db, id) => db.one('SELECT * FROM calls WHERE id = ?', id);

console.log('Calls pages');

console.log('\n[authorization and CSRF]');
await test('every Calls page, action and the voicemail player refuses an unauthenticated caller (401) and a non-admin (403), revealing nothing', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30 }); db.run("UPDATE calls SET notes='secret note about the customer' WHERE id=?", id);
  for (const p of ['/calls', `/calls?f=voicemail`, `/calls/${id}`, `/calls/${id}/voicemail`]) {
    const r = await get(env, p, null); eq(r.status, 401, p); const t = await r.text(); ok(!t.includes('secret note') && !t.includes('4165550100') && !/audio/i.test(r.headers.get('content-type') || ''), `leak on ${p}`);
    eq((await get(env, p, jwtFor('stranger@example.test'))).status, 403, `${p} non-admin`);
  }
  for (const s of ['notes', 'link', 'unlink', 'project', 'new-lead', 'callback', 'task', 'mark']) eq((await req(env, 'POST', `/calls/${id}/${s}`, { jwt: null, form: { csrf: 'a'.repeat(64) } })).status, 401, s);
  mediaLog = []; await get(env, `/calls/${id}/voicemail`, null); eq(mediaLog.length, 0, 'Twilio was never contacted for an unauthenticated request');
});
await test('CSRF: forged, tokenless and cross-site posts to every call action are rejected (403) and change nothing', async () => {
  const { db, env } = fresh(); const id = addCall(db, { contact: null }); seedContact(db, 'ct-a', 'Sam'); const good = await token(env); const before = JSON.stringify(callRow(db, id));
  for (const [s, f] of [['notes', { notes: 'x' }], ['link', { contact_id: 'ct-a' }], ['mark', { value: 'spam' }], ['callback', { action: 'done' }], ['new-lead', { display_name: 'X', phone: '(416) 555-0100' }], ['task', {}]]) {
    eq((await req(env, 'POST', `/calls/${id}/${s}`, { form: f })).status, 403, `${s} no token`); eq((await req(env, 'POST', `/calls/${id}/${s}`, { form: { csrf: 'f'.repeat(64), ...f } })).status, 403, `${s} bad token`);
    eq((await req(env, 'POST', `/calls/${id}/${s}`, { form: { csrf: good, ...f }, headers: { Origin: 'https://evil.example' } })).status, 403, `${s} wrong origin`); eq((await req(env, 'POST', `/calls/${id}/${s}`, { form: { csrf: good, ...f }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, `${s} cross-site`);
  }
  eq(JSON.stringify(callRow(db, id)), before, 'unchanged'); eq(db.one('SELECT COUNT(*) n FROM contacts').n, 1);
});

console.log('\n[the Calls list]');
await test('filters: callbacks needed, missed, voicemail, answered, not linked, spam; counts on the tabs; spam is hidden by default', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam Known');
  addCall(db, { id: 'm1', outcome: 'missed' }); addCall(db, { id: 'n1', outcome: 'no_message', stage: 'voicemail' }); addCall(db, { id: 'v1', outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30, contact: 'ct-a', match: 'matched' });
  addCall(db, { id: 'a1', outcome: 'accepted', accepted: '2026-10-14T14:00:05.000Z', screen: 'accepted', contact: 'ct-a', match: 'matched' }); addCall(db, { id: 's1', outcome: 'missed', disposition: 'spam' }); addCall(db, { id: 'd1', outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 9, callback_done: true });
  db.run("UPDATE calls SET callback_done_at='2026-10-14T16:00:00.000Z', callback_result='done' WHERE id='d1'");
  const ids = async (qs) => { const t = await text(env, `/calls${qs}`); return ['m1', 'n1', 'v1', 'a1', 's1', 'd1'].filter((i) => t.includes(`href="/calls/${i}"`)); };
  eq(await ids(''), ['m1', 'n1', 'v1', 'a1', 'd1'], 'default excludes spam'); eq(await ids('?f=callbacks'), ['m1', 'n1', 'v1'], 'callbacks needed excludes answered, spam and already called back'); eq(await ids('?f=missed'), ['m1', 'n1']); eq(await ids('?f=voicemail'), ['v1', 'd1']);
  eq(await ids('?f=answered'), ['a1']); eq(await ids('?f=unassigned'), ['m1', 'n1', 'd1']); eq(await ids('?f=spam'), ['s1']);
  const t = await text(env, '/calls'); ok(/Callbacks needed <span class="count">3<\/span>/.test(t) && /Missed <span class="count">2<\/span>/.test(t) && /Spam and irrelevant <span class="count">1<\/span>/.test(t), 'tab counts');
});
await test('search by phone digits (any punctuation), contact name or note; hostile text is escaped; a percent sign is literal', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-x', '<script>alert(1)</script> Evil'); addCall(db, { id: 'k1', contact: 'ct-x', match: 'matched', notes: 'asked for <b>kitchen</b> quote' }); addCall(db, { id: 'k2', from: '+19055550123', norm: '9055550123' });
  const ids = async (q) => { const t = await text(env, `/calls?q=${encodeURIComponent(q)}`); return ['k1', 'k2'].filter((i) => t.includes(`href="/calls/${i}"`)); };
  eq(await ids('905-555'), ['k2']); eq(await ids('(416) 555-0100'), ['k1']); eq(await ids('evil'), ['k1']); eq(await ids('kitchen'), ['k1']); eq(await ids('%'), []);
  for (const p of ['/calls', '/calls/k1', '/contacts/ct-x']) { const t = await text(env, p); ok(!t.includes('<script>alert') && !t.includes('<b>kitchen'), `unescaped on ${p}`); }
});
await test('times are Toronto time in winter and summer (10:00 a.m. Toronto from 15:00Z in January and 14:00Z in July)', async () => {
  const { db, env } = fresh(); addCall(db, { id: 'w1', started: '2027-01-15T15:00:00.000Z' }); addCall(db, { id: 'j1', started: '2026-07-15T14:00:00.000Z' });
  const t = await text(env, '/calls'); ok((t.match(/10:00 a\.m\./g) || []).length >= 2, 'both show 10:00 a.m.'); ok(/Jan 15, 2027/.test(t) && /Jul 15, 2026/.test(t)); ok(/10:00 a\.m\./.test(await text(env, '/calls/w1')) && /Toronto time/.test(await text(env, '/calls/w1')));
});

console.log('\n[one call: what is shown]');
await test('explicit acceptance is shown separately from what Twilio reported: a phone that "answered" without a key press says NOT accepted; a pressed 1 says accepted', async () => {
  const { db, env } = fresh(); addCall(db, { id: 'p1', outcome: 'voicemail', forward: 'completed', answered: '2026-10-14T14:00:05.000Z', screen: 'no_input', vmOffered: '2026-10-14T14:00:20.000Z', rec: REC, recStatus: 'completed', recSecs: 20 }); addCall(db, { id: 'a1', outcome: 'accepted', forward: 'completed', answered: '2026-10-14T14:00:05.000Z', screen: 'accepted', accepted: '2026-10-14T14:00:09.000Z' });
  const p = await text(env, '/calls/p1'); ok(/You accepted it<\/dt><dd>No\./.test(p) && /personal voicemail/.test(p), 'personal voicemail answering is not acceptance'); const a = await text(env, '/calls/a1'); ok(/You accepted it<\/dt><dd>Yes\. You pressed 1/.test(a), 'pressed 1');
  ok(/Twilio says/.test(p) && /completed/.test(p), 'raw Twilio status shown separately'); ok(/CA0+\d+/.test(p), 'Twilio call id shown');
});
await test('withheld and unlinked calls are shown honestly: no number invented, no contact assumed', async () => {
  const { db, env } = fresh(); addCall(db, { id: 'h1', withheld: true, match: 'withheld' }); const t = await text(env, '/calls/h1'); ok(/Withheld number/.test(t) && /Withheld\. Nothing has been guessed/.test(t) && /The caller.s number was withheld/.test(t)); ok(/Turn this call into a new lead/.test(t)); ok(!/tel:|mailto:/.test(t), 'no phone/email links invented');
});
await test('an ambiguous number lists every contact that shares it and links nothing on its own', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Alex Roe'); seedContact(db, 'ct-b', 'Alexandra Roe'); addCall(db, { id: 'x1', match: 'ambiguous' }); const t = await text(env, '/calls/x1'); ok(/Alex Roe/.test(t) && /Alexandra Roe/.test(t) && /share this number/.test(t)); eq(callRow(db, 'x1').contact_id, null);
});
await test('the voicemail player appears only when Twilio has confirmed the recording; otherwise the page says why', async () => {
  const { db, env } = fresh(); addCall(db, { id: 'v1', outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30 }); addCall(db, { id: 'u1', outcome: 'voicemail', rec: REC, recStatus: 'in-progress', recSecs: 0 });
  const v = await text(env, '/calls/v1'); ok(/<audio controls preload="none" src="\/calls\/v1\/voicemail">/.test(v), 'player'); const u = await text(env, '/calls/u1'); ok(!/<audio/.test(u) && /has not confirmed the recording/.test(u), 'no player, explains');
  const off = await text(makeEnv(db, { TWILIO_API_KEY_SECRET: undefined }), '/calls/v1'); ok(!/<audio/.test(off) && /not set up yet/.test(off), 'playback not configured is stated');
});

console.log('\n[private voicemail playback]');
await test('plays through the dashboard only: authenticated server-side fetch from Twilio, audio streamed, nothing sensitive reaches the browser', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30 }); mediaLog = [];
  const r = await get(env, `/calls/${id}/voicemail`); eq(r.status, 200); eq(r.headers.get('content-type'), 'audio/mpeg'); eq(Buffer.from(await r.arrayBuffer()).equals(AUDIO), true, 'bytes streamed');
  ok(/private/.test(r.headers.get('cache-control')) && /no-store/.test(r.headers.get('cache-control')) && r.headers.get('x-content-type-options') === 'nosniff', 'never cached, no sniffing');
  const all = JSON.stringify([...r.headers.entries()]); ok(!all.includes('twilio') && !all.includes(KEY_SECRET) && !all.includes(KEY_SID) && !all.includes(REC), 'no Twilio address, credential or recording id in the response headers');
  eq(mediaLog.length, 1); eq(mediaLog[0].url, `/2010-04-01/Accounts/${ACCOUNT}/Recordings/${REC}.mp3`); eq(mediaLog[0].auth, `Basic ${Buffer.from(`${KEY_SID}:${KEY_SECRET}`).toString('base64')}`, 'authenticated with the restricted API key');
  for (const p of [`/calls/${id}`, '/calls', '/today', `/leads`]) { const t = await text(env, p); ok(!t.includes(REC) && !t.includes('api.twilio.com') && !t.includes(KEY_SECRET) && !t.includes(KEY_SID), `nothing sensitive on ${p}`); }
});
await test('seeking works (a Range request returns 206 with the requested bytes); a malformed Range header is ignored', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30 }); mediaLog = [];
  const r = await get(env, `/calls/${id}/voicemail`, undefined, { Range: 'bytes=10-19' }); eq(r.status, 206); eq(Buffer.from(await r.arrayBuffer()).equals(AUDIO.subarray(10, 20)), true); ok(/^bytes 10-19\//.test(r.headers.get('content-range')));
  mediaLog = []; const bad = await get(env, `/calls/${id}/voicemail`, undefined, { Range: 'bytes=0-1;evil' }); eq(bad.status, 200); eq(mediaLog[0].range, undefined, 'a malformed range is not forwarded');
});
await test('only a real, confirmed recording of a real call can be played: unknown call, no recording, unconfirmed, tampered recording id, playback not configured', async () => {
  const { db, env } = fresh(); mediaLog = [];
  eq((await get(env, '/calls/nope/voicemail')).status, 404); const none = addCall(db, {}); eq((await get(env, `/calls/${none}/voicemail`)).status, 404);
  const unconf = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'in-progress' }); eq((await get(env, `/calls/${unconf}/voicemail`)).status, 404, 'unconfirmed');
  const bad = addCall(db, { outcome: 'voicemail', rec: '../../../etc/passwd', recStatus: 'completed', recSecs: 5 }); eq((await get(env, `/calls/${bad}/voicemail`)).status, 404, 'a recording id that is not a Twilio recording id is never fetched');
  const good = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 5 }); eq((await get(makeEnv(db, { TWILIO_API_KEY_SID: undefined }), `/calls/${good}/voicemail`)).status, 503, 'fails closed when credentials are missing');
  eq((await get(makeEnv(db, { TWILIO_ACCOUNT_SID: 'not-an-account' }), `/calls/${good}/voicemail`)).status, 503); eq(mediaLog.length, 0, 'Twilio was never contacted for any of these');
});
await test('Twilio problems are reported generically: wrong credentials, outage, unreachable; no detail or secret leaks', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30 });
  const wrongKey = await get(makeEnv(db, { TWILIO_API_KEY_SECRET: 'wrong' }), `/calls/${id}/voicemail`); eq(wrongKey.status, 502); ok(!(await wrongKey.text()).includes('unauthorized'), 'no upstream detail');
  mediaMode = '500'; const down = await get(env, `/calls/${id}/voicemail`); mediaMode = 'ok'; eq(down.status, 502); const t = await down.text(); ok(!t.includes('boom') && !t.includes('secret detail'), 'no upstream detail');
  eq((await get(makeEnv(db, { TWILIO_API_BASE: 'http://127.0.0.1:1' }), `/calls/${id}/voicemail`)).status, 502, 'unreachable');
});
await test('the security policy lets the page load audio from the dashboard itself only, and still allows no scripts', async () => {
  const { db, env } = fresh(); const id = addCall(db, {}); const csp = (await get(env, `/calls/${id}`)).headers.get('content-security-policy'); ok(/media-src 'self'(;|$)/.test(csp), csp); ok(/default-src 'none'/.test(csp) && !/script-src/.test(csp) && !/unsafe-inline|unsafe-eval|https:\/\/api\.twilio/.test(csp), 'still script-free'); ok(!/<script/.test(await text(env, `/calls/${id}`)));
});

console.log('\n[what you can do with a call]');
await test('link a call to a contact (by search), get ONE callback task, and unlink cleanly', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam Known', '(905) 555-0111'); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 12 });
  const s = await text(env, `/calls/${id}?q=Sam`); ok(/Sam Known/.test(s) && /Link this call/.test(s), 'search result');
  eq(notice(await post(env, `/calls/${id}/link`, { contact_id: 'ct-a' })), 'call_linked'); let c = callRow(db, id); eq([c.contact_id, c.match_status], ['ct-a', 'manual']);
  const tasks = db.rows("SELECT * FROM tasks WHERE source='call_callback'"); eq(tasks.length, 1); eq([tasks[0].contact_id, tasks[0].status], ['ct-a', 'open']); eq(notice(await post(env, `/calls/${id}/link`, { contact_id: 'ct-a' })), 'no_change'); eq(db.rows("SELECT * FROM tasks WHERE source='call_callback'").length, 1, 'still one');
  ok(/Phone call: Voicemail left/.test(await text(env, '/contacts/ct-a')) && new RegExp(`href="/calls/${id}"`).test(await text(env, '/contacts/ct-a')), 'the call is in the contact timeline, linked to its record');
  eq(notice(await post(env, `/calls/${id}/unlink`, {})), 'call_unlinked'); c = callRow(db, id); eq([c.contact_id, c.task_id], [null, null]); eq(db.one("SELECT status FROM tasks WHERE source='call_callback'").status, 'cancelled', 'the callback task was cancelled');
  eq(notice(await post(env, `/calls/${id}/link`, { contact_id: 'nope' })), 'not_found'); eq(notice(await post(env, `/calls/${id}/link`, { contact_id: 'ct-a; DROP TABLE calls' })), 'not_found');
});
await test('attach to a project: only that contact\'s projects; an accepted call counts as recorded human contact for the project', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam'); seedContact(db, 'ct-b', 'Other', '(905) 555-0000'); seedOpp(db, 'op-a', 'ct-a'); seedOpp(db, 'op-b', 'ct-b'); const id = addCall(db, { outcome: 'accepted', accepted: '2026-10-14T14:00:09.000Z', screen: 'accepted', contact: 'ct-a', match: 'matched' });
  eq(notice(await post(env, `/calls/${id}/project`, { opportunity_id: 'op-b' })), 'not_found', 'another contact\'s project is refused'); eq(notice(await post(env, `/calls/${id}/project`, { opportunity_id: 'op-a' })), 'call_attached');
  eq(db.one("SELECT first_contact_at f FROM opportunities WHERE id='op-a'").f, '2026-10-14T14:00:00.000Z', 'recorded contact time is the call time'); ok(/Phone call: Answered/.test(await text(env, '/leads/op-a')), 'in the project timeline');
  const vm = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 9, contact: 'ct-b', match: 'matched' }); await post(env, `/calls/${vm}/project`, { opportunity_id: 'op-b' }); eq(db.one("SELECT first_contact_at f FROM opportunities WHERE id='op-b'").f, null, 'a voicemail left BY the customer is not staff contact');
});
await test('turn a call into a new lead: only what Twilio and you supply; no email invented; nothing emailed; the call is linked', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 20, started: '2026-10-14T14:00:00.000Z' }); const jobs = db.one('SELECT COUNT(*) n FROM email_jobs').n;
  const r = await post(env, `/calls/${id}/new-lead`, { display_name: 'Pat Caller', renovation_type: 'Basement', description: 'Wants a basement suite (from the voicemail)', phone: '(416) 555-0100', priority: 'normal' }); eq(notice(r), 'call_lead_created'); const oppId = loc(r).split('?')[0].split('/').pop();
  const c = callRow(db, id); eq([c.match_status, c.opportunity_id], ['manual', oppId]); ok(c.contact_id, 'linked'); const ct = db.one('SELECT * FROM contacts WHERE id = ?', c.contact_id); eq([ct.display_name, ct.email, ct.phone_norm], ['Pat Caller', null, '4165550100']);
  const lead = db.one('SELECT * FROM leads WHERE opportunity_id = ?', oppId); eq([lead.source, lead.email, lead.created_at, lead.customer_email_status], ['phone', '', '2026-10-14T14:00:00.000Z', 'not_applicable']); eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, jobs, 'no email queued');
  eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 0, 'not enrolled in any sequence'); eq(notice(await post(env, `/calls/${id}/new-lead`, { display_name: 'Again', phone: '(416) 555-0100' })), 'call_already_linked'); eq(db.one('SELECT COUNT(*) n FROM contacts').n, 1, 'no duplicate contact');
  const h = addCall(db, { withheld: true, match: 'withheld' }); eq(notice(await post(env, `/calls/${h}/new-lead`, { display_name: 'No Way To Reach' })), 'contact_needs_email_or_phone', 'a withheld caller needs a phone or email you supply'); eq(notice(await post(env, `/calls/${h}/new-lead`, { display_name: '', phone: '(416) 555-0199' })), 'contact_name');
  eq(notice(await post(env, `/calls/${h}/new-lead`, { display_name: 'Learned From Voicemail', phone: '(416) 555-0199' })), 'call_lead_created'); eq(callRow(db, h).from_number, null, 'the call itself still records the number as withheld');
});
await test('spam and irrelevant: hidden from the list, callbacks, Today and alerts; a callback task is cancelled; nothing is deleted; reversible', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam'); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 10, contact: 'ct-a', match: 'matched' }); await post(env, `/calls/${id}/task`, {}); ok(/Phone calls to return/.test(await text(env, '/today')), 'on Today first');
  eq(notice(await post(env, `/calls/${id}/mark`, { value: 'spam' })), 'call_marked'); ok(!new RegExp(`href="/calls/${id}"`).test(await text(env, '/calls')) && new RegExp(`href="/calls/${id}"`).test(await text(env, '/calls?f=spam')), 'moved to the spam filter'); ok(!/Phone calls to return/.test(await text(env, '/today')), 'off Today');
  eq(db.one("SELECT status FROM tasks WHERE source='call_callback'").status, 'cancelled'); eq(db.one('SELECT COUNT(*) n FROM calls').n, 1, 'not deleted'); eq(notice(await post(env, `/calls/${id}/mark`, { value: 'irrelevant' })), 'call_marked'); eq(notice(await post(env, `/calls/${id}/mark`, { value: 'wat' })), 'bad_request');
  eq(notice(await post(env, `/calls/${id}/mark`, { value: 'open' })), 'call_reopened'); ok(new RegExp(`href="/calls/${id}"`).test(await text(env, '/calls')), 'back in the list');
});
await test('callbacks: mark done or "no callback needed", reopen; finishing the callback TASK also closes the call\'s callback', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam'); const a = addCall(db, { outcome: 'missed', contact: 'ct-a', match: 'matched' }); const b = addCall(db, { outcome: 'missed' }); await post(env, `/calls/${a}/task`, {}); const taskId = callRow(db, a).task_id; ok(taskId, 'task');
  const from = await post(env, `/tasks/${taskId}/complete`, { note: 'Called, booked a consult', back: 'followups' }); eq(notice(from), 'task_done'); const c = callRow(db, a); eq([c.callback_result, c.callback_done_by], ['done', 'admin@example.test']); ok(!/Callbacks needed <span class="count">[1-9]/.test(await text(env, '/calls')) || /Callbacks needed <span class="count">1</.test(await text(env, '/calls')), 'counts update');
  eq(notice(await post(env, `/calls/${b}/callback`, { action: 'not_needed' })), 'callback_not_needed'); eq(callRow(db, b).callback_result, 'not_needed'); eq(notice(await post(env, `/calls/${b}/callback`, { action: 'reopen' })), 'callback_reopened'); eq(callRow(db, b).callback_done_at, null); eq(notice(await post(env, `/calls/${b}/callback`, { action: 'nonsense' })), 'bad_request');
  eq(notice(await post(env, `/calls/${b}/task`, {})), 'call_needs_contact', 'a callback task needs a contact');
});
await test('notes save and are escaped; overlong notes are refused', async () => {
  const { db, env } = fresh(); const id = addCall(db, {}); eq(notice(await post(env, `/calls/${id}/notes`, { notes: 'Wants <i>evening</i> calls' })), 'call_notes_saved'); ok((await text(env, `/calls/${id}`)).includes('Wants &lt;i&gt;evening&lt;/i&gt; calls')); eq(notice(await post(env, `/calls/${id}/notes`, { notes: 'x'.repeat(5001) })), 'note_long');
});
await test('Today shows phone calls to return; a call never enrolls anyone, books anything or contacts anyone', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', 'Sam'); const id = addCall(db, { outcome: 'missed', contact: 'ct-a', match: 'matched' }); ok(/Phone calls to return/.test(await text(env, '/today')));
  const counts = () => ['enrollments', 'consents', 'followup_sends', 'email_jobs', 'appointments', 'contact_permissions', 'suppressions', 'leads'].map((t) => db.one(`SELECT COUNT(*) n FROM ${t}`).n); const before = counts();
  for (const s of [['link', { contact_id: 'ct-a' }], ['mark', { value: 'spam' }], ['mark', { value: 'open' }], ['callback', { action: 'done' }], ['notes', { notes: 'n' }], ['task', {}]]) await post(env, `/calls/${id}/${s[0]}`, s[1]); eq(counts(), before, 'nothing else changed');
});
await test('no phone numbers, notes or credentials are written to the Worker logs', async () => {
  const { db, env } = fresh(); const id = addCall(db, { outcome: 'voicemail', rec: REC, recStatus: 'completed', recSecs: 30, notes: 'private note' }); const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try { mediaMode = '500'; await get(env, `/calls/${id}/voicemail`); mediaMode = 'ok'; await get(makeEnv(db, { TWILIO_API_KEY_SECRET: 'wrong' }), `/calls/${id}/voicemail`); await get(makeEnv(db, { TWILIO_API_BASE: 'http://127.0.0.1:1' }), `/calls/${id}/voicemail`); await req(env, 'POST', `/calls/${id}/mark`, { form: { value: 'spam' } }); } finally { console.log = orig; }
  const all = logs.join('\n'); ok(logs.length > 0, 'problems were logged'); ok(!all.includes('4165550100') && !all.includes('private note') && !all.includes(KEY_SECRET) && !all.includes(KEY_SID) && !all.includes(REC) && !all.includes(ACCOUNT), `sensitive value in logs: ${all.slice(0, 160)}`);
});

jwks.close(); media.close();
console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);

// A LOCAL preview of the dashboard you can click through in your own browser.
//
//   cd renorise-dashboard
//   npm run preview
//   then open http://127.0.0.1:8899
//
// What it does: builds a throwaway database in .wrangler/preview-state, fills it with
// MADE-UP people and activity (example.test addresses only, created through the real CRM
// code), and runs the real dashboard Worker against it. The real dashboard requires a
// Cloudflare Access sign-in, so a small proxy on your own computer adds a locally signed
// test sign-in to each request. That proxy exists only while this command is running and
// only accepts connections from this computer.
//
// It cannot reach your live database, your Cloudflare account, Resend, or any customer:
// there are no secrets involved, and nothing you click can send an email. Press Ctrl+C to
// stop; the sample data is deleted the next time you start it.

import { spawn, execFileSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { seedPreviewData } from './preview-seed.mjs';

const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const STATE = '.wrangler/preview-state';
const DEV_PORT = 8797;
const JWKS_PORT = 8826;
const PROXY_PORT = 8899;
const TARGET = `http://127.0.0.1:${DEV_PORT}`;

console.log('Building the sample database...');
if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { stdio: 'ignore' });
const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')}`);
await seedPreviewData(db);
db.close();

// A locally generated key pair signs the test sign-in; only this run's Worker trusts it.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'preview', alg: 'RS256', use: 'sig' };
const jwks = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
const b64 = (x) => Buffer.from(x).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'preview' }))}.${b64(JSON.stringify({ aud: ['preview'], iss: 'https://preview.cloudflareaccess.com', exp: now + 12 * 3600, nbf: now - 5, email: 'admin@example.test' }))}`;
const jwt = `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;

writeFileSync('.dev.vars', `ACCESS_TEAM_DOMAIN=preview.cloudflareaccess.com\nACCESS_AUD=preview\nADMIN_EMAILS=admin@example.test\nCSRF_SECRET=preview-csrf-secret-0123456789abcdef0123456789abcdef\nACCESS_CERTS_URL=http://127.0.0.1:${JWKS_PORT}/certs\n`);
const dev = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(DEV_PORT), '--ip', '127.0.0.1', '--persist-to', `${process.cwd().replace(/\\/g, '/')}/${STATE}`], { stdio: 'ignore' });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping the preview...');
  try { execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  jwks.close();
  try { rmSync('.dev.vars', { force: true }); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
dev.on('exit', () => { if (!stopping) { console.log('The dashboard process ended unexpectedly.'); stop(); } });

console.log('Starting the dashboard (about 10 to 20 seconds)...');
for (let i = 0; i < 90; i++) { try { if ((await fetch(`${TARGET}/`)).status === 401) break; } catch { /* still starting */ } await new Promise((r) => setTimeout(r, 1000)); }

// The proxy adds the test sign-in and makes the browser's Origin match what the Worker expects.
const proxy = createServer((req, res) => {
  const headers = { ...req.headers, host: `127.0.0.1:${DEV_PORT}`, 'cf-access-jwt-assertion': jwt };
  if (headers.origin) headers.origin = TARGET;
  if (headers.referer) headers.referer = headers.referer.replace(`http://127.0.0.1:${PROXY_PORT}`, TARGET);
  const up = httpRequest({ host: '127.0.0.1', port: DEV_PORT, method: req.method, path: req.url, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end('The dashboard is not responding.'); });
  req.pipe(up);
});
proxy.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Preview is running:  http://127.0.0.1:' + PROXY_PORT);
  console.log('  Sample data only. Nothing here can email anyone or reach your live data.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

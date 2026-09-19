// Simple sliding-window rate limit, enforced in D1 since this Worker
// runs on a workers.dev subdomain (not proxied through the renosrise.com
// zone), so Cloudflare's zone-level rate-limit rules never see this
// traffic. This is intentionally basic — Turnstile is the real spam
// defense; this just stops raw request flooding.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

export async function isRateLimited(db, ipHash) {
  const windowStart = Date.now() - WINDOW_MS;
  const row = await db
    .prepare('SELECT COUNT(*) AS cnt FROM rate_limit_events WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, windowStart)
    .first();
  return (row?.cnt ?? 0) >= MAX_REQUESTS_PER_WINDOW;
}

export async function recordRequest(db, ipHash) {
  await db
    .prepare('INSERT INTO rate_limit_events (ip_hash, created_at) VALUES (?, ?)')
    .bind(ipHash, Date.now())
    .run();
}

/** Housekeeping: delete rate-limit rows older than the window. Called from the cron sweep. */
export async function pruneOldEvents(db) {
  const cutoff = Date.now() - WINDOW_MS;
  await db.prepare('DELETE FROM rate_limit_events WHERE created_at < ?').bind(cutoff).run();
}

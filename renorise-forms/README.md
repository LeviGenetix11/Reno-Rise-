# renorise-forms — Cloudflare Worker

Lead-capture backend for the Reno Rise website: validates and saves
form submissions to D1, then sends a customer acknowledgement and an
internal notification via Resend. Replaces Formspree for the
homepage, Contact page, and `/assessment/` page forms.

Status: migration applied to the remote database; Worker code passes the
isolated local test suite (Section 3a). See Section 5 for the checklist of
what has and hasn't been verified against the real services.

---

## 0. One-time setup

Run these from **this folder** (`renorise-forms/`), not the repo root.

```bash
npm install
npx wrangler login
```

`wrangler login` opens a browser to authorize the CLI against your
Cloudflare account — this needs to be the account that owns the
`renorise-forms` Worker and `renorise-leads` D1 database already
referenced in `wrangler.toml`.

### D1 database ID

`wrangler.toml` already contains the real ID for `renorise-leads`
(`debd2c89-e46b-4585-9693-0f83f35cb0de`), confirmed against
`npx wrangler d1 list`. If you ever need to look it up again, run that
command or check Cloudflare dashboard -> Workers & Pages -> D1.

### Verify the existing Worker's D1 binding name

The Worker needs a binding named exactly `DB` (that's what
`src/index.js` expects via `env.DB`). Check what's already configured
on the live Worker:

```bash
npx wrangler deployments list --name renorise-forms
```

or open the Cloudflare dashboard → Workers & Pages → **renorise-forms**
→ Settings → Bindings, and confirm there's a D1 binding. If one already
exists under a **different** name, tell me the actual name and I'll
update `wrangler.toml` to match — don't rename it on the dashboard side,
since `wrangler deploy` will apply whatever this repo's `wrangler.toml`
says and I want it to match reality, not silently overwrite something.

If no D1 binding exists yet on the Worker at all, that's fine —
`wrangler deploy` will create it from `wrangler.toml` on first deploy,
attaching to the existing `renorise-leads` database (not creating a new
one, since we're pointing at its real ID).

---

## 1. Set secrets

`RESEND_API_KEY` should already be set on the Worker per your setup —
verify it's there without ever printing its value:

```bash
npx wrangler secret list --name renorise-forms
```

This lists secret **names** only, never values. Confirm `RESEND_API_KEY`
appears. If it's missing, set it yourself (I will never ask you to paste
a secret value into chat):

```bash
npx wrangler secret put RESEND_API_KEY --name renorise-forms
```

### New secret: Turnstile

You'll need a Cloudflare Turnstile widget for this form (separate from
your Cloudflare account login — Turnstile is Cloudflare's free CAPTCHA
replacement):

1. Cloudflare dashboard → **Turnstile** → **Add a site**.
2. Domain: `renosrise.com` (add `www.renosrise.com` too if it asks for
   a list).
3. Widget mode: **Managed** (the standard, least-friction option).
4. After creating it, you'll see two keys:
   - **Site Key** (public — safe to paste back to me, or straight into
     `renorise-forms/../js/assessment-form.js`, see below).
   - **Secret Key** (private — do **not** paste this in chat). Set it
     directly:
     ```bash
     npx wrangler secret put TURNSTILE_SECRET_KEY --name renorise-forms
     ```

Once you have the **Site Key**, give it to me (or drop it into
`js/assessment-form.js` yourself at the `TURNSTILE_SITE_KEY` constant —
see the frontend section) so the widget actually renders on the live
forms.

---

## 2. Run the database migration

Always apply locally first and sanity-check, then apply remotely.

```bash
# Local (creates a local SQLite file wrangler uses for `wrangler dev`)
npx wrangler d1 migrations apply renorise-leads --local

# Remote — this touches your real, existing renorise-leads database.
# The migration only uses CREATE TABLE/INDEX IF NOT EXISTS, so it's
# safe to run even if the database already has other tables in it.
npx wrangler d1 migrations apply renorise-leads --remote
```

Verify the tables exist:

```bash
npx wrangler d1 execute renorise-leads --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

You should see `leads`, `email_jobs`, and `rate_limit_events` in the
output (alongside any pre-existing tables, untouched).

---

## 3. Local testing (before touching the live Worker)

```bash
npx wrangler dev
```

This starts the Worker locally (default `http://localhost:8787`),
using the **local** D1 database from step 2. Nothing here touches
production data or sends real email unless you let a request through
to the real Resend API (it will, since `RESEND_API_KEY` is a real
secret pulled from your account even in `wrangler dev` — see the
testing checklist below for how to use your own email address for
this).

### Manual test requests

Replace `YOUR_TURNSTILE_TOKEN` with a real token — Turnstile widgets
also work against `localhost` if you added it as an allowed domain, or
you can temporarily test with the Turnstile team's [documented test
site keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
that always pass, then swap to your real key before going live.

**Successful submission:**
```bash
curl -i -X POST http://localhost:8787/api/leads \
  -H "Content-Type: application/json" \
  -H "Origin: https://renosrise.com" \
  -d '{
    "name": "Test Person",
    "email": "YOUR_OWN_EMAIL@example.com",
    "phone": "(416) 555-0100",
    "city": "Toronto",
    "renovation_type": "kitchen remodel",
    "start_timeframe": "Within 1-3 months",
    "completion_deadline": "",
    "details": "This is a test submission.",
    "source": "assessment",
    "idempotency_key": "test-key-001",
    "turnstile_token": "YOUR_TURNSTILE_TOKEN"
  }'
```
Expect `201` and `{"ok":true,"leadId":"..."}`.

**Duplicate (same idempotency_key):** run the exact same command again.
Expect another `201` with the **same** `leadId` — and confirm in D1
that only one row exists:
```bash
npx wrangler d1 execute renorise-leads --local --command "SELECT COUNT(*) FROM leads WHERE idempotency_key='test-key-001'"
```
Should return `1`, and `email_jobs` should still show exactly one
`customer` and one `internal` row for that lead (not two of each).

**Required-field validation:** omit `email` from the body. Expect
`400` with `{"ok":false,"error":"validation_failed","fields":{"email":"..."}}`.

**Spam-check failure:** send an obviously invalid `turnstile_token`
(e.g. `"bad-token"`). Expect `403` with `{"ok":false,"error":"spam_check_failed"}`.

**Rate limiting:** send 6 valid requests in a row from the same origin
within a few seconds (vary `idempotency_key` each time so they're not
just deduped). Expect the 6th to return `429`.

**Database failure:** temporarily point `binding = "DB"` at a bogus
database name in `wrangler.toml`, restart `wrangler dev`, and confirm
a submission returns `500` with `{"ok":false,"error":"server_error"}`
— then revert the config. This confirms the frontend never redirects
to the thank-you page on a real backend failure.

**Email failure with lead retained:** temporarily set
`RESEND_API_KEY` to an invalid value (`wrangler secret put
RESEND_API_KEY` with a throwaway wrong value, or override in `.dev.vars`
for local testing — see Wrangler docs on `.dev.vars`), submit a lead,
confirm you still get `201` (the lead save succeeds independently of
email), then check:
```bash
npx wrangler d1 execute renorise-leads --local --command "SELECT customer_email_status, internal_email_status FROM leads ORDER BY created_at DESC LIMIT 1"
```
Both should show `failed` (after `max_attempts` retries) or `pending`
(if still retrying), and the lead row itself must still exist. Restore
the real `RESEND_API_KEY` afterward and confirm the next scheduled
sweep or a fresh `sendPendingEmailsForLead` call clears the backlog.

---

## 3a. Automated isolated test suite

```bash
cd renorise-forms
node test/run-tests.mjs
```

Runs the real Worker under `wrangler dev` against a **throwaway local D1**
(`.wrangler/test-state`), Cloudflare's Turnstile *test* secrets, and a
local **mock Resend** server — no real email, no real keys, no production
data. It writes a temporary `.dev.vars` and deletes it afterward. Covers:
storage of every field, customer + internal emails, duplicate protection,
validation, CORS/OPTIONS/routing, rate limiting, D1 failure (→ 500, never a
success), Resend failure with retry/backoff bounds and stable
Idempotency-Keys, permanent-4xx handling, stale-`sending` recovery,
Turnstile reject / fail-closed, and log hygiene.

Requires Node 22+ (uses `node:sqlite`).

---

## 4. Deploy

Once local testing passes:

```bash
npx wrangler deploy
```

This deploys to the **existing** `renorise-forms` Worker (name match in
`wrangler.toml` — it will not create a second Worker). Confirm:

```bash
curl -i https://renorise-forms.levi-gene-ous.workers.dev/api/leads
```
(a bare GET should return `405 method_not_allowed`, confirming the
Worker is live and routing correctly)

Then re-run the same manual test requests from Section 3 against the
real URL instead of `localhost:8787`, using **your own email address**
so you can confirm:
- the customer acknowledgement actually lands in your inbox, and
- the internal notification lands at `hello@renosrise.com`.

Remember: a `201` response only confirms Resend *accepted* the email
API call, not that it was delivered — check your actual inbox (and
spam folder) to confirm delivery separately.

Check the remote database directly to confirm real rows landed:
```bash
npx wrangler d1 execute renorise-leads --remote --command "SELECT id, name, email, source, customer_email_status, internal_email_status FROM leads ORDER BY created_at DESC LIMIT 5"
```

---

## 5. Status checklist

Verified (read-only checks against the real Cloudflare account, plus local tests):
- [x] Real D1 `database_id` in `wrangler.toml` — matches `wrangler d1 list` for `renorise-leads` (database currently has 0 tables)
- [x] `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` both exist on the Worker (`wrangler secret list`, names only)
- [x] `wrangler deploy --dry-run` bundles cleanly; binding `env.DB` -> `renorise-leads`
- [x] Migration `0001_init.sql` applies cleanly to a local scratch database; duplicate-key insert verified ignored
- [x] Turnstile **site key** wired into `js/assessment-form.js`

- [x] Migration `0001_init.sql` applied to the **remote** `renorise-leads` database (by you)
- [x] Isolated local suite (`node test/run-tests.mjs`) — see Section 3a

Still to do (needs your go-ahead / a real run):
- [ ] Deploy the Worker, then run the Section 3 tests against the real URL with your own email
- [ ] Confirm both test emails actually arrive (accepted by Resend != delivered)
- [ ] Add any preview origins to `ALLOWED_ORIGINS` and the Turnstile hostname list if you want to test from a non-production URL
- [ ] Merge the `cloudflare-forms-backend` branch only after all of the above

## 6. Rollback

If something goes wrong after deploying this Worker:

- **Worker code:** `npx wrangler rollback --name renorise-forms` reverts
  to the previous deployment instantly.
- **Frontend:** the site's `main` branch still points forms at Formspree
  until you explicitly merge the `cloudflare-forms-backend` branch (see
  repo root — this Worker going live does nothing to the website by
  itself). If the frontend has already been switched over and needs to
  revert, redeploying the previous commit of `js/assessment-form.js`
  (the Formspree version) restores the old behavior immediately, since
  Formspree's form (`xqpaanag`) hasn't been deleted or altered.

# renorise-dashboard — private lead-management dashboard

Phase 1 of the RenoRise business system. A separate Cloudflare Worker that
reads and manages the **existing** leads in the `renorise-leads` D1 database.
Twilio call tracking (Phase 2) and the social content planner (Phase 3) are
not built yet.

Status: **live and merged to `main` (2026-09-19).** Deployed at
`https://renorise-dashboard.levi-gene-ous.workers.dev` behind Cloudflare Access
(team `renorise-admin.cloudflareaccess.com`, admin `levi.gene.ous@gmail.com`).
Migration 0002 is applied to production. Follow-ups, stage changes, and
assessment dates have been exercised through the real sign-in.

> **Follow-up emails:** the dashboard also has a "Follow-up emails" area (enroll with recorded permission, approval queue, previews, settings, on/off switch). See `../renorise-shared/README.md`. Not deployed yet; its switch is OFF.

---

## 1. Architecture and resource names

| Piece | Name | Notes |
|---|---|---|
| Public site | www.renosrise.com | Static HTML on Vercel. Unchanged, except one sentence on the thank-you page. |
| Public form Worker | `renorise-forms` | Saves leads, sends emails, cron retries. **Unchanged.** |
| Dashboard Worker | `renorise-dashboard` | New. Server-rendered pages, no framework, no JavaScript in the browser. |
| Database | `renorise-leads` (`debd2c89-e46b-4585-9693-0f83f35cb0de`), binding `DB` | One shared database. No second lead store. |
| Sign-in | Cloudflare Access on the Worker's `workers.dev` address | Free plan covers up to 50 users. |

Why a separate Worker: a dashboard bug or deploy can never affect form
submissions or email delivery.

Why `workers.dev` and not `dashboard.renosrise.com`: the domain's DNS is at a
parking provider (`dns-parking.com`), not Cloudflare, so a custom hostname on
the dashboard would require moving DNS. Not needed.

### How access is protected (three layers)

1. **Cloudflare Access** sits in front of the Worker's `workers.dev` URL and
   only lets the allowed sign-in email through.
2. **The Worker verifies the Access token itself on every request**
   (`src/auth.js`): RS256 signature against the team's public keys, issuer,
   audience (this specific Access app), expiry, and that the email is in
   `ADMIN_EMAILS`. Knowing the URL, or sending a fake header, grants nothing.
3. **Fails closed:** until the three settings below are filled in, every
   request returns 503. Unknown paths, the CSV export, and form posts are all
   behind the same check; there is no unauthenticated route.

Other protections: writes are POST-only with an exact same-origin check **and**
a CSRF token (HMAC of the signed-in email with `CSRF_SECRET`, rotated daily, so
it does not depend on Access token internals); all customer text is HTML-escaped by default
(`src/html.js`); strict Content-Security-Policy (no inline scripts, none used);
`no-store` caching; `noindex`; per-version preview URLs are switched off so
there is exactly one URL to protect.

### Lead stages and email status are separate

- `leads.status` is the **lead stage**: `new`, `contacted`,
  `assessment_booked`, `quote_sent`, `won`, `lost`. The public Worker already
  writes `new`, so every existing lead is valid as-is.
- Email state lives in `email_jobs` and `leads.customer_email_status` /
  `internal_email_status`. Changing a stage never touches email state.
- **Wording follows the evidence.** "Sent" in the database means Resend's API
  *accepted* the message. This dashboard does not receive delivery or bounce
  reports, so it says **"Accepted by Resend (inbox delivery not verified)"**
  and never "delivered".

### Email retry (no second scheduler)

The "Retry this email" button only works on jobs with status `failed`. It does
not send anything. It flips that one job back to `pending` and allows exactly
one more attempt (`max_attempts = attempts + 1`), using a conditional
`UPDATE ... WHERE status = 'failed'`, so double clicks, two tabs, or replayed
requests queue it once. The **existing** 15-minute cron in `renorise-forms`
then sends it with the job's original idempotency key and its existing atomic
claim. Worst-case delay is about 15 minutes (Cloudflare cron can start a
little late).

---

## 2. Configuration and secret names (never values)

Non-secret settings in `wrangler.toml` `[vars]` (committed):

| Name | Meaning |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Zero Trust team domain, e.g. `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | Application Audience (AUD) tag of the Access app |
| `ADMIN_EMAILS` | Comma-separated sign-in emails allowed to use the dashboard |

Secret (set with `wrangler secret put`, never in Git; the dashboard stays closed
(503) until it exists):

| Name | Meaning |
|---|---|
| `CSRF_SECRET` | Random value (32+ characters) used to sign form tokens. Not related to any login. |

The dashboard sends no email and needs no other keys. (`RESEND_API_KEY` and
`TURNSTILE_SECRET_KEY` stay on `renorise-forms` only.)

`ACCESS_CERTS_URL` is an optional override used only by the automated tests;
leave it unset in production.

---

## 3. Database migration

`renorise-forms/migrations/0002_dashboard.sql` (kept beside `0001` so there is
one ordered migration history for the one database). It is **additive and
non-destructive**:

- Creates tables: `contractors`, `lead_notes`, `lead_activity`, `follow_ups`.
- Adds four **nullable** columns to `leads`: `updated_at`, `archived_at`,
  `contractor_id`, `assessment_at`.
- Adds indexes. Drops, renames, rewrites, and backfills nothing; no existing
  row's data changes. The public Worker names its insert columns explicitly, so
  it is unaffected (the full public-Worker test suite passes on the migrated
  schema).

Apply it (PowerShell, from `renorise-dashboard\`):

```powershell
# 1. Local scratch copy first (safe)
npx wrangler d1 migrations apply renorise-leads --local
# 2. Production database (changes the real renorise-leads schema, additively)
npx wrangler d1 migrations apply renorise-leads --remote
```

Rollback of the migration is intentionally not automated (SQLite cannot drop
columns cleanly and the new columns are inert). Leaving it applied is harmless
if you roll back the dashboard.

Dates: stored in UTC (`created_at`, `assessment_at`, ...) or as a plain
calendar date (`follow_ups.due_on`). Everything is shown and entered in
**America/Toronto**, including across daylight-saving changes.

---

## 4. Local development (Windows / PowerShell)

Requires Node 22+ (tested on 24). One-time install, from `renorise-dashboard\`:

```powershell
npm install
```

Run the automated tests (from `renorise-dashboard\`). They start throwaway
local copies of the dashboard and the public Worker with a mock Resend server
and a mock Access key server. No real data, secrets, or email are touched:

```powershell
npm test
```

Run the public Worker's own suite (from `renorise-forms\`):

```powershell
node test\run-tests.mjs
```

There is no way to sign in to a local dashboard by hand: it accepts only a
validly signed Access token, on purpose. Use the tests, or review the deployed
preview behind Access.

---

## 5. Enable access and deploy

Do these **in order**. The dashboard stays closed (503) until the Access
values are filled in and redeployed (step 6).

1. **Confirm the administrator sign-in email** (the address that will receive
   the one-time PIN). Put it in `ADMIN_EMAILS` in `wrangler.toml`.
2. **Apply the migration** (section 3).
3. **Deploy the closed Worker** (from `renorise-dashboard\`):
   ```powershell
   npx wrangler deploy
   ```
   Every request answers 503 at this point; nothing is exposed.
4. **Turn on Cloudflare Access.** In the Cloudflare dashboard:
   Zero Trust must be enabled (Free plan, up to 50 users, choose a team name).
   Then **Workers & Pages -> renorise-dashboard -> Access tab -> Protect this
   Worker behind Access -> All traffic**, pick a policy, **Apply Access**.
   Afterwards open Zero Trust -> Access controls -> Applications -> the new
   app -> **Policies** and make sure the only Allow rule is **Emails is
   `<your admin email>`** (remove any broader default such as "all account
   members" or "everyone at a domain").
5. **Copy two values** into `wrangler.toml` `[vars]`: the team domain
   (`<team>.cloudflareaccess.com`) and the app's **AUD tag** (Zero Trust ->
   Access controls -> Applications -> Configure -> Additional settings).
6. **Redeploy** (`npx wrangler deploy`), then open the dashboard URL and sign
   in. A signed-out browser is sent to Cloudflare's sign-in page; anyone else
   who somehow reaches the Worker gets 401/403 from the Worker itself.

Cost: Workers, D1, and Access (Free plan) stay within free allowances for this
volume. Nothing paid is enabled.

### Rollback

- **Dashboard:** `npx wrangler rollback --name renorise-dashboard`, or delete
  the Worker in the dashboard. The public site and forms are separate and are
  not affected.
- **Public site copy change** (thank-you page sentence): `git revert` the
  commit that changed `assessment/thank-you.html`.
- **Git:** work is on branch `dashboard-phase-1`; `main` is untouched until you
  approve. If merged and something is wrong: `git revert <merge commit>`.

Branch history: `dashboard-phase-1` was merged into `main` with merge commit
`e43e8aa`. To undo the site-side changes: `git revert -m 1 e43e8aa`. The
dashboard Worker itself is rolled back separately (see above).

## Design (redesign, branch `dashboard-redesign`)

The dashboard UI mirrors the public website: deep slate `#14171d`, warm cream, brand orange (`#f0782a` for icons and
accents; a darker orange for buttons so white text passes WCAG AA), Plus Jakarta Sans, rounded cards, pill buttons, and
the real logo file. It is styled in `src/styles.js`, laid out in `src/html.js`, and icons are inline SVG in `src/icons.js`.

- **Navigation:** a dark sidebar with an icon per section (a scrollable icon bar at the top on phones and tablets), the
  current page highlighted, and a "Skip to content" link.
- **Summary panel** on every page: total leads, contacted leads, pending follow-ups (with an overdue count).
- **Leads:** stage tabs with live counts and colour-coded dots, filters with active ones highlighted, removable
  "Active filters" chips, and bold **Apply** and **Export CSV** buttons. Tables have zebra rows and hover highlight;
  on phones and tablets each row becomes a compact card.
- **Security policy change:** the Content-Security-Policy now also allows the Google Fonts stylesheet and font files
  (`fonts.googleapis.com`, `fonts.gstatic.com`) and `data:` images (the embedded logo). Scripts remain fully
  blocked and the pages contain no `<script>` tags. If the font cannot load, a system font is used.

Check it (Windows PowerShell, from `renorise-dashboard\`; needs Edge or Chrome, and internet for the web font):

```powershell
npm run test:design
```

It seeds a throwaway database, then checks 11 pages at phone, tablet and desktop widths for accessibility (axe-core WCAG 2
A/AA, including colour contrast), no sideways scrolling, keyboard navigation and focus rings, and the real security
policy. Screenshots are written to `design-preview\` (git-ignored).

---

## 6. Tests actually completed

All run locally against throwaway data on 2026-09-19. Nothing has yet been run
against the real Cloudflare Access sign-in, because Access is not enabled.

| Suite | Result |
|---|---|
| Dashboard (`npm test`, 64 checks) | **64/64 passed** |
| Real browser, actual forms (`npm run test:browser`, 9 checks) | **9/9 passed** |
| Existing public Worker suite on the extended schema (49 checks) | **49/49 passed** |
| Browser layout + accessibility (9 pages x 3 widths: 390, 768, 1280 px; Edge + axe-core WCAG 2.x A/AA + best practice) | **clean after 1 fix** (a wrong ARIA role on the overview tiles); no horizontal scrolling |

What the 56 dashboard checks cover: fails closed with no Access config;
401 on every route with no/expired/forged/tampered/wrong-audience/wrong-issuer/
unsigned/HS256-confusion tokens; 403 for a valid token whose email is not
allowed and for tokens with no email; CSRF (missing/foreign Origin, missing/
wrong/other-session token); search, filters, pagination; HTML/formula/SQL
hostile input; stage changes; notes; contractors; follow-ups (double-complete
safe); assessment dates across EST/EDT and both DST edge cases; archive
without deletion; CSV export (formula-injection prefixing, quoting, filters,
Toronto times); email retry (eligibility, double-click safety, one send by the
existing cron with the original idempotency key); a live public form
submission appearing in the dashboard; and no secrets/contact details in logs.

Verified in production by the owner: sign-in through Access, adding and
completing a follow-up (exactly one row), stage change, assessment date.
Not yet exercised in production: notes, contractors, archive/restore, CSV
export, email retry.

Test-environment note: the local emulator can report `SQLITE_BUSY` when two
local Workers and a test reader share one file. Production D1 does not behave
this way. The public Worker's design (job stays `pending`, cron retries) is
what the tests rely on, and it handled it correctly.

## CRM (branch `crm-stage-a`)

Contacts, projects, the pipeline, timeline, tasks and the Today view are documented in [CRM.md](CRM.md): what already existed, what changed, the migration and deploy commands, rollback, tests and open decisions. Try it locally with sample data: `npm run preview`.

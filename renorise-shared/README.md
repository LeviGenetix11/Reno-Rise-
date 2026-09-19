# Follow-up email sequence — three follow-ups over 7 days

**Status: built and tested locally on branch `followup-sequence-v2`. Not deployed. The migration is not applied. The global sending switch is OFF. No customer is enrolled.**

This adds an opt-in, manually approved follow-up sequence on top of the working
lead system. It does **not** change the immediate customer confirmation or the
internal notification to hello@renosrise.com; those keep using `email_jobs`
exactly as before and are separate from this sequence.

## Schedule

Three follow-ups, sent on **Day 1, Day 3 and Day 7** (delays of 1, 2 and 4
days), counted from the recorded call date (callers) or the inquiry date
(website leads). Times are 9:00–17:00 America/Toronto; everything is stored in UTC.

| For a website inquiry on Sep 19, 2026 | Planned |
|---|---|
| Email 1 (Day 1) | Sun Sep 20 |
| Email 2 (Day 3) | Tue Sep 22 |
| Email 3 (Day 7) | Sat Sep 26 |

After email 3 the enrollment is marked **Completed**. Nothing is ever sent after Day 7 (no Day-14, Day-21 or Day-28 messages).
A website lead therefore receives at most **5 emails in total**: 1 customer
confirmation + 1 internal notification + 3 follow-ups.

Planned dates are shown before enrolling. Late enrollment shows and **skips** dates that have
already passed (never sent late in a batch). If a send is delayed (pause, outage, quota), only
one email goes out when it can, and later dates are re-projected so the original gaps are kept
(next = the later of its original date and *previous send date + original gap*). Revised dates are shown.

If a customer asks to be contacted later, stop the sequence (reason "staff") and create a normal
lead follow-up task for their date; the sequence is never restarted automatically.

## The emails

Each email ends with the free-consultation invitation, then the signature and required footer.
No booking link, discount, testimonial, urgency, pricing, or response-time promise. Sender
`RenoRise <hello@notify.renosrise.com>`, Reply-To `hello@renosrise.com`. A missing first name falls back to "Hi there,".
Website leads are never told they called. The footer carries the legal business name and mailing
address (required by Canadian anti-spam law, entered in **Settings**; nothing sends until they exist),
the reason they are receiving it, an HTTPS unsubscribe link, and a STOP-reply option. Messages carry
`List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.

#### Email 1 (Day 1) — website inquiry

```text
Subject: Did you get the help you needed?

Hi Jamie,

Thanks for sending your renovation inquiry to RenoRise recently.
Were you able to get the issue you contacted us about taken care of, or are you still looking for help?
If you’re unsure about the next step, we’re happy to talk it through.
Reply with a convenient time to arrange a free consultation.

The RenoRise Team
hello@renosrise.com

--
[LEGAL BUSINESS NAME]
[MAILING ADDRESS]
You’re receiving this follow-up because you agreed to hear from RenoRise about your inquiry.
Unsubscribe from these follow-up emails: https://renorise-forms.levi-gene-ous.workers.dev/u/<token>
You can also reply to this email with the word STOP.
```

#### Email 1 (Day 1) — phone call

```text
Subject: Did you get the help you needed?

Hi Jamie,

Thanks for calling RenoRise recently.
Were you able to get your home issue taken care of, or are you still looking for help?
If you’re unsure about the next step, we’re happy to talk it through.
Reply with a convenient time to arrange a free consultation.

The RenoRise Team
hello@renosrise.com

--
[LEGAL BUSINESS NAME]
[MAILING ADDRESS]
You’re receiving this follow-up because you agreed to hear from RenoRise about your inquiry.
Unsubscribe from these follow-up emails: https://renorise-forms.levi-gene-ous.workers.dev/u/<token>
You can also reply to this email with the word STOP.
```

#### Email 2 (Day 3) — website inquiry and phone call

```text
Subject: Any questions about your home project?

Hi Jamie,

I wanted to see whether anything is holding up the project you contacted us about.
Is it the timing, budget, or a question about what the work might involve?
You don’t need to have every detail figured out before we talk.
Reply to arrange a free consultation so we can discuss your questions and priorities.

The RenoRise Team
hello@renosrise.com

--
[LEGAL BUSINESS NAME]
[MAILING ADDRESS]
You’re receiving this follow-up because you agreed to hear from RenoRise about your inquiry.
Unsubscribe from these follow-up emails: https://renorise-forms.levi-gene-ous.workers.dev/u/<token>
You can also reply to this email with the word STOP.
```

#### Email 3 (Day 7) — website inquiry and phone call

```text
Subject: Our last check-in—for now

Hi Jamie,

I hope you’ve been able to get the help you needed.
This is our last follow-up about your recent inquiry, so we’ll leave it with you after today.
If your plans have changed or you’re waiting for a better time, that’s completely fine.
Whenever you’re ready, reply to arrange a free consultation.

The RenoRise Team
hello@renosrise.com

--
[LEGAL BUSINESS NAME]
[MAILING ADDRESS]
You’re receiving this follow-up because you agreed to hear from RenoRise about your inquiry.
Unsubscribe from these follow-up emails: https://renorise-forms.levi-gene-ous.workers.dev/u/<token>
You can also reply to this email with the word STOP.
```

## Who can be enrolled, and when it stops

Enrollment is **manual**, from a lead's page, and requires a **recorded, explicit permission**
(method, date, note, and a confirmation box). A call or website form alone is never treated as permission.

The sequence stops (and unsent steps are cancelled) when: the customer replied, an appointment
or assessment is booked, the customer declines or unsubscribes, permission is withdrawn, the lead is
Won / Lost / Archived, staff stop it, or the address is suppressed after a permanent bounce or spam
complaint. Enrollment or the global switch can be **paused**. These are checked by the dashboard when
the change is made **and** again by the sender before every send and right after each send is claimed.

**Replies:** they land in the Hostinger mailbox hello@renosrise.com, which this system cannot read.
So every follow-up needs **manual approval** (with an "I checked the inbox" box) and staff record replies
with "Stop the sequence because… the customer replied". Automatic reply detection needs an authenticated
mailbox integration, which is not built.

## Sending budget (Resend Free plan)

Everything counts toward one shared budget: confirmations, internal notifications, follow-ups, and test
emails. Verified from Resend's docs on 2026-09-19 (they can change; re-check before relying on them): Free plan
**100 emails/day, 3,000/month, 10 requests/second**, daily reset at **UTC midnight** (8 p.m. Toronto in summer).
Defaults: up to **50 follow-up recipients/day**; a **10/day** and **150/month** reserve is kept free for
confirmations, and follow-ups wait when capacity is low. Nothing paid is enabled.

## How it works (no second processor)

| Piece | Where |
|---|---|
| Schedule, eligibility, templates, shared DB rules | `renorise-shared/` (imported by both Workers) |
| The ONE processor (approval-gated, atomic claims, idempotency keys, bounded retries) | `renorise-forms/src/followups/processor.js`, run from the **existing 15-minute cron** after the confirmation retries |
| Public one-click unsubscribe (`GET/POST /u/:token`) | `renorise-forms/src/followups/unsubscribe.js` |
| Signed Resend webhook (`POST /webhooks/resend`): bounces, complaints, delivery | `renorise-forms/src/followups/webhook.js` |
| Enrolling, approving, pausing, stopping, settings, previews, test sends | dashboard: `renorise-dashboard/src/seq-*.js` |
| Tables (additive) | `renorise-forms/migrations/0003_followup_sequence.sql` |

Confirmations use `email_jobs` (unchanged). Follow-ups use a parallel durable table, `followup_sends`,
because `email_jobs`' CHECK constraint can't be extended without rebuilding a live table.
A step whose send fails stays *queued* and **blocks later steps** until staff retry or skip it.

## Configuration

| Name | Where | Kind |
|---|---|---|
| `RESEND_WEBHOOK_SECRET` | `renorise-forms` Worker | **secret** (`whsec_…` from Resend). Until it exists the sender refuses to send follow-ups and the webhook answers 503. |
| Legal business name, mailing address, unsubscribe base URL, caps, window, switch | D1 `sequence_settings` (edited in the dashboard) | data, not secrets |

No new secret on the dashboard. `RESEND_API_KEY` stays only on `renorise-forms`.

## Existing enrollments

None exist: no earlier follow-up system was found in the repository, database, or Cloudflare account, so
there are **0 old-schedule enrollments** and nothing to migrate. Only sequence version `v2` exists. Future
schedule changes must be a new version (versions are immutable), so historical sends keep their meaning.

## Deploy (nothing is deployed yet)

Windows PowerShell; **in this order**:

1. `cd renorise-forms; npx wrangler d1 migrations apply renorise-leads --local` then `--remote` (adds tables only).
2. In Resend: **Webhooks → Add endpoint** `https://renorise-forms.levi-gene-ous.workers.dev/webhooks/resend`;
   events `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed`; copy the signing secret.
   (Webhook availability on the Free plan was not verified.)
3. `cd renorise-forms; npx wrangler secret put RESEND_WEBHOOK_SECRET` (paste at the prompt, not in chat).
4. `cd renorise-forms; npx wrangler deploy`, then `cd ../renorise-dashboard; npx wrangler deploy`.
5. Dashboard → **Follow-up emails → Settings**: enter the legal business name and mailing address. Send tests from
   **Follow-up emails** (only to hello@renosrise.com or levi.gene.ous@gmail.com). Review. Only then, if approved, turn the switch ON.

**Rollback:** turn the switch OFF (holds everything instantly); `npx wrangler rollback --name renorise-forms` /
`--name renorise-dashboard`; `git revert` the merge. The migration is additive and can stay.

## Tests actually completed (local, isolated data, simulated clock)

Run from Windows PowerShell (the directory is the folder to run it in):

| Command (directory) | What it covers | Result |
|---|---|---|
| `node test/followup-tests.mjs` (`renorise-forms`) | Schedule (Day 1/4/14, daylight-saving, late enrollment, re-projection), copy and greeting fallbacks, consent, full simulated-clock journey, approval, switches, daytime window, pause, every stop rule, unsubscribe, signed Resend webhook, duplicates/concurrency/retries/ambiguous results, shared budget, test emails, confirmations untouched | **68/68 passed** |
| `node test/sequence-pages-tests.mjs` (`renorise-dashboard`) | The real dashboard Worker with signed tokens: authorization, CSRF, every page and form, escaping of hostile input, enrolling with/without permission, approval queue, stop/pause/skip, settings, on/off switch, test emails, retry | **22/22 passed** |
| `node test/run-tests.mjs` (`renorise-forms`), existing suite | Immediate confirmations, internal notifications, retries, validation, CORS, rate limits, now running on the new code and migration 0003 | **49/49 passed** |
| `node test/run-tests.mjs` (`renorise-dashboard`), existing suite | Leads dashboard, auth, CSRF, CSV, email retry | **64/64 passed** |
| `node test/browser-check.mjs` (`renorise-dashboard`) | Real-browser form posts | **9/9 passed** |
| Accessibility and layout (axe-core WCAG 2 A/AA, 3 screen widths, 8 new or changed pages) | | **clean, no horizontal scrolling** |
| `wrangler deploy --dry-run` for both Workers | Shared modules bundle correctly | **OK** |

Bugs the tests caught, now fixed: the schedule re-projection read the wrong column name, and an error in
bookkeeping *after* a successful send was being treated as a failed send (which could have re-queued an email
that had already gone out).

**Not yet verified (needs your accounts; none of it was run):** real delivery through Resend, real Resend webhook
events, the unsubscribe headers in a real Gmail/Outlook inbox, the sign-in flow on the new dashboard pages, the
remote migration, and real test emails to hello@renosrise.com or levi.gene.ous@gmail.com (they need the Worker
deployed first).

## What is still needed from you

Confirmed by you: the schedule (**Day 1, Day 3, Day 7**), the business name ("Reno Rise"), a business address, and that
the Resend account is on the **Free** plan (the Usage page shows 3,000 a month and 100 a day) and includes Webhooks.

1. A **mailing address** for the footer. It does **not** have to be a street address or a place customers visit: the CRTC accepts a street address, a **PO box**, a rural route, or general delivery, valid for at least 60 days after each message (source: CRTC guidance on Canada's Anti-Spam Legislation). If you would rather not use a home address, a Canada Post PO box is the usual choice (a paid service; Canada Post lists prices from about $69 for 3 months, varying by location and box size; check current pricing). Also confirm that "Reno Rise" is the name you want in the footer. It is entered on the dashboard **Settings** page, stored in the database, and deliberately **not written into this Git repository** (the repository is public). The system refuses to enable customer sending (and the sender refuses to send) unless the address is a street number and name, a PO box, a rural route, or general delivery: a postal code plus city alone is not accepted. This is not legal advice.
2. Approve the migration, the deploy, and (after previews and tests) turning the switch ON.

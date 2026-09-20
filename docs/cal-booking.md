# Consultation booking (Cal.com)

Status: built on the `cal-booking` branch. **Nothing is deployed, merged or published.** The public site shows nothing
about booking until you switch it on (section 5), so no broken link can ship.

A "consultation" here is a **15-minute phone call** with RenoRise. It is not an on-site assessment and not a confirmed
contractor appointment. The database and dashboard keep it separate from on-site assessments (`leads.consultation_at` vs
`leads.assessment_at`; appointment kind `phone_consultation`).

## 1. How it fits together

```
Website /book/  ──embed──►  Cal.com (Individual, free)  ◄──►  Google Calendar (the only source of availability)
Follow-up email / thank-you button ─► /book/?r=<opaque ref>
                                      │
Cal.com ──signed webhook──► renorise-forms  POST /webhooks/calcom
                              verifies X-Cal-Signature-256 (HMAC-SHA256 of the raw body)
                              ├─ bookings / booking_events (D1)
                              ├─ match to an inquiry (or leave it for staff)
                              ├─ CRM appointment (phone_consultation) + lead consultation_at
                              └─ stop pending follow-up emails; write activity history
Dashboard ► Appointments: list + calendar, bookings to match, connection health, booking-link setting
```

- **Cal.com sends the booking emails** (confirmation, reschedule/cancel links, its default reminder). RenoRise sends no
  extra booking emails, so nothing is duplicated and nothing is added to the Resend sending budget.
- Existing inquiry confirmations and internal notifications are untouched.
- A booking never grants marketing consent. Follow-up emails still need the recorded consent and every existing stop rule.

## 2. What was verified about Cal.com, and what was not

Checked against Cal.com's official documentation while building this:

| Fact | Status |
|---|---|
| Free plan: 1 user, unlimited event types, Google Calendar and other integrations, default confirmation/reminder emails | Verified. Custom workflows, SMS and WhatsApp are paid: **not used** |
| Webhooks at *Settings → Developer → Webhooks*; events include booking created, requested, rescheduled, cancelled, rejected, no-show updated | Verified in docs |
| Signature: HMAC-SHA256 of the raw body, header `X-Cal-Signature-256`, **no timestamp** | Verified. No replay-window check is possible; replays are made harmless by idempotency and provider-timestamp ordering |
| A reschedule creates a **new** booking `uid` and carries `rescheduleUid` | Verified. Handled |
| Embed: `Cal("inline", { elementOrSelector, calLink, config })`; `"metadata[key]"` in `config` is stored on the booking | Verified in docs |
| **Webhooks are available on the free Individual plan** | **NOT confirmed.** The docs do not say. Check in your own account (section 4, step 6) before relying on this |
| Webhook retry policy | **Not documented.** The receiver is safe for retries and duplicates, but if Cal.com never retries, a failed delivery must be resent from Cal.com's delivery log (or reconciled by hand) |
| Where the booker's phone number appears in the payload | **Not documented precisely.** The receiver checks several places (any `responses` key containing "phone", the location response, `attendees[].phoneNumber`). Confirm with the test booking (section 7) |
| Whether the phone field can be made required on the free plan | **Not confirmed.** Configure it as required and check in the test booking |
| Manage link `https://app.cal.com/booking/<uid>` | Believed correct (Cal.com's own emails use it); **confirm on the test booking**. If it differs, change `manageUrlFor` in `renorise-dashboard/src/appt-db.js` |
| The embed snippet | **Compared with the snippet from your event's *Embed* dialog** (from an earlier version of the event, namespace `free-renovation-consultation`; the config now uses `reno-rise/free-renovation-consultations`, origin `https://app.cal.com`, `useSlotsViewOnSmallScreen`). `js/book.js` uses the same calls. One deliberate difference: Cal.com's snippet sets `Cal.config.forwardQueryParams = true`, which forwards *every* query parameter of `/book/` to Cal.com; it is left out so only the validated opaque reference is passed |
| Whether the event has seats turned on | **Check.** The event page showed "0 Going", which usually means *Offer seats* is on. Turn it off (event → Advanced): with seats one booking can hold several attendees and the receiver reads only the first |
| Passing the reference in the *hosted* link (not the embed) | Not documented, so the hosted fallback link does not carry it. A booking made that way is matched by email only |

**If webhooks turn out not to be on the free plan:** do not pay for anything yet. The fallback is fully supported:
Cal.com still emails you each booking, and you record it in the dashboard with *Record appointment* on the lead (kind
"Phone consultation"). That stops that lead's follow-ups, exactly as a webhook would. Cancellations and reschedules are
then done by hand too. Tell me and we decide together whether a paid plan is worth it.

## 3. Decisions to confirm with you

1. **Your real availability (confirmed by you): Monday to Friday, 9:00 to 17:00 Toronto time.** Set it in Cal.com (step 4). It was not
   taken from the website's office hours, and nothing in the repo stores availability.
2. **The follow-up sequence has three emails (Day 1, 3, 7), version v2, not four (1, 4, 8, 14).** The link is added to all
   three. If you want the four-email schedule, that is a separate change to the approved copy and timing.
3. **`/book/` is `noindex` and not in the sitemap**, because it is a thin scheduling page. Say if you want it indexed.
4. The `/book/` heading is "Book Your Free Renovation Consultation" (no trailing full stop).
5. Your message was cut off after "Preserve Cloudflare Access and CSRF checks on the…". Access and CSRF are unchanged; every
   new dashboard write goes through the existing checks and is tested. Tell me if the sentence meant something more.

## 4. Setup, step by step (you do these; nothing here needs a password, API key or secret in chat)

1. **Create the account.** cal.com → sign up → choose the free **Individual** plan. Use `hello@renosrise.com` if you want
   bookings tied to the business.
2. **Connect Google Calendar.** *Settings → Calendars → Add a calendar → Google Calendar*. Sign in **on Google's own
   page**; Cal.com never gives me your password and I never need it.
3. **Choose calendars.** Under *Check for conflicts*, tick every calendar that shows when you are busy (work and personal
   if both matter). Under *Add to calendar*, choose the one calendar new bookings should be written to.
4. **Create the event type** (*Event Types → New*):
   - Title: **Free Renovation Consultation**; URL slug e.g. `free-renovation-consultation`
   - Duration: **15 minutes**
   - Location: **Attendee phone number** (RenoRise calls them). Make it required.
   - Description: *A short phone call with RenoRise to discuss your renovation, answer initial questions, and talk through
     the next steps. We'll call the number you provide.*
   - *Limits*: **buffer after event 15 minutes**; **minimum notice 4 hours**
   - *Availability*: a schedule named e.g. "Consultation calls": **Monday to Friday, 9:00 AM to 5:00 PM**, time zone **America/Toronto**,
     assigned to this event. Check that the schedule's time zone really says Toronto: an earlier read of the page showed a 6:00 AM sample
     slot, which suggests a different zone. Show times in the booker's time zone (the default) so it is clear.
   - *Booking questions*: name and email are required. Add **Phone number** (required) if the location field does not
     collect one, and **Brief project description** (required, short text). Keep the internal id of the description as
     `notes` (Cal.com's standard "Additional notes"), which is where the receiver looks.
5. **Try it before wiring anything:** open the event's public page and book a test call from a second email address.
6. **Webhook** (*Settings → Developer → Webhooks → New*):
   - Subscriber URL: `https://renorise-forms.levi-gene-ous.workers.dev/webhooks/calcom`
   - Triggers: Booking created, Booking requested, Booking rescheduled, Booking cancelled, Booking rejected, No-show updated
   - Payload template: leave the **default**
   - Secret: generate one **on your own machine** and paste it into Cal.com's secret box; then store the *same* value in
     the Worker. In a terminal, from `renorise-forms`:
     ```powershell
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | clip
     # paste (Ctrl+V) into Cal.com's Secret box, then:
     npx wrangler secret put CAL_WEBHOOK_SECRET      # paste the same value when prompted
     ```
     (`clip` puts it on your clipboard instead of leaving it on screen. Never put it in Git, a file in the repo, or chat.)
   - If you cannot find the Webhooks page, or it says it needs a paid plan: **stop and use the fallback in section 2.**
7. Your event link is `https://cal.com/reno-rise/free-renovation-consultations` (already in the site config, section 5). Also check that *Offer seats* is off for the event (section 2).

## 5. Turning it on (after the backend is deployed and a test booking works)

1. `tools/site/booking-config.json` already holds your link (`calLink` and `hostedUrl` for `https://cal.com/reno-rise/free-renovation-consultations`).
   Change `"enabled": false` to `true`. A build with these real values was checked and works; it was then switched back.
2. `node tools/site/build.js`. This creates `/book/`, adds the button to the thank-you page and the Cal.com line to the
   privacy page. It refuses to build with placeholder or malformed values. Deploy the site (your approval).
3. Make a real test booking through the live `/book/` page. Confirm it appears in **Dashboard → Appointments**.
4. In **Appointments → Booking page in follow-up emails**, enter `https://www.renosrise.com/book/` and tick *tested*. Only
   then do follow-up emails include the "Book Your Free Consultation" button. Changing the address clears the tick.
5. Preview the emails on **Follow-up emails → Email previews** first.

## 6. Deploying (only with your approval, in this order)

The branch builds on the not-yet-merged `crm-stage-a`/`twilio-calls` code that is **already deployed to production**, so
merge order is `crm-stage-a` → `twilio-calls` → `main`, then this branch. Do not merge this branch onto `main` before them.

1. Back up: `npx wrangler d1 export renorise-leads --remote --output backup-before-0006.sql`
2. Apply the additive migration (adds columns and tables, changes no existing data):
   `cd renorise-forms; npx wrangler d1 migrations apply renorise-leads --remote`
3. Set the secret (section 4, step 6), then deploy `renorise-forms`, then `renorise-dashboard`.
4. The dashboard now needs migration 0006 for appointment actions; that is why the migration goes first. A dashboard on an
   un-migrated database shows "Database update needed" instead of failing oddly.

**Rollback:** redeploy the previous Worker versions. The migration is additive, so old code ignores the new columns and
tables; nothing needs undoing. To stop follow-ups mentioning booking, clear the address in *Appointments*. To hide the site
pages, set `"enabled": false` and rebuild.

## 7. Test-booking checklist

- [ ] Book from the live page with an email that matches a test inquiry: it appears under Appointments as *Booked through Cal.com*, in Toronto time, linked to the lead.
- [ ] The lead's follow-ups ended (reason *booked*) and its activity history shows the booking.
- [ ] The phone number and note came through (open the booking under the lead). If the phone is missing, tell me what the Cal.com payload calls it.
- [ ] Reschedule from the Cal.com email: the **same** appointment moves; nothing is cancelled.
- [ ] Cancel: the appointment shows *Cancelled in Cal.com*, a "decide whether to follow up" task appears, follow-ups did **not** restart.
- [ ] Book with a brand-new email: it shows under *Bookings to match* (or as a direct booking) and nothing was sent.
- [ ] Appointments → *Booking connection* says Working.
- [ ] Check the manage link opens the right Cal.com booking page.

## 8. How matching and safety work

- Each inquiry gets an opaque `booking_ref`. It rides on links as booking metadata `renorise_ref`. It contains no contact
  details or database id and is **only a hint**: the booker's email (or phone) must also agree, otherwise the booking goes to
  *Bookings to match*. Two open projects with the same email are also sent to staff. Nothing is merged or overwritten.
- Direct bookers with no inquiry are stored and shown; they do not get a lead, a consent record or any email.
- Only a verified webhook confirms a booking. The embed, a click or a page redirect never does.
- Duplicate deliveries are recognised by body hash. Events older than the last applied one are ignored. Cancelled and
  rescheduled bookings are never revived. A late cancel for the *old* booking of a reschedule cannot cancel the replacement.
  Two consultations for one person are handled independently.
- Cal.com owns the booking's time. The dashboard shows "Open in Cal.com" and does not let staff move or cancel a Cal.com
  booking by hand (that would leave the calendar slot taken). Staff record only the outcome (*completed*, *no-show*),
  which a later Cal.com event cannot overwrite. A Cal.com no-show flag is shown as a prompt only.
- The follow-up sender re-reads the lead immediately before every send, so a booking that lands seconds earlier still stops it.
- Logs contain no payloads, customer details, booking links or secrets. `booking_events` stores a hash and outcome only.
- The webhook secret exists only as the Worker secret `CAL_WEBHOOK_SECRET` (fails closed with 503 if it is missing).
- Cloudflare Access and the CSRF/Origin checks on the dashboard are unchanged and covered by the tests.

## 9. Tests

```
cd renorise-forms     && node test/booking-tests.mjs         # webhook, matching, reschedule/cancel, follow-up stop, links
cd renorise-dashboard && node test/appointments-tests.mjs    # Appointments screen, auth, CSRF, matching, settings
node tools/site/build.js                                     # site build + static checks (fails on placeholder values)
```
The existing suites (`run-tests.mjs`, `followup-tests.mjs`, `call-alert-tests.mjs`, the dashboard suites) still pass.

## 10. Known limits

- Provider retries, the phone-number field and the manage-link format are unconfirmed (section 2).
- There is no two-way sync: a booking changed only in Google Calendar (not through Cal.com) is not seen here.
- Reminders are Cal.com's default email only. SMS reminders are paid and are not enabled.
- The dashboard does not yet put a "bookings to match" count in the sidebar; the Appointments page shows it at the top.

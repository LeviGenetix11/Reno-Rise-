# RenoRise CRM (Stage A)

The dashboard is now a small CRM: **contacts**, **projects**, a **pipeline**, a **timeline**, **tasks**, a
**Today** view, calls and appointments. It is the same dashboard Worker (`renorise-dashboard`), the same
database (`renorise-leads`), the same sign-in (Cloudflare Access) and the same look. Nothing was rebuilt
and no second system was created.

Branch: `crm-stage-a`. **Not merged, not deployed, not pushed.** Production is untouched.

---

## 1. What already existed, and what changed

Found by reading the repository, migrations and code (not assumed):

| Area | Already existed (reused) | Stage A change |
|---|---|---|
| Public forms | `renorise-forms` Worker saves a lead and queues two emails (`email_jobs`); durable retry every 15 min | **Unchanged.** Its source files were not touched. |
| Leads | One `leads` row per form submission; stage (6 values), archive, contractor, assessment date | Each row is now an **original submission**, kept exactly as received. Each gets a **contact** and a **project** (see 2). |
| Notes / history | `lead_notes`, `lead_activity` | Still shown. New notes and every CRM change go to an append-only history (`crm_events`). |
| Follow-ups | `follow_ups` (a date and a note) | Extended into **tasks** (type, priority, time, contact/project/contractor link, completion note). Existing rows were copied with the **same ids**; the old table is untouched. |
| Assessment date | One date on the lead | Now **appointments** (phone consultation vs on-site assessment; cancel / reschedule / history). |
| Contractors | Directory, single assignment per lead | Same directory and assignment (internal only, still sends nothing). Contractor tasks added. |
| Follow-up emails | 3 opt-in emails (Day 1, 3, 7), consent, manual approval, unsubscribe, bounce handling | Same sender and rules. CRM actions now stop/pause them per project (section 6). |
| Auth / CSRF / CSV / email retry | Cloudflare Access, CSRF, formula-safe CSV, retry button | Kept and re-tested. |

Two things in the request did not match the repository:

* **The follow-up sequence is 3 emails (Day 1, 3, 7), not four on days 1/4/8/14.** That is what was built and deployed earlier, on your instruction.
* **There is no Cal.com integration in the repository** (no code, config, or database table). Bookings are therefore recorded by hand, and the `appointments` table has a `source` / `external_ref` column ready for one. There is also no telephony (Twilio) integration yet, and no private file storage (no R2 bucket).

## 2. Data model (migration `0004_crm_core.sql`, additive)

* **Submission** = the existing `leads` row. Its name, email, phone, city, project fields, source and time are never rewritten. Two nullable link columns were added (`contact_id`, `opportunity_id`).
* **Contact** (`contacts`): name, email and phone as separate fields (display value as typed; a normalised copy is used only for matching), preferred method and time, notes, tags, test flag. Editing a contact does **not** change any submission; before/after values go to the history. Old and new emails/phones stay matchable (`contact_identifiers`).
* **Project** (`opportunities`): title, type, address / city / postal code as separate fields (nothing is inferred from a postal code), scope, description, desired start and target completion (date and/or the customer's words), budget range + currency or "Not yet discussed", homeowner / decision-maker, **qualification** (Not assessed / Qualified / Not a fit + reason), **stage**, priority, first and last recorded contact, assigned contractor, marketing source and customer-reported source (separate fields), work status (separate from the sales outcome), test flag.
* One contact can have many projects. A project can hold several submissions (a repeat submission of the same project is not a new project).
* **No automatic merging.** Every existing submission becomes its own contact; if two share an email or phone they are flagged "Possible duplicate" for a person to review. (The review / link / merge flow is Stage B.)
* Manual entry (phone, referral, social media, other): needs a name and one way to reach the person. A phone-only caller gets no invented email. Saving sends nothing and creates no email job.

The migration has only `CREATE TABLE`, `CREATE INDEX`, and two `ALTER TABLE leads ADD COLUMN` (nullable). It has no `DROP`, `DELETE`, `UPDATE`, `RENAME`, or backfill; a test enforces that. The contact / project records are created by the dashboard the first time it runs, from the existing submissions (idempotent, safe if two requests race).

## 3. Stages

New inquiry, Contact attempted, In conversation, Qualified, Consultation booked, Contractor matching, Referred to contractor, Quote pending, Quote sent, Won, Lost, and **On hold** (needs a reason and a review date). **Lost** and **Not a fit** need a reason; "Other" needs a note.

**Mapping of the earlier six stages** (only unambiguous ones were converted):

| Earlier | Now |
|---|---|
| New | New inquiry |
| Quote sent | Quote sent |
| Won / Lost | Won / Lost (a lost record shows "Reason not recorded (existing record)"; no reason was invented) |
| **Contacted** | **Not converted.** Could mean Contact attempted or In conversation. Shows as "Needs a stage". |
| **Assessment booked** | **Not converted.** Could mean a phone consultation or an on-site assessment. Shows as "Needs a stage". |

Records needing a stage appear on Today, in a "Needs a stage" tab and lane, and on their own page with a banner.

The earlier six-value status is kept in step on `leads.status` (and `assessment_at`, `archived_at`, `contractor_id`) so the follow-up sender, which reads those columns before every send, and the previous dashboard version keep working unchanged.

## 4. Screens

* **Today** (`/today`): new inquiries with no recorded contact, overdue tasks, today's tasks, today's consultations and assessments (Toronto date), open leads with no next action, on-hold reviews due, quotes that may need a follow-up, quiet leads, failed emails, and records needing a stage. Thresholds are editable on the page; they are internal reminders only. Test records and archived projects are left out.
* **Leads** (`/leads`): the searchable table (kept) and a **Pipeline** board. Every card has a labelled "Move to" control, so a stage can be changed by keyboard or on a phone. Drag and drop was not added (the dashboard's security policy allows no scripts, and it is not needed). A move to Lost / On hold with no reason opens the stage form.
* **Project page** (`/leads/<id>`; old lead links still work): details, edit form, log a call, note, unified timeline, original submission(s), stage, qualification, appointments, tasks, contractor, follow-up emails, emails, archive, test flag. "Jump to" links at the top.
* **Contacts** (`/contacts`): list, profile, edit, projects, "Add another project", communication permission ledger, contact-level tasks and calls, contact-wide timeline.
* **Add an inquiry** (`/leads/new`): manual entry.
* **Follow-ups** (`/follow-ups`): the same page, now tasks (overdue / today / upcoming / finished; filter by type, priority, assignee). Assignee choice appears only when more than one staff email is signed in (today there is one).

**Timeline** entries are labelled **Recorded by staff**, **Automatic (RenoRise)**, or **Confirmed by the email provider**. "Accepted by Resend" is never worded as delivered; only a Resend delivery report produces "delivery confirmed". A call exists only because someone logged it; a tapped phone or mail link proves nothing. No inbox integration exists, so no customer replies appear; the manual "Customer replied" control is kept.

## 5. Follow-up email rules (per project, never across a customer's other projects)

* **Stopped** (and never restarted): consultation or on-site assessment recorded; stage Consultation booked, Referred, Quote pending, Quote sent, Won or Lost; qualification Not a fit; project archived; email permission withdrawn; unsubscribe / bounce / complaint (as before); a recorded customer reply or decline (as before).
* **Paused**: project put On hold. Resuming is a separate, explicit action.
* **Never restarted automatically**: cancelling or rescheduling an appointment, reopening a closed project, un-archiving. (The "stop on Referred / Quote" rule is my conservative default; see decisions.)
* **One sequence at a time per person** across all their projects and any submission sharing the email address, so generic emails cannot overlap. A project marked as a test record can only be enrolled with one of the two allowed test addresses.
* Confirmation emails are untouched and still take priority.

## 6. Applying it (Windows PowerShell)

Do this only after you approve. **Order matters: database first, then the dashboard.** The public forms Worker does not need redeploying.

```powershell
# 1. Note a restore point for the database (Cloudflare keeps these for a limited time)
cd "C:\Users\Aretha\OneDrive\Desktop\Reno Rise Site\renorise-forms"
npx wrangler d1 time-travel info renorise-leads

# 2. Apply migration 0004 (adds tables only; changes nothing existing)
npx wrangler d1 migrations list renorise-leads --remote
npx wrangler d1 migrations apply renorise-leads --remote
npx wrangler d1 execute renorise-leads --remote --command "SELECT name FROM d1_migrations ORDER BY id"

# 3. Deploy the dashboard Worker
cd "C:\Users\Aretha\OneDrive\Desktop\Reno Rise Site\renorise-dashboard"
npx wrangler deploy
```

After deploying: open the dashboard, check **Today** and **Leads**, open the record marked "Needs a stage" and choose its stage. If the dashboard is deployed before the migration it shows a "Database update needed" page (503) and changes nothing.

**Rollback**

* Dashboard code: `cd renorise-dashboard`, `npx wrangler deployments list --name renorise-dashboard`, then `npx wrangler rollback <previous-version-id> --name renorise-dashboard`. The migration can stay: it is additive and the previous version ignores it. The previous version keeps working because the older status columns are kept in step, but tasks, notes and appointments made in the new version are not shown by the old one.
* Git: `git revert -m 1 <merge commit>` after merging.
* Database (last resort): `npx wrangler d1 time-travel restore renorise-leads --bookmark=<id from step 1>`. This also discards anything received after that moment, so ask before using it.

## 7. Tests actually run

| Suite | Result |
|---|---|
| CRM data layer (`node test/crm-core-tests.mjs`) | 28 / 28 |
| CRM pages and forms, real Worker, signed sign-in (`node test/crm-pages-tests.mjs`) | 28 / 28 |
| Dashboard on real local D1 with the public form Worker (`npm test`) | 64 / 64 (updated to the new stage names, tasks and appointments) |
| Follow-up sender and stop rules (`renorise-forms`, `node test/followup-tests.mjs`) | 72 / 72 (3 new stop cases) |
| Public form Worker, both immediate emails (`renorise-forms`, `npm test`) | 49 / 49, unchanged |
| Follow-up email pages (`npm run test:sequence`) | 22 / 22 |
| Real Edge browser: forms, CSRF, keyboard-only board move (`npm run test:browser`) | 10 / 10 |
| Accessibility and layout, 20 pages x phone / tablet / desktop, keyboard, strict security policy (`npm run test:design`) | 68 / 68 |
| `wrangler deploy --dry-run`, both Workers | bundle cleanly |

These cover: existing records migrating with every relationship intact; one contact with several independent projects; duplicate suggestion without merging; forged and cross-site requests (403, nothing changes); assignment sending nothing; a recorded booking stopping only that project's emails; test records excluded from lists and counts; CSV formula safety; Toronto times across the March and November clock changes; and an append-only history (no code path edits or deletes it).

**Preview:** `cd renorise-dashboard; npm run preview`, then open `http://127.0.0.1:8899`. Made-up data only, local only, cannot email anyone. Screenshots are written to `renorise-dashboard\design-preview\` by `npm run test:design`.

## 8. Not built yet (and known limits)

Stage B: duplicate review with link / merge, contractor handoffs and quotes, contractor service / area / availability fields and match suggestions, source reporting and UTM capture (the public form does not capture UTM or referrer today), the reports, handoff and quote sections on Today. Stage C: CSV import, private file uploads, Cal.com, telephony, reply detection.

Limits today: delivery reports exist only for follow-up emails (the two immediate emails show "accepted", as before); the timeline cannot show customer replies; the assignee list is the sign-in allow-list; Today's "quiet" check uses the last recorded change.

## 9. Possible paid services

Stage A needs none: it uses the existing Worker, D1 database and Resend account, and sends no new email. Volume is far inside the free allowances; check Cloudflare's pricing page if it grows. Private uploads (Stage C) would need Cloudflare R2, which must be enabled on the account and asks for billing details even though it has a free allowance. It has **not** been enabled.

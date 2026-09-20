# RenoRise voice Worker (Twilio call tracking and business voicemail)

`renorise-voice` is the public Twilio webhook endpoint for the business number **+1 289 512 8112**.
It replaces the plain "forward to my cellphone" TwiML Bin with the same forwarding **plus** call
screening, business voicemail and call tracking in the CRM.

**Status: built and tested locally. NOT deployed. Twilio is NOT switched over.** Your working TwiML Bin
("RenoRise Call Forwarding") has not been touched and stays as the fallback and the rollback.

## What happens on a call

1. A customer calls +1 289 512 8112. Twilio asks this Worker what to do (`/voice/incoming`).
2. The Worker forwards the call to your cellphone. **Your phone shows +1 289 512 8112 as the caller ID**
   (save it as "RenoRise Business Call"). **The customer keeps hearing ringing** until the call is actually connected.
   The customer's own number is recorded in the CRM.
3. When your phone answers, **only you** hear: *"RenoRise business call. Press 1 to accept."*
4. **Press 1** and the customer is connected. This is the only thing that counts as "accepted".
   The conversation is **not** recorded. When it ends, the call ends (no voicemail).
5. **Anything else** (no answer, busy, you decline, a wrong key, no key press, or your personal voicemail answering)
   sends the **caller** to business voicemail:
   *"Thanks for calling RenoRise. We’re unable to answer right now. After the beep, please leave your name, phone number,
   and a brief description of your project. We’ll get back to you as soon as we can."*
   Up to 2 minutes. **Only the voicemail is recorded.** No transcription, no AI, no automatic SMS.
6. The call is saved as **one** customer call (the inbound call and your phone's leg together), with the result,
   whether you explicitly accepted, voicemail length, and Twilio's call IDs. It appears under **Calls** in the dashboard and in the
   contact's timeline (matched only when exactly one contact has that phone number).
7. A missed call or a finished voicemail sends **one** email alert to hello@renosrise.com (through the existing
   Resend setup, within the shared email limits) with a link to the private call record.

A phone call never enrolls anyone in an email or SMS sequence, never books anything and never touches follow-up suppression.

## What you must supply (never paste these into chat)

**Cloudflare secrets** (typed into PowerShell prompts; Wrangler stores them encrypted; they are never in Git or logs):

| Worker | Secret | Where to find it |
|---|---|---|
| renorise-voice | `TWILIO_ACCOUNT_SID` | Twilio Console home, "Account Info" (starts with `AC`) |
| renorise-voice | `TWILIO_AUTH_TOKEN` | Same place ("Auth Token"). Used ONLY to verify that requests really come from Twilio |
| renorise-voice | `FORWARD_TO_NUMBER` | Your cellphone as `+1XXXXXXXXXX`. Kept out of Git because the repository is public |
| renorise-dashboard | `TWILIO_ACCOUNT_SID` | Same account SID |
| renorise-dashboard | `TWILIO_API_KEY_SID` | Console > Account > API keys & tokens > **Create API key** (type *Standard*, name it "RenoRise voicemail playback"); copy the `SK...` SID |
| renorise-dashboard | `TWILIO_API_KEY_SECRET` | Shown **once** when you create that key. Playback uses this restricted key, not your account token |

I could not read your cellphone number from any existing configuration (your TwiML Bin lives inside Twilio), so you supply it
as the `FORWARD_TO_NUMBER` secret. I did not use any number from test leads.

```powershell
# 1. Voice Worker: install, deploy, then set its three secrets (answer each prompt; nothing is echoed)
cd "C:\Users\Aretha\OneDrive\Desktop\Reno Rise Site\renorise-voice"
npm install
npx wrangler deploy
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put FORWARD_TO_NUMBER

# 2. Dashboard: the three secrets used to play voicemails
cd "C:\Users\Aretha\OneDrive\Desktop\Reno Rise Site\renorise-dashboard"
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_API_KEY_SID
npx wrangler secret put TWILIO_API_KEY_SECRET
```

Until the voice Worker has its secrets it answers **503**, which makes Twilio use the fallback TwiML Bin, so calls keep forwarding.

## Twilio Console settings

Phone Numbers > Manage > Active numbers > **+1 289 512 8112** > Configuration > Voice Configuration
(labels can differ slightly between Console versions):

| Setting | Value |
|---|---|
| A call comes in | **Webhook**, **HTTP POST**, `https://renorise-voice.levi-gene-ous.workers.dev/voice/incoming` |
| Primary handler fails | **TwiML Bin** > "RenoRise Call Forwarding" (your existing one). Twilio uses it if the Worker errors, times out or is unconfigured |
| Call status changes | `https://renorise-voice.levi-gene-ous.workers.dev/voice/status` (HTTP POST) |

Also: Console > Voice > Settings > General > turn **on** "Enforce HTTP Basic Auth on media access" so recordings can only be fetched with credentials.
Nothing else needs configuring: the other URLs (`/voice/screen`, `/voice/screen-result`, `/voice/dial-complete`, `/voice/leg-status`,
`/voice/record-done`, `/voice/recording-status`) are given to Twilio inside the Worker's own responses.

## Rollout, in this order (nothing before you approve)

```powershell
# a. Apply the database updates (adds tables only). Run from renorise-forms.
cd "C:\Users\Aretha\OneDrive\Desktop\Reno Rise Site\renorise-forms"
npx wrangler d1 time-travel info renorise-leads          # note the restore point
npx wrangler d1 migrations list renorise-leads --remote
npx wrangler d1 migrations apply renorise-leads --remote # applies 0004 (if not yet) and 0005

# b. Deploy the dashboard (Calls section) and the forms Worker (email alerts), then the voice Worker (see above)
cd ..\renorise-dashboard ; npx wrangler deploy
cd ..\renorise-forms     ; npx wrangler deploy
```

Check the voice Worker is alive and refusing strangers (should print 403 once its secrets are set, 503 before):

```powershell
try { Invoke-WebRequest -Method Post -Uri https://renorise-voice.levi-gene-ous.workers.dev/voice/incoming -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```

**Test on real phones BEFORE switching your real number.** Either (a) buy a second, cheap Twilio number, point it at the Worker
exactly as above, and set `BUSINESS_NUMBER = "+12895128112, +1XXXXXXXXXX"` in `wrangler.toml` (the number that was called is used as
caller ID), or (b) switch the real number during a quiet time, run the checklist below, and roll back at once if anything is off.

Checklist (see "Needs a real phone call" below): call and press 1; call and let it ring; call and decline; let your personal voicemail
pick up; answer without pressing 1; hang up while it rings; hang up at the prompt; leave a voicemail; hang up during voicemail;
call with your number withheld (`*67`).

**Rollback (takes about a minute).** In the Twilio Console set "A call comes in" back to **TwiML Bin > RenoRise Call Forwarding** and save.
Calls forward exactly as before. The Worker, database tables and saved calls can stay. Or roll back the Worker code:
`npx wrangler rollback --name renorise-voice`.

## Tests

| What | Result | How to run |
|---|---|---|
| Voice Worker, simulated Twilio (signatures, every call scenario, duplicates, out of order, database failures) | 37 / 37 | `cd renorise-voice; node test/voice-tests.mjs` |
| Voice Worker in the **real Workers runtime** (`wrangler dev`) with signed requests | 5 / 5 | `node test/runtime-check.mjs` |
| Email alerts (one per call, budget, retries, failures) | 15 / 15 | `cd renorise-forms; node test/call-alert-tests.mjs` |
| Dashboard Calls pages, actions, private playback against a mock Twilio | 22 / 22 | `cd renorise-dashboard; node test/calls-pages-tests.mjs` |
| Existing suites (public forms and both immediate emails, follow-ups, CRM, dashboard, real browser, accessibility) | all still pass | see `renorise-dashboard/CRM.md` |

### Implemented and tested locally
Signature verification (Twilio's published example reproduced; wrong token, altered parameter, other URL, other Twilio account all refused);
forwarding TwiML with the business caller ID; the exact prompt and greeting; press 1 / no key / wrong key; no answer, busy, failed, declined;
your personal voicemail answering; caller hanging up while ringing, at the prompt, and during voicemail; voicemail left, hang-up with no
message, and a voicemail whose confirmation callback never arrives; duplicate and out-of-order callbacks (one call, one leg, one alert);
database failures at every step (the caller is never left in silence); withheld caller ID; phone-number matching (one contact matched,
two contacts ambiguous, none unmatched, merged contacts ignored); call notes, callbacks, spam / irrelevant; private voicemail streaming with
credentials, Range/seeking and no leak of Twilio addresses or ids; alerts through Resend with shared limits, retries and idempotency;
no sequence enrollment, appointment, consent or suppression change from any call; no phone numbers, tokens or notes in logs.

### Needs a real phone call to verify (I cannot test these without Twilio and a phone)
* That your phone shows **+1 289 512 8112** as the caller ID, and that the customer keeps hearing **ringing (not silence)** while you hear the prompt (`answerOnBridge` with a screening URL).
* Exactly what Twilio reports when the prompt ends without a 1 (the design does not depend on it: acceptance comes only from your key press).
* That the greeting and beep sound right and a 2-minute message is captured; that Twilio's recording completion callback arrives, and how soon after the call.
* That the recording can be played from the dashboard with the API key (and that "Enforce HTTP Basic Auth on media access" does not interfere).
* Whether Twilio sends the optional `DialBridged` parameter (used only as a backup signal when the database is down).
* Alerts: the 15-minute job means an alert can arrive up to about 15 minutes after a call ends.
* That the fallback TwiML Bin takes over if the Worker is deliberately broken (for example by removing a secret).

## Possible costs (please check Twilio's current pricing pages; these are rough, from memory, not quotes)
* **Twilio:** the number's monthly fee (already paid), plus per-minute voice charges. A forwarded call is billed as **two legs**: the customer's inbound call and the
  outbound call to your cellphone, for the whole conversation (roughly a cent or two per minute per leg for Canada). The prompt runs on the forwarded leg, so it adds seconds, not a third leg.
  Voicemail recordings are short (2 minutes at most) and small; Twilio keeps them until deleted (deleting is deliberately not built here).
  Nothing here uses transcription, SMS or AI services, which would cost extra.
* **Cloudflare:** one more Worker and a few database rows per call: far inside the free allowances at this volume.
* **Resend:** each alert email counts toward the same shared limit (100/day, 3,000/month on the free plan).

## Files
`src/index.js` router and handlers; `src/twilio.js` signature check and TwiML; shared logic in `../renorise-shared/calls.js` (rules) and
`calls-db.js` (database); email alerts in `../renorise-forms/src/calls/alerts.js`; the dashboard side in `../renorise-dashboard/src/calls-*.js` and `voicemail.js`;
tables in `../renorise-forms/migrations/0005_voice_calls.sql`. The number you forward to is never stored in the database or the repository.

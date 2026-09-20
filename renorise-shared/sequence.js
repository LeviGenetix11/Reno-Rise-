// Follow-up sequence definition and scheduling. Pure functions (no I/O), so the
// public forms Worker (which sends) and the dashboard (which enrolls/approves)
// use exactly the same rules, and tests can drive them with a simulated clock.
//
// VERSIONING: a sequence version is immutable once any enrollment uses it. To
// change the schedule or copy, ADD a new version below; never edit an old one,
// so historical enrollments and sends keep their meaning.
//
// SCHEDULE (v2): THREE follow-ups over 7 days, on Day 1, Day 3 and Day 7,
// counted from the recorded call date (callers) or inquiry date (website leads).
// This is separate from — and in addition to — the immediate customer
// confirmation and internal notification, so a website lead completes the whole
// journey in at most 5 emails (1 confirmation + 1 internal + 3 follow-ups).

import { addDays, torontoDateOf, torontoClock, torontoDateHourToUtcIso } from './time.js';

export const VERSIONS = {
  v2: {
    id: 'v2',
    label: 'Three follow-ups over 7 days',
    // template keys are defined in templates.js
    steps: [
      { no: 1, day: 1, template: 'checkin' },
      { no: 2, day: 3, template: 'questions' },
      { no: 3, day: 7, template: 'last' },
    ],
  },
};
export const CURRENT_VERSION = 'v2';
export const TEST_RECIPIENTS = ['hello@renosrise.com', 'levi.gene.ous@gmail.com'];

// A step whose send FAILED stays 'queued' (not terminal): later steps never go out
// while an earlier one is unresolved; staff retry it or skip it.
export const STEP_TERMINAL = ['sent', 'skipped_elapsed', 'skipped_staff', 'cancelled'];
export const SOURCE_KINDS = { website: 'Website inquiry', call: 'Phone call' };

export const DEFAULT_SETTINGS = {
  global_send_enabled: '0', // OFF until the owner approves the tested result
  followup_daily_cap: '50', // max follow-up recipients per UTC day
  account_daily_cap: '100', // Resend Free plan: 100 emails/day (UTC day)
  account_monthly_cap: '3000', // Resend Free plan: 3,000 emails/month
  confirmation_reserve: '10', // daily capacity held back for confirmations/notifications
  monthly_reserve: '150', // monthly capacity held back for confirmations/notifications
  window_start_hour: '9', // Toronto time; emails go out from this hour...
  window_end_hour: '17', // ...until (not including) this hour
  business_legal_name: '',
  business_mailing_address: '',
  unsubscribe_base_url: 'https://renorise-forms.levi-gene-ous.workers.dev',
  booking_url: '', // the public booking page, e.g. https://www.renosrise.com/book/ ; empty = no booking link in emails
  booking_link_tested: '0', // '1' once staff confirmed the link works; the link is only added to emails when this is '1'
};

export function getVersion(id) {
  const v = VERSIONS[id];
  if (!v) throw new Error(`Unknown sequence version: ${id}`);
  return v;
}

export function windowHours(settings) {
  const start = Number(settings.window_start_hour);
  const end = Number(settings.window_end_hour);
  return { start: Number.isFinite(start) ? start : 9, end: Number.isFinite(end) ? end : 17 };
}

/** True when `now` is inside the Toronto daytime sending window. */
export function inSendWindow(now, settings) {
  const { start, end } = windowHours(settings);
  const { hour } = torontoClock(now);
  return hour >= start && hour < end;
}

/**
 * Plans the steps for a new enrollment.
 *
 * Each step is planned for its Day-N calendar date (Toronto), at the start of
 * the daytime window. Steps that are already in the past are marked
 * skipped_elapsed and are NEVER sent late as a batch: a late enrollment sends
 * only what is still ahead. A step whose date is TODAY is still on if today's
 * window has not finished.
 *
 * @returns {{no:number, day:number, template:string, original_planned_for:string,
 *            planned_for:string, planned_date:string, status:'planned'|'skipped_elapsed'}[]}
 */
export function planEnrollment({ anchorIso, now = new Date(), settings, versionId = CURRENT_VERSION }) {
  const version = getVersion(versionId);
  const { start, end } = windowHours(settings);
  const anchorDate = torontoDateOf(anchorIso);
  const today = torontoDateOf(now);
  const clock = torontoClock(now);
  const windowOver = clock.hour >= end;

  return version.steps.map((s) => {
    const date = addDays(anchorDate, s.day);
    const plannedFor = torontoDateHourToUtcIso(date, start);
    const elapsed = date < today || (date === today && windowOver);
    return {
      no: s.no,
      day: s.day,
      template: s.template,
      original_planned_for: plannedFor,
      planned_for: plannedFor,
      planned_date: date,
      status: elapsed ? 'skipped_elapsed' : 'planned',
    };
  });
}

/**
 * Re-projects the remaining steps after a step is sent (or skipped), so a
 * delay (outage, pause, quota) never causes a bunch of catch-up emails and
 * spacing stays sensible.
 *
 * Rule: a step is planned for the LATER of (a) its original Day-N date and
 * (b) the previous step's actual send date plus the ORIGINAL gap between the
 * two steps. Cascades through all remaining steps.
 *
 * @param steps  all steps of the enrollment, ordered by no, each with
 *               {no, day, status, original_planned_for, planned_for, sent_at?}
 * @returns the same array with planned_for revised on steps not yet terminal
 */
export function reproject(steps, settings) {
  const { start } = windowHours(settings);
  const out = steps.map((s) => ({ ...s }));
  const dayOf = (step) => step.day ?? step.day_offset; // planned objects use .day, database rows .day_offset
  let prevDate = null; // Toronto date of the most recent sent step (or projected planned date)
  let prevDay = null;
  for (const s of out) {
    if (s.status === 'sent') {
      prevDate = torontoDateOf(s.sent_at);
      prevDay = dayOf(s);
      continue;
    }
    if (STEP_TERMINAL.includes(s.status)) continue; // skipped/cancelled: does not anchor spacing
    if (prevDate !== null) {
      const gap = dayOf(s) - prevDay;
      const spaced = torontoDateHourToUtcIso(addDays(prevDate, gap), start);
      s.planned_for = spaced > s.original_planned_for ? spaced : s.original_planned_for;
    }
    prevDate = torontoDateOf(s.planned_for);
    prevDay = dayOf(s);
  }
  return out;
}

/** The single step that may be approved/sent next: the lowest-numbered non-terminal step. */
export function nextOpenStep(steps) {
  return [...steps].sort((a, b) => a.no - b.no).find((s) => !STEP_TERMINAL.includes(s.status)) || null;
}

/** Maximum emails one website lead can ever be sent across the whole system. */
export function maxEmailsPerLead(versionId = CURRENT_VERSION) {
  return 2 + getVersion(versionId).steps.length; // confirmation + internal + follow-ups
}

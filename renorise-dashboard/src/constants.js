// Lead stages. 'new' is the value the public form Worker already writes, so
// every existing lead is already a valid stage. leads.status is the LEAD stage
// only — email delivery state lives in email_jobs and the *_email_status columns.
export const STAGES = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['assessment_booked', 'Assessment booked'],
  ['quote_sent', 'Quote sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
];
export const STAGE_KEYS = STAGES.map(([k]) => k);
export const STAGE_LABEL = Object.fromEntries(STAGES);

export const SOURCES = [
  ['homepage', 'Homepage form'],
  ['contact', 'Contact page form'],
  ['assessment', 'Assessment page form'],
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

export const PAGE_SIZE = 25;
export const EXPORT_LIMIT = 10000;

export const EMAIL_TYPE_LABEL = { customer: 'Customer confirmation', internal: 'Internal notification' };

export function stageLabel(value) {
  return STAGE_LABEL[value] || `Other (${value})`;
}

/**
 * Human label for an email job, worded by the evidence we actually have.
 * 'sent' means Resend's API ACCEPTED the message — we do not receive delivery
 * or bounce events, so we never claim the inbox received it.
 */
export function emailJobLabel(job) {
  switch (job.status) {
    case 'sent':
      return 'Accepted by Resend (inbox delivery not verified)';
    case 'sending':
      return 'Sending now';
    case 'pending':
      return job.attempts > 0
        ? `Retry scheduled (${job.attempts} of ${job.max_attempts} attempts used)`
        : 'Queued (not sent yet)';
    case 'failed':
      return `Failed after ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}`;
    default:
      return job.status;
  }
}

/** Same wording for the summary columns on the lead row (no attempt counts there). */
export function emailStatusLabel(status) {
  switch (status) {
    case 'sent':
      return 'Accepted by Resend';
    case 'pending':
      return 'Queued / retrying';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

// Eligibility rules, evaluated before EVERY follow-up send (and again right
// after a send is claimed). Two different outcomes:
//
//   STOP  - the sequence must end for good (customer replied, booked, declined,
//           unsubscribed, lead Won/Lost/Archived, permission withdrawn, address
//           suppressed after a bounce/complaint, staff stopped it).
//   DEFER - nothing is wrong with the lead, but this send must wait (paused,
//           global switch off, outside the daytime window, not yet due, not yet
//           approved, budget low, setup incomplete).

export const STOP_LABELS = {
  reply: 'Customer replied',
  booked: 'Appointment or assessment booked',
  declined: 'Customer declined',
  unsubscribed: 'Customer unsubscribed',
  withdrawn: 'Permission withdrawn',
  won: 'Lead marked Won',
  lost: 'Lead marked Lost',
  archived: 'Lead archived',
  staff: 'Stopped by staff',
  not_a_fit: 'Marked Not a fit',
  progressed: 'Project moved on (referred to a contractor or quote stage)',
  suppressed_bounce: 'Email address bounced (suppressed)',
  suppressed_complaint: 'Spam complaint (suppressed)',
  suppressed_other: 'Email address suppressed',
  lead_missing: 'Lead no longer exists',
  all_steps_elapsed: 'No steps remained (all dates already passed)',
};

const SUPPRESSION_TO_STOP = {
  unsubscribe: 'unsubscribed',
  bounce: 'suppressed_bounce',
  complaint: 'suppressed_complaint',
};

/** Reason code if the sequence must END, else null. */
export function stopReasonFor({ lead, consent, suppression }) {
  if (!lead) return 'lead_missing';
  if (suppression) return SUPPRESSION_TO_STOP[suppression.reason] || 'suppressed_other';
  if (!consent || consent.withdrawn_at) return 'withdrawn';
  if (lead.archived_at) return 'archived';
  if (lead.status === 'won') return 'won';
  if (lead.status === 'lost') return 'lost';
  if (lead.status === 'assessment_booked' || lead.assessment_at) return 'booked';
  return null;
}

/**
 * Reason code if this send must WAIT, else null.
 * @param {object} c
 * @param {object} c.enrollment
 * @param {object} c.step            the step being considered
 * @param {Date}   c.now
 * @param {object} c.settings
 * @param {boolean} c.inWindow       inside the Toronto daytime window
 * @param {object} c.budget          { ok, reason }
 * @param {boolean} c.webhookConfigured  Resend webhook secret present (bounce/complaint suppression works)
 * @param {boolean} c.businessDetailsOk  legal name + mailing address recorded
 */
export function deferReasonFor({ enrollment, step, now, settings, inWindow, budget, webhookConfigured, businessDetailsOk }) {
  if (settings.global_send_enabled !== '1') return 'global_switch_off';
  if (enrollment.status === 'paused') return 'enrollment_paused';
  if (!step.approved_at) return 'awaiting_approval';
  if (Date.parse(step.planned_for) > now.getTime()) return 'not_due_yet';
  if (!businessDetailsOk) return 'business_details_missing';
  if (!webhookConfigured) return 'webhook_not_configured';
  if (!inWindow) return 'outside_send_window';
  if (!budget.ok) return `budget_${budget.reason}`;
  return null;
}

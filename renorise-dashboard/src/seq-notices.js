// Fixed messages for the follow-up sequence pages (selected by short code; request
// input is never echoed into a page).
import { STOP_LABELS } from '../../renorise-shared/eligibility.js';

const ineligible = Object.fromEntries(
  Object.entries(STOP_LABELS).map(([code, label]) => [`not_eligible_${code}`, ['error', `This lead can’t be enrolled: ${label.toLowerCase()}.`]])
);

export const SEQ_NOTICES = {
  ...ineligible,
  step_approved: ['ok', 'Approved. It will send at the next automatic check inside the 9–5 Toronto window, only if the global follow-up switch is ON.'],
  step_skipped: ['ok', 'Step skipped. Later dates were revised.'],
  paused: ['ok', 'Sequence paused. Nothing will send until you resume it.'],
  resumed: ['ok', 'Sequence resumed.'],
  stopped: ['ok', 'Sequence stopped. Queued follow-ups were cancelled.'],
  enrolled: ['ok', 'Enrolled. Each follow-up still needs your approval when it is due.'],
  test_queued: ['ok', 'Test email queued. It is sent by the automatic check (up to 15 minutes) and only to the address you chose.'],
  settings_saved: ['ok', 'Settings saved.'],
  switch_on: ['ok', 'Follow-up sending is now ON. Approved follow-ups will send inside the daytime window.'],
  switch_off: ['ok', 'Follow-up sending is OFF.'],
  consent_unconfirmed: ['error', 'Tick the box to confirm the customer explicitly agreed to these follow-up emails. A call or form submission alone is not permission.'],
  consent_method: ['error', 'Choose how the customer gave permission.'],
  consent_date: ['error', 'Enter the date the customer gave permission (today or earlier).'],
  consent_evidence: ['error', 'Write a short note on how permission was given (at least a few words).'],
  consent_evidence_long: ['error', 'The permission note can be up to 500 characters.'],
  bad_email: ['error', 'This lead’s email address is not valid.'],
  already_enrolled: ['error', 'This lead already has an active follow-up sequence.'],
  all_steps_elapsed: ['error', 'Every follow-up date has already passed for this lead, so there is nothing left to send.'],
  call_date_required: ['error', 'Enter the date of the recorded call.'],
  call_date_future: ['error', 'The call date cannot be in the future.'],
  bad_source: ['error', 'Choose website inquiry or phone call.'],
  not_active: ['error', 'That sequence is no longer active.'],
  step_not_pending: ['error', 'That step is no longer waiting for a decision.'],
  inbox_not_checked: ['error', 'Confirm you checked the hello@renosrise.com inbox for a reply first.'],
  not_next_step: ['error', 'Only the next unsent email in a sequence can be approved.'],
  not_due_yet: ['error', 'That email is not due yet. It can be approved on or after its planned date.'],
  stopped_on_approve: ['error', 'This lead is no longer eligible, so the sequence was stopped.'],
  test_recipient: ['error', 'Test emails can only go to hello@renosrise.com or levi.gene.ous@gmail.com.'],
  bad_setting: ['error', 'One of the numbers is out of range.'],
  bad_window: ['error', 'The sending window must end after it starts.'],
  bad_base_url: ['error', 'The unsubscribe address must be a secure https:// address.'],
  business_details_missing: ['error', 'Enter the business name and a complete mailing address first (a street number and name, a PO box, a rural route, or general delivery). A postal code and city alone is not enough. They are required in every email.'],
  switch_confirm: ['error', 'Type ENABLE FOLLOW-UPS exactly to turn sending on.'],
};

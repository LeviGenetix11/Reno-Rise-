// Pure call logic shared by the voice Worker, the forms Worker's alert job and the
// dashboard. No database and no network here, so every rule can be tested directly.
//
// The one idea to keep in mind: THE CUSTOMER'S CALL AND THE FORWARDED CELLPHONE LEG
// ARE ONE CALL. Twilio reports two calls (the inbound one and the one to your phone);
// we keep the inbound call as the record and attach the phone leg to it.
//
// "Accepted" means ONE thing: you pressed 1 at the prompt. It is never inferred from
// Twilio saying the phone "answered" or the call "completed", because your personal
// voicemail can answer a call too.

import { normalizePhone } from './normalize.js';

/** Exact words spoken. Kept here so the Worker and the tests use the same text. */
export const SCREEN_PROMPT = 'RenoRise business call. Press 1 to accept.';
export const VOICEMAIL_GREETING =
  'Thanks for calling RenoRise. We’re unable to answer right now. After the beep, please leave your name, phone number, and a brief description of your project. We’ll get back to you as soon as we can.';
export const VOICEMAIL_MAX_SECONDS = 120;

/** How far along Twilio's own call statuses are. A later report never lets an earlier one overwrite it. */
export const STATUS_RANK = {
  queued: 0,
  initiated: 1,
  ringing: 2,
  'in-progress': 3,
  answered: 3,
  completed: 4,
  busy: 4,
  failed: 4,
  'no-answer': 4,
  canceled: 4,
};
export const rankOf = (status) => (Object.prototype.hasOwnProperty.call(STATUS_RANK, status) ? STATUS_RANK[status] : -1);
export const isTerminal = (status) => rankOf(status) >= 4;

/** Recording progress. `completed` always wins; `absent` / `failed` beat `in-progress`. */
export const RECORDING_RANK = { 'in-progress': 1, absent: 2, failed: 2, completed: 3 };
export const recordingRankOf = (s) => (Object.prototype.hasOwnProperty.call(RECORDING_RANK, s) ? RECORDING_RANK[s] : 0);

// ------------------------------------------------------------------ who is calling

// Values Twilio (or the carrier) puts in From when the caller hides their number.
const WITHHELD = new Set(['', 'anonymous', 'restricted', 'unavailable', 'unknown', 'private', 'blocked', 'withheld', '+266696687', '+86282452253']);

/** { withheld, number, norm } from Twilio's From value. Never invents a number. */
export function callerIdentity(from) {
  const raw = String(from ?? '').trim();
  if (WITHHELD.has(raw.toLowerCase())) return { withheld: true, number: null, norm: null };
  const norm = normalizePhone(raw);
  if (!norm) return { withheld: true, number: null, norm: null }; // something that is not a usable phone number
  return { withheld: false, number: raw, norm };
}

/** (416) 555-0100 for a North American number; anything else is shown exactly as received. */
export function formatPhoneDisplay(value) {
  const norm = normalizePhone(value);
  if (norm && /^\d{10}$/.test(norm)) return `(${norm.slice(0, 3)}) ${norm.slice(3, 6)}-${norm.slice(6)}`;
  return String(value ?? '').trim();
}

// ------------------------------------------------------------------ what happened

/**
 * The customer-facing outcome of a call, from what we have recorded so far.
 *   voicemail   - a message was left (recording confirmed by Twilio, or at least started and not reported empty)
 *   accepted    - YOU pressed 1 (a conversation)
 *   no_message  - the caller reached voicemail and hung up without leaving anything
 *   missed      - the caller was never connected and never reached voicemail (hung up while it rang or at the prompt)
 *   in_progress - not finished yet
 */
export function deriveOutcome(c) {
  const ended = isTerminal(c.parent_status) || Boolean(c.ended_at);
  const recorded = c.recording_status === 'completed' && Number(c.recording_duration_seconds || 0) >= 1;
  if (recorded) return 'voicemail';
  if (c.accepted_at) return 'accepted';
  const emptyRecording = c.recording_status === 'absent' || c.recording_status === 'failed' || (c.recording_status === 'completed' && Number(c.recording_duration_seconds || 0) < 1);
  if (c.recording_sid && !emptyRecording && c.recording_status !== 'completed') return 'voicemail'; // started, not yet confirmed
  if (c.voicemail_offered_at) return ended ? 'no_message' : 'in_progress';
  return ended ? 'missed' : 'in_progress';
}

/** Where a caller gave up, for missed calls and empty voicemails. */
export function deriveHangupStage(c, outcome = deriveOutcome(c)) {
  if (outcome === 'no_message') return 'voicemail';
  if (outcome !== 'missed') return null;
  return c.screen_outcome || c.forward_answered_at ? 'screening' : 'ringing';
}

/** Does this call need somebody to call the person back? */
export const NEEDS_CALLBACK_OUTCOMES = ['missed', 'no_message', 'voicemail'];
export const needsCallback = (c) => NEEDS_CALLBACK_OUTCOMES.includes(c.outcome) && c.disposition === 'open' && !c.callback_done_at;

/**
 * When the forwarded leg finishes, does the caller go to business voicemail or does the call end?
 *
 *   - You pressed 1 (recorded): a conversation happened, so END the call. Never voicemail after that.
 *   - You did not press 1 (recorded, including personal voicemail answering): offer business voicemail.
 *   - No record of the prompt (the database was unavailable): lean on what Twilio reports. Only a
 *     forwarded leg that ran long enough to have held a real conversation counts as one; anything
 *     else gets voicemail, because dropping a real caller is worse than an unneeded greeting.
 */
export const CONVERSATION_MIN_SECONDS = 45;
export function decideAfterDial(call, params = {}) {
  if (call && (call.accepted_at || call.screen_outcome === 'accepted')) return 'hangup';
  if (call && (call.screen_outcome === 'rejected' || call.screen_outcome === 'no_input')) return 'voicemail';
  if (String(params.DialBridged || '').toLowerCase() === 'true') return 'hangup';
  const status = String(params.DialCallStatus || '').toLowerCase();
  const seconds = Number(params.DialCallDuration || 0);
  if (status === 'completed' && seconds >= CONVERSATION_MIN_SECONDS) return 'hangup';
  return 'voicemail';
}

// ------------------------------------------------------------------ plain-language labels

export const OUTCOME_LABEL = {
  in_progress: 'In progress',
  accepted: 'Answered (you pressed 1)',
  voicemail: 'Voicemail left',
  no_message: 'Reached voicemail, no message',
  missed: 'Missed',
};

export const HANGUP_STAGE_LABEL = {
  ringing: 'The caller hung up while your phone was ringing',
  screening: 'The caller hung up before the call was accepted',
  voicemail: 'The caller hung up during voicemail without leaving a message',
};

export const MATCH_LABEL = {
  matched: 'Matched to one contact by phone number',
  ambiguous: 'More than one contact has this number',
  unmatched: 'No contact has this number',
  withheld: 'The caller’s number was withheld',
  manual: 'Linked by you',
};

/** Short explanation of the "accepted" fact, so nobody has to guess what Twilio's words mean. */
export function acceptanceText(c) {
  if (c.accepted_at) return 'Yes. You pressed 1 to accept.';
  if (c.screen_outcome === 'rejected') return 'No. A key other than 1 was pressed.';
  if (c.screen_outcome === 'no_input') return c.forward_answered_at ? 'No. The phone answered but 1 was not pressed (this can be your personal voicemail).' : 'No. Nothing was pressed.';
  if (c.forward_answered_at) return 'No. The phone answered but there was no key press, so this is not counted as accepted.';
  return 'No.';
}

export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

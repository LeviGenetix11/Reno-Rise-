// CRM vocabulary: stages, reasons, qualification, task types, call outcomes...
// Plain-language labels are the only thing shown to staff. Values are validated
// in code (see crm-db.js), so a label can change without a database migration.

export const STAGES = [
  ['new_inquiry', 'New inquiry'],
  ['contact_attempted', 'Contact attempted'],
  ['in_conversation', 'In conversation'],
  ['qualified', 'Qualified'],
  ['consultation_booked', 'Consultation booked'],
  ['contractor_matching', 'Contractor matching'],
  ['referred', 'Referred to contractor'],
  ['quote_pending', 'Quote pending'],
  ['quote_sent', 'Quote sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
  ['on_hold', 'On hold'],
];
export const STAGE_KEYS = STAGES.map(([k]) => k);
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const NEEDS_REVIEW_LABEL = 'Needs a stage (existing record)';
export const CLOSED_STAGES = ['won', 'lost'];

/**
 * How the six stages the dashboard used before this CRM map onto the new ones.
 * Only unambiguous ones are applied automatically. "Contacted" could mean
 * Contact attempted OR In conversation, and "Assessment booked" could mean a
 * phone consultation OR an on-site assessment, so those records are left for a
 * person to decide (they show up under "Needs a stage").
 */
export const LEGACY_STAGE_MAP = {
  new: 'new_inquiry',
  quote_sent: 'quote_sent',
  won: 'won',
  lost: 'lost',
  contacted: null,
  assessment_booked: null,
};

/**
 * The older six-value status kept in step on leads.status, so the follow-up
 * sender (which reads it before every send) and the previous dashboard version
 * keep working unchanged. on_hold leaves it as it was.
 */
export const LEGACY_MIRROR = {
  new_inquiry: 'new',
  contact_attempted: 'contacted',
  in_conversation: 'contacted',
  qualified: 'contacted',
  consultation_booked: 'assessment_booked',
  contractor_matching: 'contacted',
  referred: 'contacted',
  quote_pending: 'contacted',
  quote_sent: 'quote_sent',
  won: 'won',
  lost: 'lost',
};

/**
 * Stages that END the automatic follow-up emails for the project. The emails are
 * generic "did you get the help you needed?" check-ins, so once a consultation
 * is booked, the project has moved to a contractor, or it is closed, they no
 * longer apply. Stopping (never sending) is the safe default. On hold PAUSES
 * instead of stopping. Nothing here ever restarts a sequence.
 */
export const STAGE_STOPS_SEQUENCE = {
  consultation_booked: 'booked',
  referred: 'progressed',
  quote_pending: 'progressed',
  quote_sent: 'progressed',
  won: 'won',
  lost: 'lost',
};

export const LOST_REASONS = [
  ['chose_other', 'Chose another contractor or company'],
  ['price', 'Price or budget was too high'],
  ['no_response', 'Stopped responding'],
  ['cancelled', 'Project cancelled or postponed'],
  ['diy', 'Decided to do it themselves'],
  ['other', 'Other (explain in the note)'],
];
export const HOLD_REASONS = [
  ['customer_asked', 'Customer asked us to wait'],
  ['waiting_customer', 'Waiting to hear back from the customer'],
  ['waiting_contractor', 'Waiting on a contractor'],
  ['waiting_approval', 'Waiting on financing, permits or approvals'],
  ['seasonal', 'Seasonal timing'],
  ['other', 'Other (explain in the note)'],
];
export const NOT_FIT_REASONS = [
  ['outside_area', 'Outside our service area'],
  ['service_not_offered', 'Not a service we arrange'],
  ['budget_mismatch', 'Budget does not match the project'],
  ['not_decision_maker', 'Not the decision-maker or property owner'],
  ['timing', 'Timing does not work'],
  ['other', 'Other (explain in the note)'],
];
export const reasonLabel = (list, key) => (list.find(([k]) => k === key) || [])[1] || null;

export const QUALIFICATION = [
  ['not_assessed', 'Not assessed'],
  ['qualified', 'Qualified'],
  ['not_a_fit', 'Not a fit'],
];
export const QUALIFICATION_LABEL = Object.fromEntries(QUALIFICATION);

export const PRIORITIES = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES);

export const DELIVERY_STATUSES = [
  ['not_started', 'Work not started'],
  ['scheduled', 'Work scheduled'],
  ['in_progress', 'Work in progress'],
  ['completed', 'Work completed'],
  ['cancelled', 'Work cancelled'],
];
export const DELIVERY_LABEL = Object.fromEntries(DELIVERY_STATUSES);

export const CONTACT_METHODS = [
  ['', 'No preference recorded'],
  ['email', 'Email'],
  ['phone', 'Phone call'],
  ['text', 'Text message'],
];
export const METHOD_LABEL = Object.fromEntries(CONTACT_METHODS);

export const TASK_TYPES = [
  ['call', 'Call'],
  ['email', 'Email'],
  ['quote_check', 'Quote check'],
  ['contractor_check', 'Contractor check'],
  ['general', 'General task'],
];
export const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES);

export const CALL_OUTCOMES = [
  ['connected', 'Connected (spoke with them)'],
  ['no_answer', 'No answer'],
  ['voicemail', 'Left a voicemail'],
  ['wrong_number', 'Wrong number'],
  ['other', 'Other'],
];
export const CALL_OUTCOME_LABEL = Object.fromEntries(CALL_OUTCOMES);
export const CALL_DIRECTIONS = [
  ['outbound', 'I called them'],
  ['inbound', 'They called me'],
];

export const APPOINTMENT_KINDS = [
  ['phone_consultation', 'Phone consultation (initial call)'],
  ['onsite_assessment', 'On-site assessment'],
];
export const APPOINTMENT_KIND_LABEL = Object.fromEntries(APPOINTMENT_KINDS);
export const APPOINTMENT_STATUS_LABEL = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

/** Ways a submission can arrive. The first three are the public forms; the rest are manual entries. */
export const INTAKE_CHANNELS = [
  ['phone', 'Phone call'],
  ['referral', 'Referral'],
  ['social', 'Social media'],
  ['other', 'Other (manual entry)'],
];
export const MANUAL_SOURCE_KEYS = INTAKE_CHANNELS.map(([k]) => k);
export const SOURCES = [
  ['homepage', 'Homepage form'],
  ['contact', 'Contact page form'],
  ['assessment', 'Assessment page form'],
  ...INTAKE_CHANNELS.map(([k, v]) => [k, `Entered manually: ${v}`]),
];
export const SOURCE_KEYS = SOURCES.map(([k]) => k);
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

export const PERMISSION_CHANNELS = [
  ['email', 'Email'],
  ['phone', 'Phone calls'],
  ['text', 'Text messages'],
];
export const PERMISSION_CHANNEL_LABEL = Object.fromEntries(PERMISSION_CHANNELS);
export const PERMISSION_METHODS = [
  ['phone_verbal', 'Said yes on the phone'],
  ['written_reply', 'Wrote to say yes'],
  ['in_person', 'Said yes in person'],
  ['website_form', 'Ticked a box on a website form'],
  ['other', 'Other (explain)'],
];
export const PERMISSION_METHOD_LABEL = Object.fromEntries(PERMISSION_METHODS);

/** Thresholds for the Today view. Internal reminders for staff, not promises to customers. */
export const CRM_SETTING_DEFAULTS = {
  new_inquiry_hours: '24',
  stale_days: '7',
  quote_followup_days: '5',
};
export const CRM_SETTING_META = {
  new_inquiry_hours: { label: 'A new inquiry needs attention if nobody has recorded contact after (hours)', min: 1, max: 720 },
  stale_days: { label: 'An open lead is "quiet" if nothing has been recorded for (days)', min: 1, max: 365 },
  quote_followup_days: { label: 'A sent quote needs a follow-up after (days without activity)', min: 1, max: 365 },
};

export const stageLabel = (s) => STAGE_LABEL[s] || (s ? `Other (${s})` : NEEDS_REVIEW_LABEL);

/** Where the customer came from, as judged by staff. Never guessed from which form was used. */
export const MARKETING_SOURCES = [
  ['unknown', 'Unknown'],
  ['google_search', 'Google search'],
  ['google_maps', 'Google Maps / Business Profile'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['referral', 'Referral'],
  ['repeat_customer', 'Repeat customer'],
  ['other', 'Other'],
];
export const MARKETING_SOURCE_LABEL = Object.fromEntries(MARKETING_SOURCES);

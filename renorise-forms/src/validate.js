// Server-side validation for POST /api/leads. Mirrors the frontend form
// fields and requirements exactly — email and phone stay separate
// required fields, renovation_type stays free text (no enum), everything
// has a hard length cap so a malicious or broken client can't write
// arbitrarily large rows.

export const START_TIMEFRAMES = [
  'As soon as possible',
  'Within 1-3 months',
  'Within 3-6 months',
  'More than 6 months away',
  'Just exploring',
];

export const SOURCES = ['homepage', 'contact', 'assessment'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Permissive on purpose — matches the same shape the frontend already
// accepts (digits, spaces, dashes, dots, parens, optional leading +1).
const PHONE_RE = /^[+]?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validates a parsed request body.
 * Returns { ok: true, data } or { ok: false, fields: { fieldName: message } }.
 */
export function validateLead(body) {
  const fields = {};
  const data = {};

  const name = str(body.name);
  if (!name) fields.name = 'Name is required.';
  else if (name.length > 200) fields.name = 'Name is too long.';
  else data.name = name;

  const email = str(body.email);
  if (!email) fields.email = 'Email address is required.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
  else data.email = email;

  const phone = str(body.phone);
  if (!phone) fields.phone = 'Phone number is required.';
  else if (phone.length > 30 || !PHONE_RE.test(phone)) fields.phone = 'Enter a valid phone number.';
  else data.phone = phone;

  const city = str(body.city);
  if (!city) fields.city = 'City or postal code is required.';
  else if (city.length > 200) fields.city = 'City or postal code is too long.';
  else data.city = city;

  const renovationType = str(body.renovation_type);
  if (!renovationType) fields.renovation_type = 'Renovation type is required.';
  else if (renovationType.length > 300) fields.renovation_type = 'Renovation type is too long.';
  else data.renovation_type = renovationType;

  const projectTiming = str(body.start_timeframe);
  if (!projectTiming) fields.start_timeframe = 'Please choose a timeframe.';
  else if (!START_TIMEFRAMES.includes(projectTiming)) fields.start_timeframe = 'Choose one of the listed timeframes.';
  else data.project_timing = projectTiming;

  const targetDeadline = str(body.completion_deadline);
  if (targetDeadline.length > 300) fields.completion_deadline = 'That answer is too long.';
  else data.target_deadline = targetDeadline || null;

  const details = str(body.details);
  if (details.length > 5000) fields.details = 'Project details are too long.';
  else data.project_details = details || null;

  const source = str(body.source);
  if (!source) fields.source = 'Missing source.';
  else if (!SOURCES.includes(source)) fields.source = 'Invalid source.';
  else data.source = source;

  const idempotencyKey = str(body.idempotency_key);
  if (!idempotencyKey) fields.idempotency_key = 'Missing idempotency key.';
  else if (idempotencyKey.length > 100) fields.idempotency_key = 'Invalid idempotency key.';
  else data.idempotency_key = idempotencyKey;

  const turnstileToken = str(body.turnstile_token);
  if (!turnstileToken) fields.turnstile_token = 'Spam check missing.';
  else data.turnstile_token = turnstileToken;

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }
  return { ok: true, data };
}

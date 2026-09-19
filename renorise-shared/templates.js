// Follow-up email copy for sequence v2 (three emails over 7 days).
//
// Structure of every email (in this order):
//   greeting  ->  body sentences (fewer than eight; the LAST body sentence is the
//   free-consultation invitation)  ->  signature (The RenoRise Team / email)  ->
//   required footer (business name, mailing address, why you got this, unsubscribe).
//
// There is deliberately NO booking link (none exists yet), no discounts, no
// testimonials, no urgency, no pricing and no response-time promise.
//
// Two source variants exist so the copy never claims something untrue:
//   call    - the person phoned; recorded as a call
//   website - the person sent the website form; NEVER says they called/spoke to us

export const SIGNATURE_LINES = ['The RenoRise Team', 'hello@renosrise.com'];
export const FROM = 'RenoRise <hello@notify.renosrise.com>';
export const REPLY_TO = 'hello@renosrise.com';
export const PLACEHOLDER_ADDRESS = '[Business mailing address — required before sending]';
export const PLACEHOLDER_NAME = '[Legal business name — required before sending]';

// Typographic apostrophes/dashes are intentional (they match the approved copy).
const TEMPLATES = {
  checkin: {
    subject: 'Did you get the help you needed?',
    body: {
      call: [
        'Thanks for calling RenoRise recently.',
        'Were you able to get your home issue taken care of, or are you still looking for help?',
        'If you’re unsure about the next step, we’re happy to talk it through.',
        'Reply with a convenient time to arrange a free consultation.',
      ],
      website: [
        'Thanks for sending your renovation inquiry to RenoRise recently.',
        'Were you able to get the issue you contacted us about taken care of, or are you still looking for help?',
        'If you’re unsure about the next step, we’re happy to talk it through.',
        'Reply with a convenient time to arrange a free consultation.',
      ],
    },
  },
  questions: {
    subject: 'Any questions about your home project?',
    body: {
      both: [
        'I wanted to see whether anything is holding up the project you contacted us about.',
        'Is it the timing, budget, or a question about what the work might involve?',
        'You don’t need to have every detail figured out before we talk.',
        'Reply to arrange a free consultation so we can discuss your questions and priorities.',
      ],
    },
  },
  last: {
    subject: 'Our last check-in—for now',
    body: {
      both: [
        'I hope you’ve been able to get the help you needed.',
        'This is our last follow-up about your recent inquiry, so we’ll leave it with you after today.',
        'If your plans have changed or you’re waiting for a better time, that’s completely fine.',
        'Whenever you’re ready, reply to arrange a free consultation.',
      ],
    },
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * A safe first name for the greeting, or null. Rejects anything that does not
 * look like a plain given name (digits, '@', very long, punctuation soup) so a
 * odd form entry can never produce a strange greeting.
 */
export function firstNameOf(fullName) {
  const token = String(fullName ?? '').trim().split(/\s+/)[0] || '';
  const cleaned = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!/^\p{L}[\p{L}'’-]{0,29}$/u.test(cleaned)) return null;
  const isUniform = cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase();
  return isUniform ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase() : cleaned;
}

export const greetingFor = (fullName) => {
  const first = firstNameOf(fullName);
  return first ? `Hi ${first},` : 'Hi there,';
};

export function bodySentences(templateKey, variant) {
  const t = TEMPLATES[templateKey];
  if (!t) throw new Error(`Unknown template: ${templateKey}`);
  return t.body[variant] || t.body.both;
}

export function subjectFor(templateKey) {
  const t = TEMPLATES[templateKey];
  if (!t) throw new Error(`Unknown template: ${templateKey}`);
  return t.subject;
}

/**
 * Renders one follow-up email.
 *
 * @param {object}  o
 * @param {string}  o.templateKey     'checkin' | 'questions' | 'last'
 * @param {string}  o.variant         'call' | 'website'
 * @param {string}  o.name            the lead's name (for the greeting)
 * @param {string}  o.legalName       required footer: legal business name
 * @param {string}  o.mailingAddress  required footer: mailing address
 * @param {string}  o.unsubscribeUrl  required: HTTPS unsubscribe link
 * @param {boolean} [o.preview]       allow placeholders for missing business details
 * @param {boolean} [o.test]          prefix the subject with [TEST]
 */
export function renderFollowup(o) {
  const variant = o.variant === 'call' ? 'call' : 'website';
  const legalName = String(o.legalName || '').trim();
  const address = String(o.mailingAddress || '').trim();
  if (!o.preview) {
    if (!legalName || !address) throw new Error('missing_business_details');
    if (!/^https:\/\//.test(String(o.unsubscribeUrl || ''))) throw new Error('missing_unsubscribe_url');
  }
  const footerName = legalName || PLACEHOLDER_NAME;
  const footerAddress = address || PLACEHOLDER_ADDRESS;
  const unsubscribeUrl = o.unsubscribeUrl || 'https://example.invalid/unsubscribe';

  const greeting = greetingFor(o.name);
  const sentences = bodySentences(o.templateKey, variant);
  const subject = (o.test ? '[TEST] ' : '') + subjectFor(o.templateKey);
  const why = 'You’re receiving this follow-up because you agreed to hear from RenoRise about your inquiry.';

  const text = [
    greeting,
    '',
    ...sentences.map((s) => s),
    '',
    ...SIGNATURE_LINES,
    '',
    '--',
    footerName,
    footerAddress,
    why,
    `Unsubscribe from these follow-up emails: ${unsubscribeUrl}`,
    'You can also reply to this email with the word STOP.',
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14171d;font-size:15px;line-height:1.55;">
<p>${esc(greeting)}</p>
${sentences.map((s) => `<p>${esc(s)}</p>`).join('\n')}
<p style="margin-top:24px;">${SIGNATURE_LINES.map(esc).join('<br>')}</p>
<hr style="border:0;border-top:1px solid #d9dde3;margin:24px 0 12px;">
<p style="font-size:12px;color:#5b6472;line-height:1.5;">${esc(footerName)}<br>${esc(footerAddress)}<br>${esc(why)}<br><a href="${esc(unsubscribeUrl)}" style="color:#5b6472;">Unsubscribe from these follow-up emails</a> &middot; or reply with the word STOP.</p>
</div>`;

  return {
    subject,
    text,
    html,
    // RFC 8058 one-click unsubscribe (the POST endpoint is on the public Worker).
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    sentenceCount: sentences.length,
    bodySentences: sentences,
  };
}

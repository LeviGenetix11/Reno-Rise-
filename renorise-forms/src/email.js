// Resend integration + email templates. RESEND_API_KEY is read from
// env (a Worker secret) and never touches the response sent to a
// browser. All user-supplied lead fields are HTML-escaped before being
// interpolated into either template.

import { escapeHtml } from './utils.js';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Sends one email via Resend. Throws on any non-2xx response so the
 * caller can record the failure and let the retry sweep pick it up.
 * Returns Resend's message id on success — this confirms the API
 * *accepted* the email, not that it was delivered to an inbox.
 */
export async function sendViaResend(env, { from, to, replyTo, subject, html }) {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo,
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && (data.message || data.name)) || `HTTP ${res.status}`;
    throw new Error(`Resend rejected the email: ${message}`);
  }
  return data?.id || null;
}

export function customerAckEmail(lead, env) {
  const name = escapeHtml(lead.name);
  return {
    from: env.CUSTOMER_FROM_EMAIL,
    to: lead.email,
    replyTo: env.REPLY_TO_EMAIL,
    subject: 'We received your renovation request — Reno Rise',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#14171d;">
        <h1 style="font-size:20px;">Thanks for reaching out, ${name}!</h1>
        <p>We've received your renovation assessment request. A member of the Reno Rise team will contact you to discuss your project and the next steps.</p>
        <p style="color:#6b7280;font-size:13px;">This confirms we received your request — it does not confirm an appointment or a scheduled visit. We'll be in touch to arrange that directly.</p>
        <p style="margin-top:24px;">— The Reno Rise Team<br>(289) 512-8112</p>
      </div>
    `.trim(),
  };
}

export function internalNotificationEmail(lead, env) {
  const row = (label, value) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(value || '—')}</td></tr>`;

  return {
    from: env.CUSTOMER_FROM_EMAIL,
    to: env.INTERNAL_NOTIFY_EMAIL,
    replyTo: lead.email,
    subject: `New lead (${lead.source}): ${lead.name} — ${lead.renovation_type}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14171d;">
        <h1 style="font-size:18px;">New Renovation Assessment Request</h1>
        <table cellpadding="0" cellspacing="0">
          ${row('Name', lead.name)}
          ${row('Email', lead.email)}
          ${row('Phone', lead.phone)}
          ${row('City / Postal', lead.city)}
          ${row('Renovation Type', lead.renovation_type)}
          ${row('Start Timeframe', lead.project_timing)}
          ${row('Target Deadline', lead.target_deadline)}
          ${row('Source', lead.source)}
          ${row('Submitted', lead.created_at)}
          ${row('Lead ID', lead.id)}
        </table>
        ${lead.project_details ? `<p style="margin-top:16px;"><strong>Project details:</strong><br>${escapeHtml(lead.project_details).replace(/\n/g, '<br>')}</p>` : ''}
      </div>
    `.trim(),
  };
}

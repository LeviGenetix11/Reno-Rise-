// RenoRise private dashboard Worker.
//
// EVERY request — pages, forms, exports, unknown paths — is authenticated
// first (see auth.js) before any routing or database access happens. There is
// no unauthenticated route, health check, or static file.
//
// It shares the existing D1 database (binding DB -> renorise-leads) with the
// public form Worker (renorise-forms) but is a separate Worker, so a dashboard
// problem or deploy can never affect form submissions.
//
// Writes are POST-only, protected by an Origin check plus a per-session CSRF
// token, and answered with a 303 redirect (post/redirect/get).

import { authenticate } from './auth.js';
import { csrfToken, originProblem, tokenOk, makeNonce, securityHeaders } from './security.js';
import { layout, errorPage, toString } from './html.js';
import * as db from './db.js';
import * as v from './views.js';
import { toCsv } from './csv.js';
import { STAGE_LABEL, SOURCE_LABEL } from './constants.js';
import { formatDateTime, formatDate, torontoToday } from './time.js';

const MAX_FORM_BYTES = 60_000;

const respond = (body, status, nonce, extra = {}) =>
  new Response(toString(body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders(nonce), ...extra },
  });

const redirect = (location, nonce) =>
  new Response(null, { status: 303, headers: { Location: location, ...securityHeaders(nonce) } });

export default {
  async fetch(request, env) {
    const nonce = makeNonce();
    const url = new URL(request.url);

    // 1. Authenticate. Nothing below runs for an unauthenticated caller.
    const auth = await authenticate(request, env);
    if (!auth.ok) {
      const messages = {
        503: ['Dashboard not configured', 'Access settings have not been set up yet, so this dashboard is closed.'],
        401: ['Sign-in required', 'This is a private page. Sign in through Cloudflare Access.'],
        403: ['Access denied', 'This account is not authorized to use the dashboard.'],
      };
      const [title, msg] = messages[auth.status] || messages[401];
      return respond(errorPage(title, msg, nonce), auth.status, nonce);
    }

    const ctx = { env, db: env.DB, email: auth.email, nonce, url, csrf: () => csrfToken(env.CSRF_SECRET, auth.email) };

    try {
      if (request.method === 'GET' || request.method === 'HEAD') return await handleGet(request, ctx);
      if (request.method === 'POST') return await handlePost(request, ctx);
      return respond(errorPage('Method not allowed', 'That method is not supported.', nonce), 405, nonce, { Allow: 'GET, HEAD, POST' });
    } catch (err) {
      console.log('Dashboard error:', err.message);
      return respond(errorPage('Something went wrong', 'The dashboard hit an error. Try again, or check the Worker logs.', nonce), 500, nonce);
    }
  },
};

const page = async (ctx, { title, active, body, status = 200 }) =>
  respond(layout({ title, active, email: ctx.email, nonce: ctx.nonce, notice: ctx.url.searchParams.get('notice'), body }), status, ctx.nonce);

const notFound = (ctx) => respond(errorPage('Not found', 'That page does not exist.', ctx.nonce), 404, ctx.nonce);

// ------------------------------------------------------------------ GET

async function handleGet(request, ctx) {
  const { url } = ctx;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  let m;

  if (path === '/') {
    const data = await db.overview(ctx.db);
    return page(ctx, { title: 'Overview', active: 'overview', body: v.overviewPage(data) });
  }

  if (path === '/leads') {
    const filters = db.parseLeadFilters(url);
    const [result, contractors] = await Promise.all([db.listLeads(ctx.db, filters), db.listContractors(ctx.db, false)]);
    return page(ctx, { title: 'Leads', active: 'leads', body: v.leadsPage({ result, filters, contractors }) });
  }

  if (path === '/leads/export.csv') return exportCsv(ctx);

  if ((m = /^\/leads\/([A-Za-z0-9-]+)$/.exec(path))) {
    const detail = await db.leadDetail(ctx.db, m[1]);
    if (!detail) return notFound(ctx);
    const [contractors, csrf] = await Promise.all([db.listContractors(ctx.db, false), ctx.csrf()]);
    return page(ctx, { title: detail.lead.name, active: 'leads', body: v.leadPage({ detail, contractors, csrf, today: torontoToday() }) });
  }

  if (path === '/follow-ups') {
    const [data, csrf] = await Promise.all([db.listFollowUps(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Follow-ups', active: 'follow-ups', body: v.followUpsPage({ data, csrf }) });
  }

  if (path === '/contractors') {
    const rows = await db.listContractors(ctx.db, true);
    return page(ctx, { title: 'Contractors', active: 'contractors', body: v.contractorsPage({ rows }) });
  }

  if (path === '/contractors/new') {
    return page(ctx, { title: 'Add contractor', active: 'contractors', body: v.contractorFormPage({ contractor: null, csrf: await ctx.csrf() }) });
  }

  if ((m = /^\/contractors\/([A-Za-z0-9-]+)$/.exec(path))) {
    const contractor = await db.getContractor(ctx.db, m[1]);
    if (!contractor) return notFound(ctx);
    return page(ctx, { title: contractor.name, active: 'contractors', body: v.contractorFormPage({ contractor, csrf: await ctx.csrf() }) });
  }

  if (path === '/emails') {
    const filters = db.parseEmailFilters(url);
    const [result, csrf] = await Promise.all([db.listEmailJobs(ctx.db, filters), ctx.csrf()]);
    return page(ctx, { title: 'Email activity', active: 'emails', body: v.emailsPage({ result, filters, csrf }) });
  }

  return notFound(ctx);
}

async function exportCsv(ctx) {
  const filters = db.parseLeadFilters(ctx.url);
  const rows = await db.exportLeads(ctx.db, filters);
  const header = [
    'Lead ID', 'Received (Toronto)', 'Name', 'Email', 'Phone', 'City / postal code', 'Renovation type', 'Preferred start',
    'Target deadline', 'Project details', 'Source page', 'Stage', 'Contractor', 'Assessment (Toronto)', 'Next follow-up',
    'Archived', 'Customer email (Resend)', 'Internal email (Resend)',
  ];
  const body = rows.map((l) => [
    l.id, formatDateTime(l.created_at), l.name, l.email, l.phone, l.city, l.renovation_type, l.project_timing,
    l.target_deadline, l.project_details, SOURCE_LABEL[l.source] || l.source, STAGE_LABEL[l.status] || l.status,
    l.contractor_name, l.assessment_at ? formatDateTime(l.assessment_at) : '', l.next_follow_up ? formatDate(l.next_follow_up) : '',
    l.archived_at ? 'Yes' : 'No', l.customer_email_status, l.internal_email_status,
  ]);
  const stamp = torontoToday();
  return new Response(toCsv(header, body), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="renorise-leads-${stamp}.csv"`,
      ...securityHeaders(ctx.nonce),
    },
  });
}

// ------------------------------------------------------------------ POST

async function handlePost(request, ctx) {
  // CSRF: same-origin check, then per-session token.
  // Rejections log a reason code (never form contents) so a blocked request can
  // be diagnosed from the Worker logs.
  const problem = originProblem(request);
  if (problem) return csrfFailure(ctx, problem, request);
  if (Number(request.headers.get('Content-Length') || '0') > MAX_FORM_BYTES) {
    return respond(errorPage('Too large', 'That request is too large.', ctx.nonce), 413, ctx.nonce);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return back(ctx, '/', 'bad_request');
  }
  if (!(await tokenOk(form, ctx.env.CSRF_SECRET, ctx.email))) return csrfFailure(ctx, 'token_mismatch', request);

  const path = ctx.url.pathname.replace(/\/+$/, '');
  const actor = ctx.email;
  let m;

  if ((m = /^\/leads\/([A-Za-z0-9-]+)\/(stage|notes|contractor|assessment|archive|unarchive|follow-ups)$/.exec(path))) {
    const [, leadId, action] = m;
    let res;
    if (action === 'stage') res = await db.setStage(ctx.db, leadId, String(form.get('stage') || ''), actor);
    else if (action === 'notes') res = await db.addNote(ctx.db, leadId, form.get('body'), actor);
    else if (action === 'contractor') res = await db.assignContractor(ctx.db, leadId, form.get('contractor_id'), actor);
    else if (action === 'assessment') res = await db.setAssessment(ctx.db, leadId, form.get('assessment_at'), actor);
    else if (action === 'archive') res = await db.setArchived(ctx.db, leadId, true, actor);
    else if (action === 'unarchive') res = await db.setArchived(ctx.db, leadId, false, actor);
    else res = await db.addFollowUp(ctx.db, leadId, String(form.get('due_on') || ''), form.get('note'), actor);
    return back(ctx, `/leads/${leadId}`, res.code);
  }

  if ((m = /^\/leads\/([A-Za-z0-9-]+)\/follow-ups\/([A-Za-z0-9-]+)\/complete$/.exec(path))) {
    const res = await db.completeFollowUp(ctx.db, m[1], m[2], actor);
    return back(ctx, form.get('back') === 'followups' ? '/follow-ups' : `/leads/${m[1]}`, res.code);
  }

  if ((m = /^\/emails\/([A-Za-z0-9-]+)\/retry$/.exec(path))) {
    const res = await db.requeueFailedEmailJob(ctx.db, m[1], actor);
    let target = '/emails?status=failed';
    if (form.get('back') === 'lead') {
      const job = await ctx.db.prepare('SELECT lead_id FROM email_jobs WHERE id = ?').bind(m[1]).first();
      if (job) target = `/leads/${job.lead_id}`;
    }
    return back(ctx, target, res.code);
  }

  if (path === '/contractors') {
    const parsed = db.readContractorForm(form);
    if (!parsed.ok) return back(ctx, '/contractors/new', parsed.code);
    const id = await db.createContractor(ctx.db, parsed.value);
    return back(ctx, `/contractors/${id}`, 'contractor_created');
  }

  if ((m = /^\/contractors\/([A-Za-z0-9-]+)$/.exec(path))) {
    const parsed = db.readContractorForm(form);
    if (!parsed.ok) return back(ctx, `/contractors/${m[1]}`, parsed.code);
    const ok = await db.updateContractor(ctx.db, m[1], parsed.value);
    return back(ctx, `/contractors/${m[1]}`, ok ? 'contractor_updated' : 'not_found');
  }

  if ((m = /^\/contractors\/([A-Za-z0-9-]+)\/(archive|unarchive)$/.exec(path))) {
    const archive = m[2] === 'archive';
    const ok = await db.setContractorArchived(ctx.db, m[1], archive);
    return back(ctx, '/contractors', ok ? (archive ? 'contractor_archived' : 'contractor_unarchived') : 'not_found');
  }

  return notFound(ctx);
}

function csrfFailure(ctx, reason, request) {
  console.log(
    `CSRF rejected: ${reason} method=${request.method} path=${ctx.url.pathname.replace(/[A-Za-z0-9-]{20,}/g, ':id')} origin=${request.headers.get('Origin') ?? '(none)'} sec-fetch-site=${request.headers.get('Sec-Fetch-Site') ?? '(none)'}`
  );
  return respond(errorPage('Request blocked', 'The session check for this action failed. Go back, reload the page, and try again.', ctx.nonce), 403, ctx.nonce);
}

/** Post/redirect/get with a fixed-code notice (never reflected user input). */
function back(ctx, location, code) {
  const sep = location.includes('?') ? '&' : '?';
  return redirect(`${location}${sep}notice=${encodeURIComponent(code)}`, ctx.nonce);
}

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
//
// The CRM (contacts, projects, stages, tasks, calls, appointments, timeline, Today)
// is in crm-db.js / crm-work.js / crm-query.js / crm-views.js. Nothing in this
// Worker sends email: it only records decisions; the public Worker's scheduled job
// does all sending.

import { authenticate } from './auth.js';
import { csrfToken, originProblem, tokenOk, makeNonce, securityHeaders } from './security.js';
import { layout, errorPage, toString, html } from './html.js';
import * as db from './db.js';
import * as v from './views.js';
import { toCsv } from './csv.js';
import { formatDateTime, formatDate, torontoToday } from './time.js';
import * as sdb from './seq-db.js';
import * as sv from './seq-views.js';
import * as crm from './crm-db.js';
import * as work from './crm-work.js';
import * as q from './crm-query.js';
import * as cv from './crm-views.js';
import { STAGE_LABEL, SOURCE_LABEL, QUALIFICATION_LABEL, PRIORITY_LABEL, MARKETING_SOURCE_LABEL } from './crm-constants.js';
import { loadSettings } from '../../renorise-shared/followup-db.js';

const MAX_FORM_BYTES = 60_000;

const respond = (body, status, nonce, extra = {}) =>
  new Response(toString(body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders(nonce), ...extra },
  });

const redirect = (location, nonce) =>
  new Response(null, { status: 303, headers: { Location: location, ...securityHeaders(nonce) } });

/** Signed-in staff emails (the Access allow-list). With one staff member there is nobody to assign tasks between. */
const staffEmails = (env) => String(env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

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

    const ctx = { env, db: env.DB, email: auth.email, nonce, url, csrf: () => csrfToken(env.CSRF_SECRET, auth.email), staff: staffEmails(env) };

    try {
      // Every original submission gets a contact and a project the first time it is seen (idempotent, cheap when
      // there is nothing to do). If the database update has not been applied yet, say so instead of failing oddly.
      try {
        await crm.ensureCrmRecords(env.DB);
      } catch (err) {
        if (/no such (table|column)/i.test(String(err.message))) {
          return respond(errorPage('Database update needed', 'This dashboard version needs the CRM database update (migration 0004). Apply it, then reload. Nothing has been lost.', nonce), 503, nonce);
        }
        throw err;
      }
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
  respond(
    layout({ title, active, email: ctx.email, nonce: ctx.nonce, notice: ctx.url.searchParams.get('notice'), body, summary: await q.summaryCounts(ctx.db) }),
    status,
    ctx.nonce
  );

const notFound = (ctx) => respond(errorPage('Not found', 'That page does not exist.', ctx.nonce), 404, ctx.nonce);

// ------------------------------------------------------------------ GET

async function handleGet(request, ctx) {
  const { url } = ctx;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  let m;

  if (path === '/') {
    const data = await q.overview(ctx.db);
    return page(ctx, { title: 'Overview', active: 'overview', body: cv.overviewPage(data) });
  }

  if (path === '/today') {
    const [data, csrf] = await Promise.all([q.todayData(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Today', active: 'today', body: cv.todayPage({ data, csrf, staleForm: data.settings }) });
  }

  if (path === '/leads') {
    const filters = q.parseLeadFilters(url);
    const [contractors, stages, testHidden, csrf] = await Promise.all([db.listContractors(ctx.db, false), q.stageCounts(ctx.db, filters), q.hiddenTestCount(ctx.db), ctx.csrf()]);
    const today = torontoToday();
    if (filters.view === 'pipeline') {
      const board = await q.pipelineOpportunities(ctx.db, filters);
      return page(ctx, { title: 'Leads', active: 'leads', body: cv.leadsPage({ result: null, board, filters, contractors, stages, testHidden, csrf, today }) });
    }
    const result = await q.listOpportunities(ctx.db, filters);
    return page(ctx, { title: 'Leads', active: 'leads', body: cv.leadsPage({ result, board: null, filters, contractors, stages, testHidden, csrf, today }) });
  }

  if (path === '/leads/export.csv') return exportCsv(ctx);

  if (path === '/leads/new') {
    return page(ctx, { title: 'Add an inquiry', active: 'leads', body: cv.newProjectPage({ contact: null, csrf: await ctx.csrf() }) });
  }

  if ((m = /^\/leads\/([A-Za-z0-9-]+)$/.exec(path))) {
    const opp = await crm.getOpportunity(ctx.db, m[1]);
    if (!opp) return notFound(ctx);
    const [contact, submissions, timeline, tasks, appointments, contractors, csrf, jobs, duplicates, seqLead] = await Promise.all([
      crm.getContact(ctx.db, opp.contact_id),
      crm.submissionsFor(ctx.db, opp.id),
      q.buildTimeline(ctx.db, { opportunityId: opp.id }),
      work.tasksFor(ctx.db, { opportunityId: opp.id }),
      work.appointmentsFor(ctx.db, opp.id),
      db.listContractors(ctx.db, false),
      ctx.csrf(),
      q.emailJobsFor(ctx.db, opp.id),
      crm.possibleDuplicates(ctx.db, opp.contact_id),
      q.sequenceLeadFor(ctx.db, opp.id),
    ]);
    const today = torontoToday();
    let sequenceHtml = '';
    if (seqLead && seqLead.email) {
      sequenceHtml = sv.sequenceCard({ lead: seqLead, seq: await sdb.enrollmentForLead(ctx.db, seqLead.id), csrf, today });
    } else {
      sequenceHtml = html`<section class="card" aria-labelledby="seq-h"><h2 id="seq-h">Follow-up emails</h2><p class="empty">This project has no email address on file, so it cannot be enrolled in follow-up emails.</p></section>`;
    }
    return page(ctx, {
      title: opp.title,
      active: 'leads',
      body: cv.projectPage({ opp, contact, submissions, timeline, tasks, appointments, contractors, csrf, today, sequenceHtml, seqLead, jobs, duplicates, assignees: ctx.staff }),
    });
  }

  if (path === '/contacts') {
    const filters = q.parseContactFilters(url);
    const [result, testHidden] = await Promise.all([q.listContacts(ctx.db, filters), q.hiddenTestCount(ctx.db)]);
    return page(ctx, { title: 'Contacts', active: 'contacts', body: cv.contactsPage({ result, filters, testHidden }) });
  }

  if ((m = /^\/contacts\/([A-Za-z0-9-]+)\/projects\/new$/.exec(path))) {
    const contact = await crm.getContact(ctx.db, m[1]);
    if (!contact) return notFound(ctx);
    return page(ctx, { title: 'Add another project', active: 'contacts', body: cv.newProjectPage({ contact, csrf: await ctx.csrf() }) });
  }

  if ((m = /^\/contacts\/([A-Za-z0-9-]+)$/.exec(path))) {
    const contact = await crm.getContact(ctx.db, m[1]);
    if (!contact) return notFound(ctx);
    const [bundle, duplicates, timeline, tasks, csrf] = await Promise.all([
      q.contactBundle(ctx.db, contact.id),
      crm.possibleDuplicates(ctx.db, contact.id),
      q.buildTimeline(ctx.db, { contactId: contact.id }),
      work.tasksFor(ctx.db, { contactId: contact.id }),
      ctx.csrf(),
    ]);
    return page(ctx, { title: contact.display_name, active: 'contacts', body: cv.contactPage({ contact, bundle, duplicates, timeline, tasks, csrf, today: torontoToday(), assignees: ctx.staff }) });
  }

  if (path === '/follow-ups') {
    const filters = work.parseTaskFilters(url);
    const [data, csrf] = await Promise.all([work.listTasks(ctx.db, filters), ctx.csrf()]);
    return page(ctx, { title: 'Follow-ups', active: 'follow-ups', body: cv.tasksPage({ data, filters, csrf, assignees: ctx.staff }) });
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
    const [csrf, tasks] = await Promise.all([ctx.csrf(), work.tasksFor(ctx.db, { contractorId: contractor.id })]);
    return page(ctx, {
      title: contractor.name,
      active: 'contractors',
      body: html`${v.contractorFormPage({ contractor, csrf })}${cv.contractorTasks({ contractor, tasks, csrf, today: torontoToday(), assignees: ctx.staff })}`,
    });
  }

  // ---- follow-up email sequence
  if (path === '/sequence') {
    const [ov, sends, csrf] = await Promise.all([sdb.sequenceOverview(ctx.db), sdb.recentSends(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Follow-up emails', active: 'sequence', body: sv.sequencePage({ ov, sends, csrf }) });
  }
  if (path === '/sequence/queue') {
    const [items, csrf] = await Promise.all([sdb.approvalQueue(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Awaiting approval', active: 'sequence', body: sv.queuePage({ items, csrf }) });
  }
  if (path === '/sequence/preview') {
    const [settings, csrf] = await Promise.all([loadSettings(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Email previews', active: 'sequence', body: sv.previewPage({ settings, name: (url.searchParams.get('name') || '').slice(0, 60), csrf }) });
  }
  if (path === '/sequence/settings') {
    const [settings, csrf] = await Promise.all([loadSettings(ctx.db), ctx.csrf()]);
    return page(ctx, { title: 'Follow-up settings', active: 'sequence', body: sv.settingsPage({ settings, csrf }) });
  }
  if ((m = /^\/leads\/([A-Za-z0-9-]+)\/sequence$/.exec(path))) {
    const lead = await sdb.getLeadForSequence(ctx.db, m[1]);
    if (!lead) return notFound(ctx);
    const kind = url.searchParams.get('kind') === 'call' ? 'call' : 'website';
    const form = { sourceKind: kind, callDate: (url.searchParams.get('call_date') || '').slice(0, 10) };
    const plan = await sdb.planFor(ctx.db, lead, form);
    return page(ctx, { title: 'Set up follow-ups', active: 'leads', body: sv.enrollPage({ lead, plan, form, csrf: await ctx.csrf(), today: torontoToday() }) });
  }

  if (path === '/emails') {
    const filters = db.parseEmailFilters(url);
    const [result, csrf] = await Promise.all([db.listEmailJobs(ctx.db, filters), ctx.csrf()]);
    return page(ctx, { title: 'Email activity', active: 'emails', body: v.emailsPage({ result, filters, csrf }) });
  }

  return notFound(ctx);
}

async function exportCsv(ctx) {
  const filters = q.parseLeadFilters(ctx.url);
  const rows = await q.exportOpportunities(ctx.db, filters);
  const header = [
    'Lead ID', 'Contact ID', 'Received (Toronto)', 'Name', 'Email', 'Phone', 'Project title', 'Renovation type', 'Property address', 'City', 'Postal code',
    'Stage', 'Qualification', 'Priority', 'Budget', 'Preferred start', 'Target completion', 'Project description', 'Submission source', 'Marketing source',
    'Customer-reported source', 'Contractor', 'Next appointment (Toronto)', 'Next task due', 'First contact recorded (Toronto)', 'Archived', 'Test record',
    'Customer email (Resend)', 'Internal email (Resend)',
  ];
  const budget = (o) =>
    o.budget_status !== 'stated' ? 'Not yet discussed' : `${o.budget_min ?? ''}${o.budget_min != null && o.budget_max != null ? ' to ' : o.budget_max != null ? 'up to ' : ''}${o.budget_max ?? ''} ${o.budget_currency}`.trim();
  const body = rows.map((o) => [
    o.id, o.contact_id, formatDateTime(o.created_at), o.contact_name, o.contact_email, o.contact_phone, o.title, o.renovation_type, o.property_address, o.property_city, o.property_postal_code,
    o.stage_needs_review ? 'Needs a stage (existing record)' : STAGE_LABEL[o.stage] || o.stage, QUALIFICATION_LABEL[o.qualification] || o.qualification, PRIORITY_LABEL[o.priority] || o.priority, budget(o),
    [o.desired_start_date, o.desired_start_note].filter(Boolean).join(' · '), [o.target_completion_date, o.target_completion_note].filter(Boolean).join(' · '), o.description,
    SOURCE_LABEL[o.first_source] || o.first_source, MARKETING_SOURCE_LABEL[o.marketing_source] || o.marketing_source, o.customer_reported_source, o.contractor_name,
    o.next_appointment ? formatDateTime(o.next_appointment) : '', o.next_task_due ? formatDate(o.next_task_due) : '', o.first_contact_at ? formatDateTime(o.first_contact_at) : '',
    o.archived_at ? 'Yes' : 'No', o.is_test ? 'Yes' : 'No', o.customer_email_status, o.internal_email_status,
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

  // ---- follow-up email sequence
  if ((m = /^\/leads\/([A-Za-z0-9-]+)\/sequence\/enroll$/.exec(path))) {
    const kind = form.get('kind') === 'call' ? 'call' : 'website';
    const callDate = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('call_date') || '')) ? String(form.get('call_date')) : '';
    const res = await sdb.createEnrollment(
      ctx.db,
      m[1],
      { sourceKind: kind, callDate, confirmed: form.get('confirmed') === 'yes', method: String(form.get('method') || ''), givenOn: String(form.get('given_on') || ''), evidence: String(form.get('evidence') || '') },
      actor
    );
    if (res.ok) return back(ctx, `/leads/${m[1]}`, 'enrolled');
    return back(ctx, `/leads/${m[1]}/sequence?kind=${kind}${callDate ? `&call_date=${callDate}` : ''}`, res.code);
  }
  if ((m = /^\/sequence\/steps\/([A-Za-z0-9-]+)\/(approve|skip)$/.exec(path))) {
    const res = m[2] === 'approve' ? await sdb.approveStep(ctx.db, m[1], { inboxChecked: form.get('inbox_checked') === 'yes' }, actor) : await sdb.skipStep(ctx.db, m[1], actor);
    return back(ctx, await sequenceBack(ctx, 'step', m[1], form.get('back')), res.code === 'stopped' ? 'stopped_on_approve' : res.code);
  }
  if ((m = /^\/sequence\/enrollments\/([A-Za-z0-9-]+)\/(pause|resume|stop)$/.exec(path))) {
    const res = m[2] === 'stop' ? await sdb.stopByStaff(ctx.db, m[1], String(form.get('reason') || ''), actor) : await sdb.setPaused(ctx.db, m[1], m[2] === 'pause', actor);
    return back(ctx, await sequenceBack(ctx, 'enrollment', m[1], form.get('back')), res.code);
  }
  if ((m = /^\/sequence\/sends\/([A-Za-z0-9-]+)\/retry$/.exec(path))) {
    const res = await sdb.retryFailedSend(ctx.db, m[1], actor);
    return back(ctx, await sequenceBack(ctx, 'send', m[1], form.get('back')), res.code);
  }
  if (path === '/sequence/test-send') {
    const res = await sdb.queueTestSend(ctx.db, { to: form.get('to'), template: form.get('template'), variant: form.get('variant'), name: form.get('name') }, actor);
    return back(ctx, '/sequence', res.code);
  }
  if (path === '/sequence/settings') {
    const res = await sdb.saveSettings(ctx.db, form, actor);
    return back(ctx, '/sequence/settings', res.code);
  }
  if (path === '/sequence/switch') {
    const res = await sdb.setGlobalSwitch(ctx.db, form.get('on') === '1', form.get('confirm'), actor);
    return back(ctx, '/sequence/settings', res.code);
  }

  // ---- CRM: reminder thresholds
  if (path === '/settings/crm') {
    const res = await crm.saveCrmSettings(ctx.db, form, actor);
    return back(ctx, '/today', res.code);
  }

  // ---- CRM: new inquiry entered by hand (never sends anything)
  if (path === '/leads') {
    const contact = crm.readContactForm(form);
    if (!contact.ok) return back(ctx, '/leads/new', contact.code);
    const project = crm.readOpportunityForm(form);
    if (!project.ok) return back(ctx, '/leads/new', project.code);
    const res = await crm.createManualProject(ctx.db, { contactValue: contact.value, projectValue: project.value, channel: String(form.get('channel') || ''), receivedLocal: String(form.get('received_at') || '') }, actor);
    return back(ctx, res.ok ? `/leads/${res.opportunityId}` : '/leads/new', res.code);
  }

  // ---- CRM: a project (lead) and everything on it
  if ((m = /^\/leads\/([A-Za-z0-9-]+)\/(stage|qualification|details|notes|contractor|archive|unarchive|test|delivery|resume|calls|tasks|appointments|follow-ups)$/.exec(path))) {
    const opp = await crm.getOpportunity(ctx.db, m[1]);
    if (!opp) return back(ctx, '/leads', 'not_found');
    const action = m[2];
    const here = `/leads/${opp.id}`;
    let res;
    if (action === 'stage') {
      const stage = String(form.get('stage') || '');
      const reason = stage === 'lost' ? form.get('lost_reason') : stage === 'on_hold' ? form.get('hold_reason') : null;
      res = await crm.setStage(ctx.db, opp.id, { stage, reason, reviewOn: form.get('review_on'), note: form.get('note') }, actor);
      if (form.get('back') === 'board') {
        // A quick move from the pipeline board: success returns to the board; a move that needs a reason opens the project's stage form.
        if (res.ok) return back(ctx, '/leads?view=pipeline', res.code);
        return backAt(ctx, here, res.code, 'stage');
      }
      return backAt(ctx, here, res.code, res.ok ? '' : 'stage');
    }
    if (action === 'qualification') res = await crm.setQualification(ctx.db, opp.id, { value: form.get('value'), reason: form.get('reason'), note: form.get('note') }, actor);
    else if (action === 'details') {
      const parsed = crm.readOpportunityForm(form);
      res = parsed.ok ? await crm.updateOpportunity(ctx.db, opp.id, parsed.value, actor) : parsed;
    } else if (action === 'notes') res = await crm.addNote(ctx.db, opp.id, form.get('body'), actor);
    else if (action === 'contractor') res = await crm.assignContractor(ctx.db, opp.id, form.get('contractor_id'), actor);
    else if (action === 'archive') res = await crm.setArchived(ctx.db, opp.id, true, actor);
    else if (action === 'unarchive') res = await crm.setArchived(ctx.db, opp.id, false, actor);
    else if (action === 'test') res = await crm.setTestFlag(ctx.db, opp.id, form.get('flag') === '1', actor);
    else if (action === 'delivery') res = await crm.setDeliveryStatus(ctx.db, opp.id, String(form.get('delivery_status') || ''), actor);
    else if (action === 'resume') res = await crm.resumeFromHold(ctx.db, opp.id, actor);
    else if (action === 'calls') {
      res = await work.logCall(
        ctx.db,
        { opportunityId: opp.id },
        { outcome: form.get('outcome'), direction: form.get('direction'), occurredLocal: String(form.get('occurred_at') || ''), summary: form.get('summary'), nextTitle: form.get('next_title'), nextDue: form.get('next_due'), moveStage: form.get('move_stage') === 'yes' },
        actor
      );
    } else if (action === 'appointments') {
      res = await work.addAppointment(ctx.db, opp.id, { kind: form.get('kind'), startsLocal: String(form.get('starts_at') || ''), notes: form.get('notes'), moveStage: form.get('move_stage') === 'yes' }, actor);
    } else {
      // 'tasks', and the earlier /follow-ups path (same form, a date and an optional note)
      const parsed = work.readTaskForm(form, ctx.staff);
      res = parsed.ok ? await work.createTask(ctx.db, { opportunityId: opp.id }, parsed.value, actor) : parsed;
    }
    return back(ctx, here, res.code);
  }

  // ---- CRM: tasks
  if ((m = /^\/tasks\/([A-Za-z0-9-]+)\/(complete|cancel|reschedule)$/.exec(path)) || (m = /^\/leads\/[A-Za-z0-9-]+\/follow-ups\/([A-Za-z0-9-]+)\/(complete)$/.exec(path))) {
    const task = await work.getTask(ctx.db, m[1]);
    if (!task) return back(ctx, '/follow-ups', 'not_found');
    const res = m[2] === 'complete' ? await work.completeTask(ctx.db, task.id, form.get('note'), actor) : m[2] === 'cancel' ? await work.cancelTask(ctx.db, task.id, actor) : await work.rescheduleTask(ctx.db, task.id, String(form.get('due_on') || ''), actor);
    const where = form.get('back');
    const target = where === 'today' ? '/today' : where === 'followups' || (!task.opportunity_id && !task.contact_id) ? '/follow-ups' : where === 'contact' && task.contact_id ? `/contacts/${task.contact_id}` : task.opportunity_id ? `/leads/${task.opportunity_id}` : task.contact_id ? `/contacts/${task.contact_id}` : task.contractor_id ? `/contractors/${task.contractor_id}` : '/follow-ups';
    return back(ctx, target, res.code);
  }

  // ---- CRM: appointments (redirects to the appointment's own project, never a supplied address)
  if ((m = /^\/appointments\/([A-Za-z0-9-]+)\/(status|reschedule)$/.exec(path))) {
    const appt = await work.getAppointment(ctx.db, m[1]);
    if (!appt) return back(ctx, '/leads', 'not_found');
    const res = m[2] === 'status' ? await work.setAppointmentStatus(ctx.db, appt.id, String(form.get('status') || ''), actor) : await work.rescheduleAppointment(ctx.db, appt.id, String(form.get('starts_at') || ''), actor);
    return back(ctx, `/leads/${appt.opportunity_id}`, res.code);
  }

  // ---- CRM: contacts
  if ((m = /^\/contacts\/([A-Za-z0-9-]+)\/projects$/.exec(path))) {
    const contact = await crm.getContact(ctx.db, m[1]);
    if (!contact) return back(ctx, '/contacts', 'not_found');
    const project = crm.readOpportunityForm(form);
    if (!project.ok) return back(ctx, `/contacts/${contact.id}/projects/new`, project.code);
    const res = await crm.createManualProject(ctx.db, { contactId: contact.id, projectValue: project.value, channel: String(form.get('channel') || ''), receivedLocal: String(form.get('received_at') || '') }, actor);
    return back(ctx, res.ok ? `/leads/${res.opportunityId}` : `/contacts/${contact.id}/projects/new`, res.code);
  }
  if ((m = /^\/contacts\/([A-Za-z0-9-]+)\/(archive|unarchive|permissions|calls|tasks)$/.exec(path))) {
    const contact = await crm.getContact(ctx.db, m[1]);
    if (!contact) return back(ctx, '/contacts', 'not_found');
    const here = `/contacts/${contact.id}`;
    let res;
    if (m[2] === 'archive' || m[2] === 'unarchive') res = await crm.setContactArchived(ctx.db, contact.id, m[2] === 'archive', actor);
    else if (m[2] === 'permissions') {
      res = await crm.recordPermission(ctx.db, contact.id, { channel: form.get('channel'), status: form.get('status'), method: form.get('method'), givenOn: form.get('given_on'), evidence: form.get('evidence') }, actor);
    } else if (m[2] === 'calls') {
      res = await work.logCall(ctx.db, { contactId: contact.id }, { outcome: form.get('outcome'), direction: form.get('direction'), occurredLocal: String(form.get('occurred_at') || ''), summary: form.get('summary'), nextTitle: form.get('next_title'), nextDue: form.get('next_due'), moveStage: false }, actor);
    } else {
      const parsed = work.readTaskForm(form, ctx.staff);
      res = parsed.ok ? await work.createTask(ctx.db, { contactId: contact.id }, parsed.value, actor) : parsed;
    }
    return back(ctx, here, res.code);
  }
  if ((m = /^\/contacts\/([A-Za-z0-9-]+)$/.exec(path))) {
    const contact = await crm.getContact(ctx.db, m[1]);
    if (!contact) return back(ctx, '/contacts', 'not_found');
    const parsed = crm.readContactForm(form);
    const res = parsed.ok ? await crm.updateContact(ctx.db, contact.id, parsed.value, actor) : parsed;
    return back(ctx, `/contacts/${contact.id}`, res.code);
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

  // ---- contractors
  if ((m = /^\/contractors\/([A-Za-z0-9-]+)\/tasks$/.exec(path))) {
    const contractor = await db.getContractor(ctx.db, m[1]);
    if (!contractor) return back(ctx, '/contractors', 'not_found');
    const parsed = work.readTaskForm(form, ctx.staff);
    const res = parsed.ok ? await work.createTask(ctx.db, { contractorId: contractor.id }, parsed.value, actor) : parsed;
    return back(ctx, `/contractors/${contractor.id}`, res.code);
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

/** Same, landing on a named section of the page (a fixed, code-supplied fragment, never user input). */
function backAt(ctx, location, code, fragment) {
  const sep = location.includes('?') ? '&' : '?';
  return redirect(`${location}${sep}notice=${encodeURIComponent(code)}${fragment ? `#${fragment}` : ''}`, ctx.nonce);
}

/** Where to send the user after a follow-up sequence action (whitelisted; never a user-supplied URL). */
async function sequenceBack(ctx, kind, id, backParam) {
  if (backParam === 'lead') {
    const sql =
      kind === 'step'
        ? 'SELECT e.lead_id AS lead_id FROM enrollment_steps s JOIN enrollments e ON e.id = s.enrollment_id WHERE s.id = ?'
        : kind === 'enrollment'
          ? 'SELECT lead_id FROM enrollments WHERE id = ?'
          : 'SELECT lead_id FROM followup_sends WHERE id = ?';
    const row = await ctx.db.prepare(sql).bind(id).first();
    if (row && row.lead_id) return `/leads/${row.lead_id}`;
  }
  return backParam === 'queue' ? '/sequence/queue' : '/sequence';
}


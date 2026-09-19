// CRM data layer, part 1: contacts, projects (opportunities), stage, qualification.
// (Tasks, calls and appointments are in crm-work.js; lists, the timeline and the
// Today view are in crm-query.js.)
//
// Rules this file enforces:
//   * `leads` rows are the ORIGINAL SUBMISSIONS. Nothing here ever rewrites a
//     submission's name / email / phone / city / project fields. Editing a
//     contact or a project changes only the contact / project record, and the
//     before/after values go into the append-only crm_events audit trail.
//   * People are never merged automatically. Each submission gets its own
//     contact; shared emails / phone numbers are only SUGGESTED as duplicates.
//   * Stage / archive changes act on ONE project (its own submissions), so they
//     can never close another project of the same customer.
//   * Nothing in this file sends a message. Manual entries create no email jobs.
//   * Every function returns { ok: true, code } or { ok: false, code }; the code
//     maps to a fixed message (html.js NOTICES), never to reflected input.
//
// Every write uses prepared statements, and a change plus its audit event go
// through db.batch() so they are applied together or not at all.

import { normalizeEmail, normalizePhone, splitLocation, normalizeTags } from '../../renorise-shared/normalize.js';
import {
  stopEnrollmentsForOpportunity,
  pauseEnrollmentsForOpportunity,
  stopEnrollmentsForEmail,
  withdrawConsentsForEmail,
} from '../../renorise-shared/followup-db.js';
import { torontoToday, isValidDateString, torontoInputToUtcIso } from './time.js';
import {
  STAGE_KEYS,
  STAGE_LABEL,
  LEGACY_STAGE_MAP,
  LEGACY_MIRROR,
  STAGE_STOPS_SEQUENCE,
  CLOSED_STAGES,
  LOST_REASONS,
  HOLD_REASONS,
  NOT_FIT_REASONS,
  QUALIFICATION,
  PRIORITIES,
  DELIVERY_STATUSES,
  CONTACT_METHODS,
  MANUAL_SOURCE_KEYS,
  MARKETING_SOURCES,
  PERMISSION_CHANNELS,
  PERMISSION_METHODS,
  CRM_SETTING_DEFAULTS,
  CRM_SETTING_META,
  reasonLabel,
} from './crm-constants.js';

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
export const clip = (v, max) => String(v ?? '').trim().slice(0, max);
const orNull = (v) => (v === '' || v === undefined || v === null ? null : v);
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d$/;
const keys = (list) => list.map(([k]) => k);

/** Prepared INSERT for one timeline / audit event. */
export function eventStmt(db, { contactId, opportunityId = null, kind, summary, detail = null, provenance = 'manual', actor, at }) {
  const now = nowIso();
  return db
    .prepare(
      'INSERT INTO crm_events (id, contact_id, opportunity_id, kind, summary, detail, provenance, actor, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(newId(), contactId, opportunityId, kind, summary, detail ? JSON.stringify(detail) : null, provenance, actor, at || now, now);
}

/** { field: [before, after] } for every listed field whose value changed. */
function changes(before, after, fields) {
  const out = {};
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (String(a ?? '') !== String(b ?? '')) out[f] = [a, b];
  }
  return out;
}

// ---------------------------------------------------------------- settings

export async function loadCrmSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM crm_settings').all();
  const out = { ...CRM_SETTING_DEFAULTS };
  for (const r of rows.results || []) if (r.key in CRM_SETTING_DEFAULTS) out[r.key] = r.value;
  return out;
}

export async function saveCrmSettings(db, form, actor) {
  const stmts = [];
  for (const [key, meta] of Object.entries(CRM_SETTING_META)) {
    const n = Number(String(form.get(key) ?? '').trim());
    if (!Number.isInteger(n) || n < meta.min || n > meta.max) return { ok: false, code: 'bad_setting' };
    stmts.push(
      db
        .prepare('INSERT INTO crm_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
        .bind(key, String(n), nowIso(), actor)
    );
  }
  await db.batch(stmts);
  return { ok: true, code: 'settings_saved' };
}

// ---------------------------------------------------------------- creating records from submissions

/**
 * Makes sure every original submission (leads row) has a contact and a project,
 * and that older data is carried over: the recorded assessment date becomes an
 * appointment, and existing follow-ups become tasks with the SAME id.
 *
 * Idempotent and safe if two requests run at once: ids are derived from the lead
 * id and every insert is INSERT OR IGNORE. Runs before each dashboard request but
 * costs one indexed lookup when there is nothing to do. Creates ONE contact per
 * submission (people are linked by a person, never automatically), never infers a
 * stage where the old meaning is ambiguous, and never writes to the submission.
 */
export async function ensureCrmRecords(db) {
  for (let round = 0; round < 20; round++) {
    const batch = (await db.prepare('SELECT * FROM leads WHERE opportunity_id IS NULL ORDER BY created_at, id LIMIT 50').all()).results || [];
    if (!batch.length) break;
    for (const lead of batch) await materializeLead(db, lead);
    if (batch.length < 50) break;
  }
  const orphan = await db
    .prepare('SELECT 1 AS x FROM follow_ups f JOIN leads l ON l.id = f.lead_id WHERE l.opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = f.id) LIMIT 1')
    .first();
  if (orphan) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO tasks (id, contact_id, opportunity_id, type, title, due_on, priority, status, completed_at, source, created_at, created_by, updated_at)
         SELECT f.id, l.contact_id, l.opportunity_id, 'general', COALESCE(NULLIF(TRIM(f.note), ''), 'Follow up'), f.due_on, 'normal',
                CASE WHEN f.completed_at IS NULL THEN 'open' ELSE 'done' END, f.completed_at, 'legacy_follow_up', f.created_at, 'system',
                COALESCE(f.completed_at, f.created_at)
         FROM follow_ups f JOIN leads l ON l.id = f.lead_id
         WHERE l.opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = f.id)`
      )
      .run();
  }
}

async function materializeLead(db, lead) {
  const contactId = `ct-${lead.id}`;
  const oppId = `op-${lead.id}`;
  const created = lead.created_at;
  const emailNorm = normalizeEmail(lead.email);
  const phoneNorm = normalizePhone(lead.phone);
  const { city, postal } = splitLocation(lead.city);
  const mapped = Object.prototype.hasOwnProperty.call(LEGACY_STAGE_MAP, lead.status) ? LEGACY_STAGE_MAP[lead.status] : null;
  const stmts = [
    db
      .prepare(
        'INSERT OR IGNORE INTO contacts (id, display_name, email, email_norm, phone, phone_norm, created_at, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(contactId, lead.name, orNull(lead.email), emailNorm, orNull(lead.phone), phoneNorm, created, 'system', created),
  ];
  if (emailNorm) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'email', ?, ?, 'submission', ?)")
        .bind(`ci-e-${lead.id}`, contactId, lead.email, emailNorm, created)
    );
  }
  if (phoneNorm) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'phone', ?, ?, 'submission', ?)")
        .bind(`ci-p-${lead.id}`, contactId, lead.phone, phoneNorm, created)
    );
  }
  stmts.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO opportunities (
           id, contact_id, title, renovation_type, property_city, property_postal_code, description,
           desired_start_note, target_completion_note, stage, stage_needs_review, legacy_status, stage_changed_at,
           contractor_id, archived_at, created_at, created_by, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        oppId, contactId, lead.renovation_type || 'Project details not recorded', orNull(lead.renovation_type), city, postal, orNull(lead.project_details),
        orNull(lead.project_timing), orNull(lead.target_deadline), mapped, mapped ? 0 : 1, lead.status, lead.updated_at || created,
        orNull(lead.contractor_id), orNull(lead.archived_at), created, 'system', lead.updated_at || created
      ),
    db.prepare('UPDATE leads SET contact_id = ?, opportunity_id = ? WHERE id = ? AND opportunity_id IS NULL').bind(contactId, oppId, lead.id)
  );
  if (lead.assessment_at) {
    // The old dashboard's single "assessment date". The public site describes an in-home assessment,
    // so it becomes an on-site assessment appointment; staff can change the kind.
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO appointments (id, opportunity_id, contact_id, kind, starts_at, status, source, created_by, created_at, updated_at) VALUES (?, ?, ?, 'onsite_assessment', ?, 'scheduled', 'legacy_assessment', 'system', ?, ?)"
        )
        .bind(`ap-${lead.id}`, oppId, contactId, lead.assessment_at, nowIso(), nowIso())
    );
  }
  stmts.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO crm_events (id, contact_id, opportunity_id, kind, summary, detail, provenance, actor, occurred_at, created_at) VALUES (?, ?, ?, 'project_created', ?, ?, 'system', 'system', ?, ?)"
      )
      .bind(
        `ev-created-${lead.id}`, contactId, oppId,
        mapped ? 'Contact and project created from the original submission' : `Contact and project created from the original submission. The earlier stage "${lead.status}" has more than one possible meaning, so a stage needs to be chosen.`,
        JSON.stringify({ legacy_status: lead.status, mapped_stage: mapped }), nowIso(), nowIso()
      )
  );
  await db.batch(stmts);
}

// ---------------------------------------------------------------- reading

const OPP_SELECT = `
  SELECT o.*, c.display_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
         ct.name AS contractor_name,
         (SELECT COUNT(*) FROM leads l WHERE l.opportunity_id = o.id) AS submission_count
  FROM opportunities o
  JOIN contacts c ON c.id = o.contact_id
  LEFT JOIN contractors ct ON ct.id = o.contractor_id`;

/** A project by its own id, or by the id of any of its original submissions (older links keep working). */
export async function getOpportunity(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return db.prepare(`${OPP_SELECT} WHERE o.id = ? OR o.id = (SELECT opportunity_id FROM leads WHERE id = ?)`).bind(id, id).first();
}

export async function getContact(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return db.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
}

export async function submissionsFor(db, opportunityId) {
  return ((await db.prepare('SELECT * FROM leads WHERE opportunity_id = ? ORDER BY created_at, id').bind(opportunityId).all()).results) || [];
}

/**
 * Other contacts that share a normalised email or phone with this one. A SUGGESTION
 * for a person to review: sharing a phone number or an email address never merges
 * anything, and a repeat submission for a different project is not a duplicate.
 */
export async function possibleDuplicates(db, contactId) {
  const rows = await db
    .prepare(
      `SELECT c.id, c.display_name, c.email, c.phone,
              GROUP_CONCAT(DISTINCT i2.kind) AS matched_on,
              (SELECT COUNT(*) FROM opportunities o WHERE o.contact_id = c.id) AS project_count
       FROM contact_identifiers i1
       JOIN contact_identifiers i2 ON i2.kind = i1.kind AND i2.norm = i1.norm AND i2.contact_id != i1.contact_id
       JOIN contacts c ON c.id = i2.contact_id
       WHERE i1.contact_id = ? AND c.merged_into_id IS NULL
       GROUP BY c.id ORDER BY c.display_name COLLATE NOCASE LIMIT 20`
    )
    .bind(contactId)
    .all();
  return rows.results || [];
}

// ---------------------------------------------------------------- contact editing

export function readContactForm(form) {
  const name = clip(form.get('display_name'), 200);
  const email = clip(form.get('email'), 254);
  const phone = clip(form.get('phone'), 40);
  const method = clip(form.get('preferred_contact_method'), 20);
  if (!name) return { ok: false, code: 'contact_name' };
  if (email && !normalizeEmail(email)) return { ok: false, code: 'contact_email' };
  if (phone && phone.replace(/\D/g, '').length < 7) return { ok: false, code: 'contact_phone' };
  if (!email && !phone) return { ok: false, code: 'contact_needs_email_or_phone' };
  if (!keys(CONTACT_METHODS).includes(method)) return { ok: false, code: 'bad_request' };
  return {
    ok: true,
    value: {
      display_name: name,
      email: email || null,
      phone: phone || null,
      preferred_contact_method: method || null,
      preferred_contact_time: orNull(clip(form.get('preferred_contact_time'), 200)),
      notes: orNull(clip(form.get('notes'), 5000)),
      tags: orNull(normalizeTags(form.get('tags'))),
    },
  };
}

const CONTACT_FIELDS = ['display_name', 'email', 'phone', 'preferred_contact_method', 'preferred_contact_time', 'notes', 'tags'];

/**
 * Edits the CONTACT record only. The original submissions keep the details the
 * customer typed. The before/after values are kept in the audit trail, and a new
 * email / phone stays on file for matching alongside the old one.
 */
export async function updateContact(db, contactId, value, actor) {
  const before = await getContact(db, contactId);
  if (!before) return { ok: false, code: 'not_found' };
  const after = { ...value, email_norm: normalizeEmail(value.email), phone_norm: normalizePhone(value.phone) };
  const diff = changes(before, after, CONTACT_FIELDS);
  if (!Object.keys(diff).length) return { ok: true, code: 'no_change' };
  const now = nowIso();
  const stmts = [
    db
      .prepare(
        'UPDATE contacts SET display_name = ?, email = ?, email_norm = ?, phone = ?, phone_norm = ?, preferred_contact_method = ?, preferred_contact_time = ?, notes = ?, tags = ?, updated_at = ? WHERE id = ?'
      )
      .bind(after.display_name, after.email, after.email_norm, after.phone, after.phone_norm, after.preferred_contact_method, after.preferred_contact_time, after.notes, after.tags, now, contactId),
  ];
  if (after.email_norm) {
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'email', ?, ?, 'edit', ?)").bind(newId(), contactId, after.email, after.email_norm, now)
    );
  }
  if (after.phone_norm) {
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'phone', ?, ?, 'edit', ?)").bind(newId(), contactId, after.phone, after.phone_norm, now)
    );
  }
  stmts.push(
    eventStmt(db, {
      contactId,
      kind: 'contact_updated',
      summary: `Contact details updated (${Object.keys(diff).map((f) => f.replace(/_/g, ' ')).join(', ')}). The original submissions were not changed.`,
      detail: { changes: diff },
      actor,
    })
  );
  await db.batch(stmts);
  return { ok: true, code: 'contact_saved' };
}

export async function setContactArchived(db, contactId, archive, actor) {
  const c = await getContact(db, contactId);
  if (!c) return { ok: false, code: 'not_found' };
  if (Boolean(c.archived_at) === archive) return { ok: true, code: 'no_change' };
  if (archive) {
    const open = await db.prepare('SELECT COUNT(*) AS n FROM opportunities WHERE contact_id = ? AND archived_at IS NULL').bind(contactId).first();
    if (open.n > 0) return { ok: false, code: 'contact_has_open_projects' };
  }
  await db.batch([
    db.prepare('UPDATE contacts SET archived_at = ?, updated_at = ? WHERE id = ?').bind(archive ? nowIso() : null, nowIso(), contactId),
    eventStmt(db, { contactId, kind: archive ? 'contact_archived' : 'contact_unarchived', summary: archive ? 'Contact archived' : 'Contact restored from the archive', actor }),
  ]);
  return { ok: true, code: archive ? 'contact_archived' : 'contact_unarchived' };
}

// ---------------------------------------------------------------- project editing

export function readOpportunityForm(form) {
  const v = {
    title: clip(form.get('title'), 200),
    renovation_type: orNull(clip(form.get('renovation_type'), 300)),
    property_address: orNull(clip(form.get('property_address'), 300)),
    property_city: orNull(clip(form.get('property_city'), 200)),
    property_postal_code: orNull(clip(form.get('property_postal_code'), 12)),
    scope: orNull(clip(form.get('scope'), 5000)),
    description: orNull(clip(form.get('description'), 5000)),
    desired_start_date: orNull(clip(form.get('desired_start_date'), 10)),
    desired_start_note: orNull(clip(form.get('desired_start_note'), 300)),
    target_completion_date: orNull(clip(form.get('target_completion_date'), 10)),
    target_completion_note: orNull(clip(form.get('target_completion_note'), 300)),
    budget_status: clip(form.get('budget_status'), 20) || 'not_discussed',
    budget_min: null,
    budget_max: null,
    budget_currency: clip(form.get('budget_currency'), 3).toUpperCase() || 'CAD',
    is_homeowner: clip(form.get('is_homeowner'), 10) || 'unknown',
    decision_maker: orNull(clip(form.get('decision_maker'), 300)),
    priority: clip(form.get('priority'), 10) || 'normal',
    marketing_source: clip(form.get('marketing_source'), 30) || 'unknown',
    customer_reported_source: orNull(clip(form.get('customer_reported_source'), 200)),
  };
  if (!v.title) v.title = v.renovation_type || 'Project details not yet recorded';
  if (v.property_postal_code) {
    if (!POSTAL_RE.test(v.property_postal_code)) return { ok: false, code: 'bad_postal' };
    v.property_postal_code = v.property_postal_code.replace(/[\s-]/g, '').replace(/^(...)(...)$/, '$1 $2').toUpperCase();
  }
  for (const f of ['desired_start_date', 'target_completion_date']) {
    if (v[f] && !isValidDateString(v[f])) return { ok: false, code: 'bad_date' };
  }
  if (v.desired_start_date && v.target_completion_date && v.target_completion_date < v.desired_start_date) return { ok: false, code: 'dates_order' };
  if (!['not_discussed', 'stated'].includes(v.budget_status)) return { ok: false, code: 'bad_request' };
  if (!['CAD', 'USD'].includes(v.budget_currency)) return { ok: false, code: 'bad_currency' };
  if (v.budget_status === 'stated') {
    const num = (raw) => {
      const s = clip(raw, 14).replace(/[$,\s]/g, '');
      if (!s) return null;
      return /^\d+$/.test(s) ? Number(s) : NaN;
    };
    const min = num(form.get('budget_min'));
    const max = num(form.get('budget_max'));
    if (Number.isNaN(min) || Number.isNaN(max)) return { ok: false, code: 'bad_budget' };
    if (min === null && max === null) return { ok: false, code: 'budget_needed' };
    if (min !== null && max !== null && max < min) return { ok: false, code: 'bad_budget' };
    v.budget_min = min;
    v.budget_max = max;
  }
  if (!['unknown', 'yes', 'no'].includes(v.is_homeowner)) return { ok: false, code: 'bad_request' };
  if (!keys(PRIORITIES).includes(v.priority)) return { ok: false, code: 'bad_request' };
  if (!keys(MARKETING_SOURCES).includes(v.marketing_source)) return { ok: false, code: 'bad_request' };
  return { ok: true, value: v };
}

const OPP_FIELDS = [
  'title', 'renovation_type', 'property_address', 'property_city', 'property_postal_code', 'scope', 'description',
  'desired_start_date', 'desired_start_note', 'target_completion_date', 'target_completion_note',
  'budget_status', 'budget_min', 'budget_max', 'budget_currency', 'is_homeowner', 'decision_maker',
  'priority', 'marketing_source', 'customer_reported_source',
];

export async function updateOpportunity(db, oppId, value, actor) {
  const before = await getOpportunity(db, oppId);
  if (!before) return { ok: false, code: 'not_found' };
  const diff = changes(before, value, OPP_FIELDS);
  if (!Object.keys(diff).length) return { ok: true, code: 'no_change' };
  await db.batch([
    db
      .prepare(
        `UPDATE opportunities SET title = ?, renovation_type = ?, property_address = ?, property_city = ?, property_postal_code = ?, scope = ?, description = ?,
           desired_start_date = ?, desired_start_note = ?, target_completion_date = ?, target_completion_note = ?,
           budget_status = ?, budget_min = ?, budget_max = ?, budget_currency = ?, is_homeowner = ?, decision_maker = ?,
           priority = ?, marketing_source = ?, customer_reported_source = ?, updated_at = ? WHERE id = ?`
      )
      .bind(...OPP_FIELDS.map((f) => value[f] ?? null), nowIso(), before.id),
    eventStmt(db, {
      contactId: before.contact_id,
      opportunityId: before.id,
      kind: 'project_updated',
      summary: `Project details updated (${Object.keys(diff).map((f) => f.replace(/_/g, ' ')).join(', ')})`,
      detail: { changes: diff },
      actor,
    }),
  ]);
  return { ok: true, code: 'project_saved' };
}

export async function setDeliveryStatus(db, oppId, status, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  if (!keys(DELIVERY_STATUSES).includes(status)) return { ok: false, code: 'bad_request' };
  if (opp.stage !== 'won') return { ok: false, code: 'delivery_needs_won' };
  if (opp.delivery_status === status) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare('UPDATE opportunities SET delivery_status = ?, updated_at = ? WHERE id = ?').bind(status, nowIso(), opp.id),
    eventStmt(db, { contactId: opp.contact_id, opportunityId: opp.id, kind: 'delivery_status', summary: `Work status set to "${status.replace(/_/g, ' ')}" (separate from the sales outcome)`, detail: { from: opp.delivery_status, to: status }, actor }),
  ]);
  return { ok: true, code: 'delivery_saved' };
}

// ---------------------------------------------------------------- stage

/** Mirrors the stage onto the older six-value leads.status, keeping the follow-up sender and the previous dashboard version coherent. */
function mirrorStatusStmt(db, oppId, stage) {
  const legacy = LEGACY_MIRROR[stage];
  if (!legacy) return null;
  return db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE opportunity_id = ?').bind(legacy, nowIso(), oppId);
}

/**
 * Moves a project to a stage. Lost needs a reason; On hold needs a reason and a
 * review date; a reason marked "other" needs a note. Reopening a closed project
 * is allowed but never restarts an email sequence.
 */
export async function setStage(db, oppId, input, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  const stage = String(input.stage || '');
  if (!STAGE_KEYS.includes(stage)) return { ok: false, code: 'bad_stage' };
  if (opp.stage === stage && stage !== 'on_hold' && stage !== 'lost') return { ok: true, code: 'no_change' };
  const note = orNull(clip(input.note, 1000));
  let reason = null;
  let review = null;
  if (stage === 'lost') {
    reason = clip(input.reason, 30);
    if (!keys(LOST_REASONS).includes(reason)) return { ok: false, code: 'reason_required' };
    if (reason === 'other' && !note) return { ok: false, code: 'note_required' };
  } else if (stage === 'on_hold') {
    reason = clip(input.reason, 30);
    if (!keys(HOLD_REASONS).includes(reason)) return { ok: false, code: 'reason_required' };
    if (reason === 'other' && !note) return { ok: false, code: 'note_required' };
    review = clip(input.reviewOn, 10);
    if (!isValidDateString(review)) return { ok: false, code: 'hold_review_required' };
    if (review < torontoToday()) return { ok: false, code: 'hold_review_past' };
  }
  if (opp.stage === stage && stage === 'lost' && opp.stage_reason === reason && (opp.stage_note || null) === note) return { ok: true, code: 'no_change' };
  if (opp.stage === 'on_hold' && stage === 'on_hold' && opp.stage_reason === reason && opp.hold_review_on === review && (opp.stage_note || null) === note) return { ok: true, code: 'no_change' };

  const now = nowIso();
  const from = opp.stage;
  const reopened = CLOSED_STAGES.includes(from) && !CLOSED_STAGES.includes(stage);
  const holdFrom = stage === 'on_hold' ? (from === 'on_hold' ? opp.hold_from_stage : from) : null;
  const reasonText = stage === 'lost' ? reasonLabel(LOST_REASONS, reason) : stage === 'on_hold' ? reasonLabel(HOLD_REASONS, reason) : null;
  const stmts = [
    db
      .prepare('UPDATE opportunities SET stage = ?, stage_needs_review = 0, stage_changed_at = ?, stage_reason = ?, stage_note = ?, hold_from_stage = ?, hold_review_on = ?, updated_at = ? WHERE id = ?')
      .bind(stage, now, reason, note, holdFrom, review, now, opp.id),
  ];
  const mirror = mirrorStatusStmt(db, opp.id, stage);
  if (mirror) stmts.push(mirror);
  const fromLabel = from ? STAGE_LABEL[from] || from : 'no stage yet';
  stmts.push(
    eventStmt(db, {
      contactId: opp.contact_id,
      opportunityId: opp.id,
      kind: reopened ? 'project_reopened' : 'stage_changed',
      summary: `${from === stage ? `Details updated for stage ${STAGE_LABEL[stage]}` : `${reopened ? 'Reopened: s' : 'S'}tage changed from ${fromLabel} to ${STAGE_LABEL[stage]}`}${reasonText ? ` (${reasonText})` : ''}${review ? `. Review on ${review}` : ''}${reopened ? '. Follow-up emails are not restarted automatically.' : ''}`,
      detail: { from, to: stage, reason, note, review_on: review, reopened },
      actor,
    })
  );
  await db.batch(stmts);

  // What the change means for automatic follow-up emails on THIS project only.
  const stopReason = STAGE_STOPS_SEQUENCE[stage];
  if (stopReason) await stopEnrollmentsForOpportunity(db, opp.id, stopReason, actor);
  else if (stage === 'on_hold') await pauseEnrollmentsForOpportunity(db, opp.id, actor);
  return { ok: true, code: 'stage_saved' };
}

/** Resume from hold: back to the stage it was on (an explicit action; a paused email sequence is NOT resumed automatically). */
export async function resumeFromHold(db, oppId, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  if (opp.stage !== 'on_hold') return { ok: true, code: 'no_change' };
  const target = STAGE_KEYS.includes(opp.hold_from_stage) && opp.hold_from_stage !== 'on_hold' ? opp.hold_from_stage : 'new_inquiry';
  return setStage(db, oppId, { stage: target }, actor);
}

// ---------------------------------------------------------------- qualification

export async function setQualification(db, oppId, input, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  const value = clip(input.value, 20);
  if (!keys(QUALIFICATION).includes(value)) return { ok: false, code: 'bad_request' };
  const note = orNull(clip(input.note, 1000));
  let reason = null;
  if (value === 'not_a_fit') {
    reason = clip(input.reason, 30);
    if (!keys(NOT_FIT_REASONS).includes(reason)) return { ok: false, code: 'reason_required' };
    if (reason === 'other' && !note) return { ok: false, code: 'note_required' };
  }
  if (opp.qualification === value && (opp.qualification_reason || null) === reason && (opp.qualification_note || null) === note) return { ok: true, code: 'no_change' };
  const now = nowIso();
  const label = { not_assessed: 'Not assessed', qualified: 'Qualified', not_a_fit: 'Not a fit' }[value];
  await db.batch([
    db.prepare('UPDATE opportunities SET qualification = ?, qualification_reason = ?, qualification_note = ?, qualification_at = ?, updated_at = ? WHERE id = ?').bind(value, reason, note, value === 'not_assessed' ? null : now, now, opp.id),
    eventStmt(db, {
      contactId: opp.contact_id,
      opportunityId: opp.id,
      kind: 'qualification_changed',
      summary: `Qualification set to ${label}${reason ? ` (${reasonLabel(NOT_FIT_REASONS, reason)})` : ''}`,
      detail: { from: opp.qualification, to: value, reason, note },
      actor,
    }),
  ]);
  if (value === 'not_a_fit') await stopEnrollmentsForOpportunity(db, opp.id, 'not_a_fit', actor);
  return { ok: true, code: 'qualification_saved' };
}

// ---------------------------------------------------------------- contractor, archive, test flag

export async function assignContractor(db, oppId, contractorId, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  const target = String(contractorId || '');
  let contractor = null;
  if (target) {
    if (!ID_RE.test(target)) return { ok: false, code: 'bad_contractor' };
    contractor = await db.prepare('SELECT id, name FROM contractors WHERE id = ? AND archived_at IS NULL').bind(target).first();
    if (!contractor) return { ok: false, code: 'bad_contractor' };
  }
  if ((opp.contractor_id || null) === (contractor ? contractor.id : null)) return { ok: true, code: 'no_change' };
  const now = nowIso();
  await db.batch([
    db.prepare('UPDATE opportunities SET contractor_id = ?, updated_at = ? WHERE id = ?').bind(contractor ? contractor.id : null, now, opp.id),
    db.prepare('UPDATE leads SET contractor_id = ?, updated_at = ? WHERE opportunity_id = ?').bind(contractor ? contractor.id : null, now, opp.id),
    eventStmt(db, {
      contactId: opp.contact_id,
      opportunityId: opp.id,
      kind: contractor ? 'contractor_assigned' : 'contractor_unassigned',
      summary: contractor
        ? `Contractor assigned: ${contractor.name}${opp.contractor_name ? ` (was ${opp.contractor_name})` : ''}. Internal record only; nothing was sent to the contractor.`
        : `Contractor unassigned (was ${opp.contractor_name || 'unknown'})`,
      detail: { from: opp.contractor_id, to: contractor ? contractor.id : null },
      actor,
    }),
  ]);
  return { ok: true, code: 'contractor_saved' };
}

export async function setArchived(db, oppId, archive, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  if (Boolean(opp.archived_at) === archive) return { ok: true, code: 'no_change' };
  const now = nowIso();
  await db.batch([
    db.prepare('UPDATE opportunities SET archived_at = ?, updated_at = ? WHERE id = ?').bind(archive ? now : null, now, opp.id),
    db.prepare('UPDATE leads SET archived_at = ?, updated_at = ? WHERE opportunity_id = ?').bind(archive ? now : null, now, opp.id),
    eventStmt(db, { contactId: opp.contact_id, opportunityId: opp.id, kind: archive ? 'project_archived' : 'project_unarchived', summary: archive ? 'Project archived (nothing is deleted)' : 'Project restored from the archive. Follow-up emails are not restarted automatically.', actor }),
  ]);
  if (archive) await stopEnrollmentsForOpportunity(db, opp.id, 'archived', actor);
  return { ok: true, code: archive ? 'archived' : 'unarchived' };
}

/** Test records stay in the database and can be listed, but are excluded from business counts by default. */
export async function setTestFlag(db, oppId, flag, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  const value = flag ? 1 : 0;
  if (Number(opp.is_test) === value) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare('UPDATE opportunities SET is_test = ?, updated_at = ? WHERE id = ?').bind(value, nowIso(), opp.id),
    db
      .prepare('UPDATE contacts SET is_test = CASE WHEN EXISTS (SELECT 1 FROM opportunities WHERE contact_id = ? AND is_test = 0) THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?')
      .bind(opp.contact_id, nowIso(), opp.contact_id),
    eventStmt(db, { contactId: opp.contact_id, opportunityId: opp.id, kind: 'test_flag', summary: value ? 'Marked as a test record (excluded from business counts; nothing is deleted)' : 'Test-record mark removed', actor }),
  ]);
  return { ok: true, code: value ? 'test_marked' : 'test_unmarked' };
}

// ---------------------------------------------------------------- notes

export async function addNote(db, oppId, body, actor) {
  const text = clip(body, 5001);
  if (!text) return { ok: false, code: 'note_empty' };
  if (text.length > 5000) return { ok: false, code: 'note_long' };
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  await db.batch([
    eventStmt(db, { contactId: opp.contact_id, opportunityId: opp.id, kind: 'note', summary: text, actor }),
    db.prepare('UPDATE opportunities SET updated_at = ? WHERE id = ?').bind(nowIso(), opp.id),
  ]);
  return { ok: true, code: 'note_saved' };
}

// ---------------------------------------------------------------- communication permissions (per person)

/**
 * Appends a permission record (granted / withdrawn) for one channel. The current
 * state of a channel is its newest record. Withdrawing EMAIL permission also
 * ends recorded follow-up permission and stops open follow-up sequences for the
 * contact's addresses; nothing is ever restarted automatically.
 */
export async function recordPermission(db, contactId, input, actor) {
  const c = await getContact(db, contactId);
  if (!c) return { ok: false, code: 'not_found' };
  const channel = clip(input.channel, 10);
  const status = clip(input.status, 10);
  const method = clip(input.method, 20);
  const givenOn = clip(input.givenOn, 10);
  const evidence = clip(input.evidence, 501);
  if (!keys(PERMISSION_CHANNELS).includes(channel) || !['granted', 'withdrawn'].includes(status) || !keys(PERMISSION_METHODS).includes(method)) return { ok: false, code: 'bad_request' };
  if (!isValidDateString(givenOn) || givenOn > torontoToday()) return { ok: false, code: 'consent_date' };
  if (evidence.length < 5) return { ok: false, code: 'consent_evidence' };
  if (evidence.length > 500) return { ok: false, code: 'consent_evidence_long' };
  await db.batch([
    db.prepare('INSERT INTO contact_permissions (id, contact_id, channel, status, method, given_on, evidence, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newId(), contactId, channel, status, method, givenOn, evidence, actor, nowIso()),
    eventStmt(db, { contactId, kind: 'permission_recorded', summary: `${status === 'granted' ? 'Permission recorded' : 'Permission withdrawn'}: ${channel === 'text' ? 'text messages' : channel === 'phone' ? 'phone calls' : 'email'}`, detail: { channel, status, method, given_on: givenOn }, actor }),
  ]);
  if (channel === 'email' && status === 'withdrawn') {
    const addrs = (await db.prepare("SELECT DISTINCT norm FROM contact_identifiers WHERE contact_id = ? AND kind = 'email'").bind(contactId).all()).results || [];
    for (const a of addrs) {
      await withdrawConsentsForEmail(db, a.norm, 'Permission withdrawn (recorded on the contact)');
      await stopEnrollmentsForEmail(db, a.norm, 'withdrawn', actor);
    }
  }
  return { ok: true, code: 'permission_saved' };
}

// ---------------------------------------------------------------- manual entry (phone, referral, social)

/**
 * Records an inquiry that did not come through a website form. It creates the
 * original submission (source = the channel), a contact (or reuses the one given)
 * and a project. Only a name and one way to reach the person are required; a
 * phone-only caller gets NO email address made up for them. It sends nothing:
 * no confirmation or notification email jobs are created.
 */
export async function createManualProject(db, { contactId, contactValue, projectValue, channel, receivedLocal, receivedAtIso }, actor) {
  if (!MANUAL_SOURCE_KEYS.includes(channel)) return { ok: false, code: 'bad_channel' };
  let receivedAt = nowIso();
  if (receivedAtIso) {
    receivedAt = receivedAtIso; // an exact instant supplied by the system (for example when a call arrived)
  } else if (receivedLocal) {
    receivedAt = torontoInputToUtcIso(receivedLocal);
    if (!receivedAt) return { ok: false, code: 'bad_datetime' };
    if (Date.parse(receivedAt) > Date.now() + 5 * 60 * 1000) return { ok: false, code: 'received_future' };
  }
  let contact = null;
  const stmts = [];
  if (contactId) {
    contact = await getContact(db, contactId);
    if (!contact) return { ok: false, code: 'not_found' };
  }
  const now = nowIso();
  const leadId = newId();
  const oppId = newId();
  let cid = contact ? contact.id : newId();
  const c = contact || contactValue;
  if (!contact) {
    const emailNorm = normalizeEmail(c.email);
    const phoneNorm = normalizePhone(c.phone);
    stmts.push(
      db
        .prepare('INSERT INTO contacts (id, display_name, email, email_norm, phone, phone_norm, preferred_contact_method, preferred_contact_time, notes, tags, created_at, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cid, c.display_name, c.email, emailNorm, c.phone, phoneNorm, c.preferred_contact_method, c.preferred_contact_time, c.notes, c.tags, now, actor, now)
    );
    if (emailNorm) stmts.push(db.prepare("INSERT INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'email', ?, ?, 'manual', ?)").bind(newId(), cid, c.email, emailNorm, now));
    if (phoneNorm) stmts.push(db.prepare("INSERT INTO contact_identifiers (id, contact_id, kind, value, norm, source, created_at) VALUES (?, ?, 'phone', ?, ?, 'manual', ?)").bind(newId(), cid, c.phone, phoneNorm, now));
  }
  const p = projectValue;
  const locationText = [p.property_city, p.property_postal_code].filter(Boolean).join(' ');
  stmts.push(
    // The original submission: exactly what was recorded at intake. Email / phone stay blank when not given.
    db
      .prepare(
        `INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, target_deadline, project_details,
           source, status, customer_email_status, internal_email_status, contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'not_applicable', 'not_applicable', ?)`
      )
      .bind(leadId, `manual-${leadId}`, receivedAt, c.display_name, c.email || '', c.phone || '', locationText, p.renovation_type || p.title || '', p.desired_start_note || '', p.target_completion_note, p.description, channel, cid),
    db
      .prepare(
        `INSERT INTO opportunities (id, contact_id, title, renovation_type, property_address, property_city, property_postal_code, scope, description,
           desired_start_date, desired_start_note, target_completion_date, target_completion_note, budget_status, budget_min, budget_max, budget_currency,
           is_homeowner, decision_maker, stage, legacy_status, stage_changed_at, priority, marketing_source, customer_reported_source, created_at, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new_inquiry', 'new', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(oppId, cid, p.title, p.renovation_type, p.property_address, p.property_city, p.property_postal_code, p.scope, p.description,
        p.desired_start_date, p.desired_start_note, p.target_completion_date, p.target_completion_note, p.budget_status, p.budget_min, p.budget_max, p.budget_currency,
        p.is_homeowner, p.decision_maker, receivedAt, p.priority, p.marketing_source, p.customer_reported_source, now, actor, now),
    db.prepare('UPDATE leads SET opportunity_id = ? WHERE id = ?').bind(oppId, leadId),
    eventStmt(db, { contactId: cid, opportunityId: oppId, kind: 'project_created', summary: `Project entered manually (${channel === 'phone' ? 'phone call' : channel === 'social' ? 'social media' : channel}). No email was sent.`, detail: { channel }, actor, at: receivedAt })
  );
  await db.batch(stmts);
  return { ok: true, code: 'project_created', opportunityId: oppId, contactId: cid };
}

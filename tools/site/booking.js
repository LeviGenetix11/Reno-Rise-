// Consultation booking (Cal.com) settings for the site generators.
//
// The booking page, the thank-you page button and the follow-up link are published ONLY when booking-config.json says
// `"enabled": true` AND holds a real Cal.com link. Until then nothing about booking appears on the public site, so a
// visitor can never reach a broken booking link.
//
// Development: `RENORISE_BOOKING_DEV=1 node tools/site/build.js` builds the booking pages with clearly fake placeholder
// values so the layout can be checked. That output must never be committed: check.js fails while any page still
// contains the placeholder, and a normal build (without the variable) removes the pages again.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'booking-config.json');
const DEV = process.env.RENORISE_BOOKING_DEV === '1';
const PLACEHOLDER = 'dev-placeholder';

const CAL_LINK_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/; // "username/event-slug" (or "team/x/y")
const ORIGIN_RE = /^https:\/\/[A-Za-z0-9.-]+$/;

function load() {
  if (DEV) {
    return { enabled: true, dev: true, calLink: `${PLACEHOLDER}/free-renovation-consultation`, hostedUrl: `https://cal.com/${PLACEHOLDER}/free-renovation-consultation`, origin: 'https://app.cal.com' };
  }
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    throw new Error(`booking-config.json is missing or not valid JSON: ${err.message}`);
  }
  const cfg = { enabled: raw.enabled === true, dev: false, calLink: String(raw.calLink || '').trim(), hostedUrl: String(raw.hostedUrl || '').trim(), origin: String(raw.origin || 'https://app.cal.com').trim() };
  if (!cfg.enabled) return cfg;
  const problems = [];
  if (!CAL_LINK_RE.test(cfg.calLink)) problems.push('calLink must look like "your-username/free-renovation-consultation"');
  if (!/^https:\/\/[^\s"'<>]+$/.test(cfg.hostedUrl)) problems.push('hostedUrl must be the https:// address of the hosted Cal.com booking page');
  if (!ORIGIN_RE.test(cfg.origin)) problems.push('origin must be an https:// origin such as https://app.cal.com');
  if (cfg.calLink.includes(PLACEHOLDER) || cfg.hostedUrl.includes(PLACEHOLDER)) problems.push('placeholder values may not be published');
  if (problems.length) throw new Error(`booking-config.json is enabled but invalid:\n  - ${problems.join('\n  - ')}`);
  return cfg;
}

module.exports = { load, PLACEHOLDER };

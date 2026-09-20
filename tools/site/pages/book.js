// Generates: book/index.html (the consultation booking page) - only when booking is enabled in booking-config.json.
// When it is not enabled the page is removed, so the public site never links to a booking page that does not work.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const B = require('../booking');

const cfg = B.load();
const target = path.join(U.ROOT, 'book', 'index.html');

if (!cfg.enabled) {
  if (fs.existsSync(target)) {
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
    console.log('removed book/ (booking is not enabled in tools/site/booking-config.json)');
  } else {
    console.log('booking not enabled: no /book/ page generated');
  }
  return;
}

const depth = 1;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const main = `
<section class="section">
  <div class="container book-wrap">
    <div class="book-intro">
      <h2>A short phone call about your renovation</h2>
      <p>Choose a time for a free 15-minute phone call with Reno Rise. We will talk through your renovation, answer initial questions, and go over the next steps.</p>
      <ul class="check-list">
        <li>${L.ICON.check} <span><strong>Reno Rise will call the phone number you enter</strong> when you book. There is nothing to dial in to.</span></li>
        <li>${L.ICON.check} <span>It is a short phone call, not a site visit. It is not a quote, and it is not a commitment.</span></li>
        <li>${L.ICON.check} <span>Times are shown in your own time zone. Reno Rise is in Toronto, on Eastern Time.</span></li>
        <li>${L.ICON.check} <span>Cal.com, the scheduling service we use, emails you a confirmation with links to reschedule or cancel.</span></li>
      </ul>
    </div>

    <div class="book-embed-wrap">
      <p class="book-status" id="book-status" role="status" aria-live="polite">Loading the booking calendar&hellip;</p>
      <div class="book-embed" id="book-embed" role="region" aria-label="Choose a call time" data-cal-link="${esc(cfg.calLink)}" data-cal-namespace="${esc(cfg.namespace)}" data-cal-origin="${esc(cfg.origin)}"></div>
      <noscript><p class="book-noscript">The booking calendar needs JavaScript. <a href="${esc(cfg.hostedUrl)}" rel="noopener noreferrer">Open the booking page</a> instead, or call ${L.PHONE_DISPLAY}.</p></noscript>
    </div>

    <p class="book-fallback" id="book-fallback">Calendar not showing? <a href="${esc(cfg.hostedUrl)}" target="_blank" rel="noopener noreferrer">Open the booking page in a new tab</a>, or call <a href="tel:${L.PHONE_TEL}">${L.PHONE_DISPLAY}</a>.</p>

    <p class="form-note book-note">When you book, the name, email, phone number and note you enter go to Cal.com and its calendar provider so the call can be scheduled; Reno Rise also receives them. See our <a href="${L.href(depth, 'privacy/')}">Privacy Policy</a>. Booking is optional and does not by itself agree to receive marketing emails.</p>
    <p class="form-note book-note">Prefer to share your project details first? <a href="${L.href(depth, 'assessment/')}">Request a Basement Assessment</a>.</p>
  </div>
</section>
`;

const script = `<script src="${L.up(depth)}js/book.js"></script>\n`;

U.write('book/index.html', PG.renderPage({
  depth,
  path: 'book/',
  title: 'Book a Free Renovation Consultation | Reno Rise',
  description: 'Choose a time for a free 15-minute phone call with Reno Rise about your basement or renovation project.',
  hero: PG.pageHero({ depth, h1: 'Book Your Free Renovation Consultation', crumbs: [['Home', ''], ['Book a Consultation', '']], variant: 'hero-dark' }),
  robots: 'noindex, follow',
  main,
  noCta: true,
  script,
}));

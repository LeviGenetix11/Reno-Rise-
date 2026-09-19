// Shared page components for the Reno Rise static site.
// Every page repeats the same header / mobile nav / footer / CTA band markup, so
// tools/site/sync.js regenerates those blocks from this file. Edit here, then run:
//   node tools/site/sync.js
'use strict';

const SITE = 'https://www.renosrise.com';
const PHONE_DISPLAY = '(289) 512-8112';
const PHONE_TEL = '+12895128112';
const EMAIL = 'hello@renosrise.com';

const DISCLOSURE =
  'Reno Rise is an independent project-enquiry and contractor-matching service. Renovation services, estimates, contracts, warranties, and regulatory responsibilities are provided by the professional you choose. Confirm credentials, insurance, references, and permit responsibilities before hiring.';

const POSITIONING =
  'Reno Rise helps Toronto homeowners plan basement renovations and legal secondary suites and connect with qualified local professionals.';

// Canonical destinations (relative to site root). Folder pages end in "/".
const P = {
  home: '',
  basement: 'services/basement-renovation/',
  suite: 'services/legal-basement-apartment-toronto/',
  services: 'services/',
  basementServices: 'services/#basement-renovations-secondary-suites',
  otherServices: 'services/#other-home-improvement-services',
  guides: 'blog/',
  assessment: 'assessment/',
  about: 'about.html',
  contact: 'contact.html',
  areas: 'locations/',
  privacy: 'privacy/',
  terms: 'terms/',
  torontoBasement: 'services/basement-renovation-toronto/',
};

const BASEMENT_MENU = [
  ['Basement Finishing', 'services/basement-finishing/'],
  ['Underpinning & Bench Footing', 'services/underpinning/'],
  ['Interior Waterproofing', 'services/interior-waterproofing/'],
  ['Exterior Waterproofing', 'services/exterior-waterproofing/'],
  ['Wet Basement Repair', 'services/wet-basement-repair/'],
  ['Egress Windows', 'services/egress-windows/'],
  ['Walkout & Separate Entrances', 'services/walkout-construction/'],
  ['Basement Soundproofing', 'services/basement-soundproofing/'],
  ['Sump Pumps & Backwater Valves', 'services/sump-pump-installation/'],
  ['Basement Renovation in Toronto', 'services/basement-renovation-toronto/'],
];

const up = (depth) => (depth === 0 ? './' : '../'.repeat(depth));
const href = (depth, target) => (target === '' ? up(depth) : up(depth) + target);

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crumb: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-4.35-9.5-8.5C.7 8.3 3 4.5 7 4.5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.3 3.8 4.5 8-2.5 4.15-9.5 8.5-9.5 8.5z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c1 .4 2 .6 3 .7a2 2 0 0 1 1.6 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4z"/><path d="m4 6 8 7 8-7"/></svg>',
};

/** Header + mobile nav. `solid` = opaque header (all pages except the homepage). */
function header(depth, { solid = true, active = '' } = {}) {
  const a = (key, target, label) =>
    `<a href="${href(depth, target)}"${active === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  const menu = BASEMENT_MENU.map(([label, t]) => `          <li><a href="${href(depth, t)}">${label.replace(/&/g, '&amp;')}</a></li>`).join('\n');
  const mobileSub = BASEMENT_MENU.map(([label, t]) => `    <a href="${href(depth, t)}" class="mobile-sub">${label.replace(/&/g, '&amp;')}</a>`).join('\n');
  return `<!-- ========== HEADER ========== -->
<header class="site-header${solid ? ' solid' : ''}">
  <div class="container header-inner">
    <a href="${href(depth, P.home)}" class="logo">
      <span class="logo-mark"><img src="${up(depth)}images/favicon.png" alt="Reno Rise logo"></span>
      <span class="logo-text"><b>Reno Rise</b><span class="header-slogan">Basement &amp; Legal Suite Planning</span></span>
    </a>

    <nav class="main-nav" aria-label="Main">
      ${a('home', P.home, 'Home')}
      ${a('basement', P.basement, 'Basement Renovations')}
      ${a('suite', P.suite, 'Legal Secondary Suites')}
      <div class="nav-dropdown">
        <button type="button" class="nav-dropdown-toggle${active === 'basement-services' ? ' active' : ''}" aria-expanded="false" aria-controls="nav-basement-services">Basement Services ${ICON.chevron}</button>
        <ul class="nav-dropdown-menu" id="nav-basement-services">
${menu}
          <li class="nav-dropdown-all"><a href="${href(depth, P.basementServices)}">All basement services</a></li>
        </ul>
      </div>
      ${a('guides', P.guides, 'Cost &amp; Permit Guides')}
      ${a('other', P.otherServices, 'Other Services')}
    </nav>

    <div class="header-cta">
      <a href="${href(depth, P.assessment)}" class="btn btn-primary">
        Request a Basement Assessment
        ${ICON.arrow}
      </a>
      <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>
</header>

<!-- ========== MOBILE NAV ========== -->
<div class="mobile-nav" role="dialog" aria-modal="true" aria-label="Site menu">
  <div class="mobile-nav-head">
    <span class="logo">
      <span class="logo-mark"><img src="${up(depth)}images/favicon.png" alt="Reno Rise logo"></span>
      <span class="logo-text"><b style="color:#fff">Reno Rise</b></span>
    </span>
    <button class="mobile-nav-close icon-btn" type="button" style="background:transparent;border-color:rgba(255,255,255,.3);color:#fff" aria-label="Close menu">
      <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>
  <p class="logo-tagline">Basement &amp; Legal Suite Planning</p>
  <a href="${href(depth, P.home)}">Home</a>
  <a href="${href(depth, P.basement)}">Basement Renovations</a>
  <a href="${href(depth, P.suite)}">Legal Secondary Suites</a>
  <a href="${href(depth, P.basementServices)}">Basement Services</a>
${mobileSub}
  <a href="${href(depth, P.guides)}">Cost &amp; Permit Guides</a>
  <a href="${href(depth, P.otherServices)}">Other Services</a>
  <a href="${href(depth, P.assessment)}" class="btn btn-primary">Request a Basement Assessment</a>
</div>

`;
}

function footer(depth) {
  const li = (t, label) => `        <li><a href="${href(depth, t)}">${label}</a></li>`;
  return `<footer class="site-footer">
  <div class="container footer-top">
    <div class="footer-brand">
      <a href="${href(depth, P.home)}" class="logo">
        <span class="logo-mark"><img src="${up(depth)}images/favicon.png" alt="Reno Rise logo"></span>
        <span class="logo-text"><b>Reno Rise</b></span>
      </a>
      <p class="logo-tagline">Basement &amp; Legal Suite Planning</p>
      <p>${POSITIONING}</p>
    </div>

    <div class="footer-col">
      <h3>Basements &amp; Suites</h3>
      <ul>
${li(P.basement, 'Basement Renovations')}
${li(P.suite, 'Legal Secondary Suites')}
${li('services/basement-finishing/', 'Basement Finishing')}
${li('services/underpinning/', 'Underpinning')}
${li('services/interior-waterproofing/', 'Interior Waterproofing')}
${li('services/egress-windows/', 'Egress Windows')}
      </ul>
    </div>

    <div class="footer-col">
      <h3>Resources</h3>
      <ul>
${li(P.guides, 'Basement Planning Centre')}
${li(P.otherServices, 'Other Home Improvement Services')}
${li(P.areas, 'Areas Served')}
${li(P.about, 'About Reno Rise')}
${li(P.contact, 'Contact')}
${li(P.assessment, 'Request an Assessment')}
      </ul>
    </div>

    <div class="footer-col">
      <h3>Contact</h3>
      <ul class="footer-contact">
        <li>${ICON.pin} Toronto &amp; the Greater Toronto Area</li>
        <li>${ICON.phone} <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a></li>
        <li>${ICON.mail} <a href="mailto:${EMAIL}">${EMAIL}</a></li>
      </ul>
    </div>
  </div>

  <div class="container footer-bottom">
    <p class="footer-disclosure">${DISCLOSURE}</p>
    <div class="footer-bottom-row">
      <span>© 2026 Reno Rise. All rights reserved.</span>
      <div class="footer-legal">
        <a href="${href(depth, P.privacy)}">Privacy Policy</a>
        <a href="${href(depth, P.terms)}">Terms of Service</a>
      </div>
    </div>
  </div>
</footer>`;
}

/** Bottom-of-page call to action band. */
function ctaBand(depth, { heading, text, tight = true } = {}) {
  heading = heading || 'Planning a Basement Renovation or Legal Secondary Suite?';
  text = text || 'Tell us about your basement. Reno Rise reviews your project details and connects you with an appropriate independent professional.';
  return `<!-- ========== CTA BAND ========== -->
<section class="section-tight"${tight ? ' style="padding-top:0;"' : ''}>
  <div class="container">
    <div class="cta-band">
      <div>
        <h2>${heading}</h2>
        <p>${text}</p>
      </div>
      <div class="cta-actions">
        <a href="${href(depth, P.assessment)}" class="btn btn-primary">Request a Basement Assessment ${ICON.arrow}</a>
        <a href="tel:${PHONE_TEL}" class="btn btn-outline">Call ${PHONE_DISPLAY}</a>
      </div>
    </div>
  </div>
</section>`;
}

/** Four-step "how it works" block: what Reno Rise does and what the professional does. */
function howItWorks({ heading = 'How Reno Rise Works', intro = '' } = {}) {
  const step = (n, h, p) => `      <div class="process-step">
        <span class="num-circle num-text" aria-hidden="true">${n}</span>
        <h3>${h}</h3>
        <p>${p}</p>
      </div>`;
  return `<div class="how-works">
    <h2>${heading}</h2>
    ${intro ? `<p class="how-works-intro">${intro}</p>` : ''}
    <div class="how-steps">
${step(1, 'You share your project', 'Tell us about your basement, your goals and your timeline using the assessment form.')}
${step(2, 'Reno Rise reviews requirements', 'We look at what you have submitted to understand the scope and what needs to be confirmed.')}
${step(3, 'You are connected with an independent professional', 'When there is a suitable fit, you are introduced to an appropriate professional. There is no guarantee of a match.')}
${step(4, 'The professional takes it from there', 'Estimates, contracts, credentials, warranties and the construction itself are provided by the professional you select.')}
    </div>
  </div>`;
}

function disclosure(extraClass = '') {
  return `<p class="disclosure${extraClass ? ' ' + extraClass : ''}">${DISCLOSURE}</p>`;
}

// Original, generic cross-section used as the homepage hero visual and on the suite guide.
// It is an educational illustration only (not a plan, not any real property, not to scale).
const DIAGRAM_ITEMS = [
  'Ceiling height and clearances',
  'Egress window and window well',
  'Separate entrance and stairwell',
  'Fire separation between units',
  'Waterproofing and drainage',
];
function diagramCard({ id = 'dg', caption = true } = {}) {
  const marker = (n, x, y) =>
    `<g><circle cx="${x}" cy="${y}" r="11" fill="#f0782a"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#14171d" font-family="Plus Jakarta Sans, Arial, sans-serif">${n}</text></g>`;
  const legend = DIAGRAM_ITEMS.map((t, i) => `<li><span class="dg-num" aria-hidden="true">${i + 1}</span><span>${t}</span></li>`).join('');
  return `<figure class="diagram-card" style="margin:0">
      <svg viewBox="0 0 480 330" role="img" aria-labelledby="${id}-t ${id}-d">
        <title id="${id}-t">Basement cross-section diagram</title>
        <desc id="${id}-d">Generic illustration of a house above ground and a basement below it, marking five things to check for a secondary suite: ceiling height, an egress window with a window well, a separate entrance with stairwell, the fire-separating ceiling assembly, and waterproofing with drainage.</desc>
        <rect x="10" y="120" width="460" height="200" rx="6" fill="rgba(255,255,255,0.045)"/>
        <line x1="10" y1="120" x2="470" y2="120" stroke="#f0782a" stroke-width="2"/>
        <path d="M100 64 L210 14 L320 64 M110 64 V120 M310 64 V120" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="192" y="82" width="36" height="38" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
        <rect x="134" y="80" width="30" height="24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
        <rect x="256" y="80" width="30" height="24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
        <polygon points="30,120 30,148 43,148 43,176 56,176 56,204 69,204 69,232 82,232 82,260 95,260 95,288 110,288 110,120" fill="#171b22" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
        <rect x="110" y="120" width="200" height="170" fill="#232833" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>
        <rect x="110" y="120" width="200" height="11" fill="#f0782a" opacity="0.9"/>
        <rect x="100" y="290" width="220" height="9" fill="rgba(255,255,255,0.28)"/>
        <rect x="104" y="228" width="8" height="62" fill="#fdecdf"/>
        <line x1="150" y1="134" x2="150" y2="288" stroke="rgba(255,255,255,0.75)" stroke-width="1.5"/>
        <path d="M144 140l6-8 6 8M144 282l6 8 6-8" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5"/>
        <rect x="306" y="162" width="8" height="42" fill="#cfe3ff"/>
        <path d="M314 150 V218 H362 V150" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-dasharray="5 4"/>
        <path d="M318 126 V296 H108" fill="none" stroke="#f0782a" stroke-width="2.5" stroke-dasharray="3 5" stroke-linecap="round" opacity="0.9"/>
        <circle cx="330" cy="304" r="7" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2"/>
        <line x1="322" y1="304" x2="120" y2="304" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="2 4"/>
        <rect x="160" y="200" width="96" height="60" rx="4" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="4 4"/>
        ${marker(1, 176, 172)}
        ${marker(2, 384, 184)}
        ${marker(3, 72, 140)}
        ${marker(4, 262, 152)}
        ${marker(5, 348, 268)}
      </svg>
      <ol class="diagram-legend" aria-label="Diagram key">${legend}</ol>
      ${caption ? '<figcaption class="diagram-caption">Illustration only: a generic diagram, not to scale and not any specific property. Requirements vary; confirm details with Toronto Building.</figcaption>' : ''}
    </figure>`;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = {
  SITE, PHONE_DISPLAY, PHONE_TEL, EMAIL, DISCLOSURE, POSITIONING, P, BASEMENT_MENU, ICON,
  up, href, header, footer, ctaBand, howItWorks, disclosure, diagramCard, escapeHtml,
};

// Generates: assessment/, assessment/thank-you.html, contact.html, about.html, privacy/, terms/, 404.html
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const B = require('../booking');

const form = (depth, { source, thank, type = '' }) =>
  `<div data-assessment-form-mount data-source="${source}"${type ? ` data-project-type="${type}"` : ''} data-thank-you-href="${thank}"></div>`;
const formScript = (depth) => `<script src="${L.up(depth)}js/assessment-form.js"></script>\n`;

// ---------------------------------------------------------------- assessment
(function assessment() {
  const depth = 1;
  const h = (t) => L.href(depth, t);
  const main = `
<section class="section">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">Basement assessment</span>
      <h2 style="font-size:32px;">Tell Us About Your Basement</h2>
      <p style="color:var(--muted); max-width:620px; margin:14px auto 0; text-align:center;">Share your goals and a few basement details. Reno Rise reviews your request and, where there is a suitable fit, may connect you with an independent professional.</p>
    </div>
    <div class="lead-form-wrap" style="max-width:760px; margin-left:auto; margin-right:auto;">
      ${form(depth, { source: 'assessment', thank: 'thank-you.html' })}
    </div>
  </div>
</section>
<section class="section-tight section-cream">
  <div class="container">
    ${L.howItWorks({ heading: 'What Happens Next' })}
    <p style="margin-top:24px;">Not sure where to start? Read the <a href="${h('services/legal-basement-apartment-toronto/')}" style="text-decoration:underline;color:var(--orange-a11y)">legal secondary suite guide</a> or <a href="${h('services/basement-renovation/')}" style="text-decoration:underline;color:var(--orange-a11y)">basement renovation planning</a> first.</p>
  </div>
</section>
`;
  U.write('assessment/index.html', PG.renderPage({
    depth, path: 'assessment/',
    title: 'Request a Basement Assessment in Toronto | Reno Rise',
    description: 'Tell Reno Rise about your Toronto basement project. Share your goals and details to be considered for an introduction to an independent professional.',
    hero: PG.pageHero({ depth, h1: 'Request a Basement Assessment', crumbs: [['Home', ''], ['Request Assessment', '']], variant: 'hero-dark' }),
    main, noCta: true, script: formScript(depth),
  }));
})();

// ---------------------------------------------------------------- thank you
(function thanks() {
  const depth = 1;
  const h = (t) => L.href(depth, t);
  const booking = B.load();
  // Optional consultation booking. Shown only when booking is enabled, and never an automatic redirect: the visitor chooses.
  const bookBlock = booking.enabled
    ? `<div class="ty-book" id="ty-book">
        <h2>Prefer to talk sooner?</h2>
        <p>You can choose a time for a free 15-minute phone call with Reno Rise. Booking is optional: if you would rather wait, you do not need to do anything, and Reno Rise will review your enquiry and may contact you.</p>
        <a id="ty-book-link" href="${h('book/')}" class="btn btn-primary">Book Your Free Consultation ${L.ICON.arrow}</a>
      </div>
      `
    : '';
  const main = `
<section class="section" style="min-height:50vh; display:flex; align-items:center;">
  <div class="container" style="max-width:640px; text-align:center;">
    <!-- Default state: shown to anyone who lands here without a real submission -->
    <h1 id="ty-title" style="font-size:30px;">No Request Found</h1>
    <div id="ty-fallback">
      <p style="color:var(--muted); margin:14px 0 28px;">We could not confirm a recent basement enquiry from this browser. If you would like Reno Rise to review your project, please use the assessment form.</p>
      <a href="./" class="btn btn-primary">Request a Basement Assessment ${L.ICON.arrow}</a>
    </div>
    <!-- Real success state: only shown when this browser just completed a submission -->
    <div id="ty-success" hidden>
      <span class="icon-circle" style="width:64px;height:64px;margin:0 auto 20px;">
        <svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <p style="color:var(--muted); margin:14px 0 8px;">Reno Rise will review the details you shared. If there is a suitable fit, you may be contacted by phone or email about being introduced to an independent professional.</p>
      <p style="color:var(--muted); margin:0 0 8px;">This is an enquiry, not a booking. We cannot promise an appointment, a quote, a match with a professional, or that any work is permitted.</p>
      ${bookBlock}<p style="color:var(--muted); font-size:14px; margin:0 0 26px;">In the meantime, the guides below cover what to confirm before you hire.</p>
      <div class="chip-row" style="justify-content:center; margin-bottom:26px;">
        <a class="city-chip" href="${h('services/legal-basement-apartment-toronto/')}">Legal secondary suite guide</a>
        <a class="city-chip" href="${h('blog/basement-renovation-permits-toronto.html')}">Permits in Toronto</a>
        <a class="city-chip" href="${h('blog/basement-renovation-cost-toronto.html')}">Cost factors</a>
      </div>
      <a href="../" class="btn btn-dark">Back to Home ${L.ICON.arrow}</a>
    </div>
  </div>
</section>
`;
  const script = `<script>
  // Only show the personalized success message to a browser that just
  // completed a real submission (flagged by assessment-form.js right
  // before it redirected here). Everyone else, including anyone who
  // bookmarks or shares this URL, sees the fallback above.
  (function () {
    var FLAG = 'renoriseAssessmentSubmitted';
    var justSubmitted = false;
    try { justSubmitted = sessionStorage.getItem(FLAG) === '1'; } catch (err) { justSubmitted = false; }
    if (justSubmitted) {
      document.getElementById('ty-fallback').hidden = true;
      document.getElementById('ty-success').hidden = false;
      document.getElementById('ty-title').textContent = 'Thanks — we have your basement enquiry.';
      try { sessionStorage.removeItem(FLAG); } catch (err) { /* ignore */ }
${booking.enabled ? `      // The booking link carries only an opaque reference (never contact details); it is a hint, not proof of identity.
      var link = document.getElementById('ty-book-link');
      var ref = null;
      try { ref = sessionStorage.getItem('renoriseBookingRef'); sessionStorage.removeItem('renoriseBookingRef'); } catch (err) { ref = null; }
      if (link && ref && /^[A-Za-z0-9_-]{20,64}$/.test(ref)) link.href = link.getAttribute('href') + '?r=' + ref;
` : ''}    }
  })();
</script>
`;
  U.write('assessment/thank-you.html', PG.renderPage({
    depth, path: 'assessment/thank-you.html',
    title: 'Thank You | Reno Rise',
    description: 'Your basement enquiry has been received by Reno Rise.',
    robots: 'noindex', main, noCta: true, script,
  }));
})();

// ---------------------------------------------------------------- contact
(function contact() {
  const depth = 0;
  const h = (t) => L.href(depth, t);
  const main = `
<section class="section">
  <div class="container contact-grid">
    <div class="lead-form-wrap">
      <h2 style="font-size:20px; margin-bottom:6px;">Request a Basement Assessment</h2>
      <p class="sub">Tell us about your basement project. Reno Rise reviews the details and, where there is a suitable fit, may connect you with an independent professional.</p>
      ${form(depth, { source: 'contact', thank: 'assessment/thank-you.html' })}
    </div>
    <div>
      <div style="background:var(--dark); border-radius:var(--radius-lg); padding:36px; color:#fff; margin-bottom:24px;">
        <h2 style="color:#fff; font-size:19px; margin-bottom:20px;">Contact Details</h2>
        <ul class="footer-contact" style="color:rgba(255,255,255,0.8);">
          <li>${L.ICON.pin} Toronto &amp; the Greater Toronto Area</li>
          <li>${L.ICON.phone} <a href="tel:${L.PHONE_TEL}" style="color:#fff;">${L.PHONE_DISPLAY}</a></li>
          <li>${L.ICON.mail} <a href="mailto:${L.EMAIL}" style="color:#fff;">${L.EMAIL}</a></li>
        </ul>
        <div style="border-top:1px solid rgba(255,255,255,0.12); margin-top:20px; padding-top:20px;">
          <p style="color:rgba(255,255,255,0.6); font-size:13px; margin:0 0 6px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Office &amp; Inquiry Hours</p>
          <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:0 0 10px;">Every day: 8:00 AM – 8:00 PM</p>
          <p style="color:rgba(255,255,255,0.6); font-size:12.5px; margin:0; line-height:1.5;">Submit an assessment request anytime. Inquiries received outside office hours will be reviewed the next business day.</p>
        </div>
      </div>
      ${U.notice('<p><strong>Other kinds of projects?</strong> Reno Rise focuses on basements. If you are planning other work, you can still tell us about it and we will say whether we can point you to a suitable independent professional. Not every project can be matched.</p>')}
      <p style="font-size:14px;">Looking for information first? See the <a href="${h('services/legal-basement-apartment-toronto/')}" style="text-decoration:underline;color:var(--orange-a11y)">legal secondary suite guide</a> or the <a href="${h('blog/')}" style="text-decoration:underline;color:var(--orange-a11y)">Basement Planning Centre</a>.</p>
    </div>
  </div>
</section>
`;
  U.write('contact.html', PG.renderPage({
    depth, path: 'contact.html',
    title: 'Contact Reno Rise | Toronto Basement Project Enquiries',
    description: 'Contact Reno Rise about a Toronto basement renovation or legal secondary suite. Share your project details to be considered for an introduction.',
    hero: PG.pageHero({ depth, h1: 'Contact Reno Rise', crumbs: [['Home', ''], ['Contact', '']], variant: 'hero-dark' }),
    main, noCta: true, script: formScript(depth),
  }));
})();

// ---------------------------------------------------------------- about
(function about() {
  const depth = 0;
  const h = (t) => L.href(depth, t);
  const main = `
<section class="section">
  <div class="container article-wrap">
    <span class="eyebrow">Who we are</span>
    <h2 style="font-size:32px; margin-bottom:20px;">An Independent Basement Project Enquiry and Matching Service</h2>
    <p>${L.POSITIONING}</p>
    <p>Basement projects are hard to plan. The rules around secondary suites change, the work spans several trades, and it is difficult to tell which professionals are right for your house. Reno Rise exists to make the first steps clearer: understand what your project involves, organize your details, and get in front of an appropriate independent professional.</p>
    <div class="two-col" style="margin:28px 0;">
      <div class="panel accent">
        <h3>What Reno Rise does</h3>
        ${U.checkList(['Publishes plain-language basement and secondary-suite planning guides.', 'Collects your project details through the assessment form.', 'Reviews requests and, where there is a suitable fit, connects homeowners with independent professionals.'])}
      </div>
      <div class="panel">
        <h3>What Reno Rise does not do</h3>
        ${U.checkList(['Perform renovation or construction work.', 'Issue permits, approvals or legal, engineering or code advice.', 'Provide estimates, contracts or warranties. The professional you choose does.'])}
      </div>
    </div>
    <h2>Our Approach</h2>
    <h3>Clarity Over Jargon</h3>
    <p>Guides explain what a project involves and what to confirm, in plain language, with links to the official sources.</p>
    <h3>Honest About Limits</h3>
    <p>We do not tell you whether your basement is legal or eligible, and we do not promise a match, a price or an outcome. Those depend on your property and the professionals involved.</p>
    <h3>You Stay in Control</h3>
    <p>You choose who to hire. Before you do, confirm credentials, insurance, references and who is responsible for permits.</p>
    <h2>Service Area</h2>
    <p>Reno Rise is focused on Toronto homes. Enquiries from elsewhere in the Greater Toronto Area are welcome; see <a href="${h('locations/')}" style="text-decoration:underline;color:var(--orange-a11y)">areas served</a>.</p>
    ${U.internalLinks(depth, [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Renovations', 'services/basement-renovation/'], ['Planning Centre', 'blog/'], ['Contact', 'contact.html']])}
  </div>
</section>
`;
  U.write('about.html', PG.renderPage({
    depth, path: 'about.html',
    title: 'About Reno Rise | Toronto Basement Project Matching',
    description: 'Reno Rise is an independent project-enquiry and contractor-matching service for Toronto basement renovations and legal secondary suites.',
    hero: PG.pageHero({ depth, h1: 'About Reno Rise', crumbs: [['Home', ''], ['About', '']], variant: 'hero-dark' }),
    main: main + L.customerQuotes(['kaylyn', 'reliance', 'marco', 'priya']),
  }));
})();

// ---------------------------------------------------------------- privacy & terms
// Scheduling-provider wording appears only while consultation booking is enabled (tools/site/booking-config.json).
const BOOKING_ON = B.load().enabled;
const BOOKING_PRIVACY_ITEM = BOOKING_ON
  ? `        <li><strong>Booking a consultation.</strong> If you book a phone consultation, the details you enter (name, email, phone number and a short note) are processed by our scheduling provider, Cal.com, and by the calendar service connected to it, and are received by us so the call can take place. Booking does not by itself agree to marketing email.</li>
`
  : '';
const legalPage = ({ path, title, description, h1, body }) => {
  const depth = 1;
  const main = `
<section class="section">
  <div class="container">
    <div class="legal-doc">
      <p class="updated-line">Effective September 19, 2026.</p>
${body}
    </div>
  </div>
</section>
`;
  U.write(path + 'index.html', PG.renderPage({
    depth, path, title, description,
    hero: PG.pageHero({ depth, h1, crumbs: [['Home', ''], [h1, '']], variant: 'hero-dark' }),
    main, noCta: true,
  }));
};

legalPage({
  path: 'privacy/',
  title: 'Privacy Policy | Reno Rise',
  description: 'How Reno Rise collects, uses and shares personal information submitted through its website and phone line.',
  h1: 'Privacy Policy',
  body: `
      <p>Reno Rise (&ldquo;Reno Rise&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent project-enquiry and contractor-matching service for homeowners with basement projects in Toronto and the Greater Toronto Area. This policy explains what personal information we collect, why, and the choices you have. Contact us at <a href="mailto:${L.EMAIL}">${L.EMAIL}</a> with any privacy question.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>What you submit.</strong> When you use our assessment or contact form we collect your name, email, phone number, Toronto neighbourhood or postal code, project type, basement condition, approximate size, timeframe, budget range, your project description, and your consent. Please do not include banking, payment card or other sensitive financial details.</li>
${BOOKING_PRIVACY_ITEM}        <li><strong>Calls and voicemail.</strong> Calls to our business number are handled by a telephone service provider. Call details (such as the caller&rsquo;s number, time and duration) and any voicemail you leave may be recorded and stored so we can respond.</li>
        <li><strong>Technical data.</strong> Our website host and security providers process standard technical data such as IP address, browser type and pages requested, and our spam-protection check (Cloudflare Turnstile) analyzes signals from your browser to tell people from automated traffic.</li>
        <li><strong>Third-party content.</strong> Pages load fonts from Google Fonts, which may receive your IP address and other technical data under Google&rsquo;s own policies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To review your project details and respond to you.</li>
        <li>To introduce you to an independent professional who may be able to help, where there is a suitable fit and you have consented.</li>
        <li>To operate, secure and improve the website and our records, and to prevent spam and abuse.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Independent professionals.</strong> With your consent, we may share your project details with a professional we think may be able to help. That professional is independent of Reno Rise and handles your information under their own practices.</li>
        <li><strong>Service providers.</strong> Companies that host our website and store form data, send email, filter spam and handle phone calls on our behalf (currently including Vercel, Cloudflare, Resend${BOOKING_ON ? ', Cal.com and Google (scheduling and calendar)' : ''} and a telephone service provider).</li>
        <li><strong>Legal and safety.</strong> Where required by law or to protect rights and safety.</li>
      </ul>
      <p>Some of these providers may store or process information outside Canada.</p>

      <h2>Your choices</h2>
      <p>You may ask to access, correct or delete the personal information we hold about you, or withdraw your consent to be contacted or to have your details shared, by emailing <a href="mailto:${L.EMAIL}">${L.EMAIL}</a>. Withdrawing consent does not affect information that has already been shared with a professional; contact that professional directly about their records.</p>

      <h2>Retention and security</h2>
      <p>We keep information for as long as needed for the purposes described above or as required by law, and take reasonable technical and organizational steps to protect it. No system is completely secure.</p>

      <h2>Children</h2>
      <p>Our website is intended for adult homeowners and is not directed at children.</p>

      <h2>Changes</h2>
      <p>We may update this policy and will post the new effective date above.</p>
`,
});

legalPage({
  path: 'terms/',
  title: 'Terms of Service | Reno Rise',
  description: 'Terms for using the Reno Rise website and its basement project enquiry and contractor-matching service.',
  h1: 'Terms of Service',
  body: `
      <p>These terms apply to your use of the Reno Rise website and enquiry service. By using the site you agree to them.</p>

      <h2>What Reno Rise is</h2>
      <p>Reno Rise is an independent project-enquiry and contractor-matching service. We provide general planning information and may introduce homeowners to independent professionals. We do not perform renovation or construction work, we are not a party to any contract between you and a professional, and we do not guarantee that a professional will be available, suitable or interested in your project.</p>

      <h2>Independent professionals</h2>
      <p>Renovation services, estimates, contracts, warranties and regulatory responsibilities (including permits) are provided by the professional you choose. Confirm credentials, insurance, references and permit responsibilities before hiring. Reno Rise does not verify or guarantee any professional&rsquo;s licensing, insurance, skill or work.</p>

      <h2>General information only</h2>
      <p>Content on this site is general planning information, not legal, engineering, architectural or code advice. Regulations such as zoning, the Building Code and the Fire Code change and depend on your property. Confirm requirements with Toronto Building and qualified professionals. Nothing on this site states that any specific property or unit is legal or eligible for a permit.</p>

      <h2>Your submissions</h2>
      <p>Information you submit must be accurate and yours to share. By submitting a form you consent to be contacted about your project and to have your details shared with independent professionals as described in our <a href="../privacy/">Privacy Policy</a>. Submitting a form does not create a booking, quote, approval or agreement.</p>

      <h2>Acceptable use</h2>
      <p>Do not misuse the site, attempt to disrupt it, submit false or automated enquiries, or use it to harass others.</p>

      <h2>Third-party links</h2>
      <p>We link to official and third-party sites for convenience. We do not control them and are not responsible for their content.</p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>The site and its content are provided &ldquo;as is&rdquo;. To the extent permitted by law, Reno Rise is not liable for indirect or consequential losses, or for the acts or omissions of independent professionals, arising from your use of the site or your dealings with any professional.</p>

      <h2>Changes and governing law</h2>
      <p>We may update these terms and will post the new effective date above. These terms are governed by the laws of Ontario and the federal laws of Canada applicable there.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <a href="mailto:${L.EMAIL}">${L.EMAIL}</a>.</p>
`,
});

// ---------------------------------------------------------------- 404
(function notFound() {
  const depth = 0;
  const main = `
<section class="section">
  <div class="container not-found">
    <div class="big" aria-hidden="true">404</div>
    <h1 style="font-size:34px; margin-bottom:14px;">We Could Not Find That Page</h1>
    <p>The page may have moved or the address may be mistyped. These may help.</p>
    <div class="hero-actions">
      <a href="/" class="btn btn-dark">Go to the Homepage ${L.ICON.arrow}</a>
      <a href="/services/legal-basement-apartment-toronto/" class="btn btn-primary">Legal Secondary Suite Guide ${L.ICON.arrow}</a>
    </div>
    <div class="text-links">
      <a class="city-chip" href="/services/basement-renovation/">Basement Renovations</a>
      <a class="city-chip" href="/services/">All Services</a>
      <a class="city-chip" href="/blog/">Basement Planning Centre</a>
      <a class="city-chip" href="/contact.html">Contact</a>
    </div>
  </div>
</section>
`;
  let html = PG.renderPage({
    depth, path: '404.html',
    title: 'Page Not Found | Reno Rise',
    description: 'The page you are looking for could not be found.',
    robots: 'noindex', main, noCta: true,
  });
  // 404.html is served at any missing URL, so every reference must be root-absolute.
  html = html
    .replace(/(href|src)="\.\//g, '$1="/')
    .replace(/<link rel="canonical"[^>]*>\n/, '')
    .replace(/<meta property="og:url"[^>]*>\n/, '');
  U.write('404.html', html);
})();

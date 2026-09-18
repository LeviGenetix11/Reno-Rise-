// Reno Rise — shared "Request Your Free Assessment" form component.
//
// Rendered identically wherever a [data-assessment-form-mount] element
// exists (the homepage, the Contact page, and the dedicated /assessment/
// page), so all three stay in sync from this one file instead of three
// hand-copied forms drifting apart. All three submit to the same
// Formspree form.
//
// Each mount point can set:
//   data-source="homepage" | "contact" | "assessment"
//     — sent to Formspree as an extra field so you can tell where an
//     inquiry came from.
//   data-thank-you-href="assessment/thank-you.html" (relative to the page)
//     — where to redirect after Formspree confirms the submission.
//
// ---------------------------------------------------------------------
// BACKEND: submissions go to Formspree (https://formspree.io) via their
// official @formspree/ajax client library (loaded from a CDN below —
// this site has no build step, so there's no npm install for it). This
// replaced an earlier raw fetch() implementation on Formspree support's
// recommendation: raw fetch requests were being rejected with a 403
// ("...reCAPTCHA must be disabled...") because they didn't carry the
// session/signing that the official client handles internally.
//
// A Formspree form ID is a public identifier, not a secret — safe to
// ship in this client-side file. No server code or credentials needed.
// ---------------------------------------------------------------------

(function () {
  'use strict';

  var FORM_ID = 'xqpaanag';
  var AJAX_LIB_URL = 'https://unpkg.com/@formspree/ajax@1';
  var PHONE_PATTERN = '[+]?1?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}';
  var SESSION_FLAG = 'renoriseAssessmentSubmitted';

  // ---- Load @formspree/ajax exactly once per page ----------------------
  // Official stub/queue pattern: formspree(...) can be called immediately,
  // even before the real script has finished loading — calls queue up and
  // replay once it has. Guards against double-loading if this file were
  // ever included more than once on the same page.
  if (!window.formspree) {
    window.formspree = function () {
      (window.formspree.q = window.formspree.q || []).push(arguments);
    };
  }
  if (!document.querySelector('script[data-formspree-ajax]')) {
    var fsScript = document.createElement('script');
    fsScript.src = AJAX_LIB_URL;
    fsScript.defer = true;
    fsScript.setAttribute('data-formspree-ajax', '1');
    document.head.appendChild(fsScript);
  }

  var FORM_HTML = [
    '<form class="assessment-form">',
    '  <p class="required-legend">Fields marked <span class="required-mark" aria-hidden="true">*</span> are required.</p>',
    '  <div>',
    '    <label for="af-name">Name <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <input type="text" id="af-name" name="name" placeholder="Jane Smith" autocomplete="name" required>',
    '  </div>',
    '  <div>',
    '    <label for="af-email">Email Address <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <input type="email" id="af-email" name="email" placeholder="jane@email.com" autocomplete="email" required>',
    '  </div>',
    '  <div>',
    '    <label for="af-phone">Phone Number <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <input type="tel" id="af-phone" name="phone" placeholder="(416) 555-0100" autocomplete="tel" required>',
    '  </div>',
    '  <div>',
    '    <label for="af-city">City or Postal Code <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <input type="text" id="af-city" name="city" placeholder="e.g. Mississauga or L5B 3C2" required>',
    '  </div>',
    '  <div class="field-full">',
    '    <label for="af-type">Renovation Type <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <input type="text" id="af-type" name="renovation_type" placeholder="e.g., kitchen remodel, bathroom renovation, basement finishing" required>',
    '  </div>',
    '  <div class="field-full">',
    '    <label for="af-details">Project Details <span class="optional-mark">(optional)</span></label>',
    '    <textarea id="af-details" name="details" rows="4" placeholder="Anything else that would help us understand your project"></textarea>',
    '  </div>',
    '  <p class="form-note-inline field-full">This requests a free assessment — it does not confirm an appointment time.</p>',
    '  <div class="field-full">',
    '    <button type="submit" class="btn btn-primary">',
    '      <span class="btn-label">Submit Assessment Request</span>',
    '      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '    </button>',
    '  </div>',
    '  <p class="form-note assessment-form-status" role="status" aria-live="polite"></p>',
    '</form>'
  ].join('\n');

  // Formspree error/field messages that describe a dashboard/plan
  // configuration problem, not something the visitor can fix. These stay
  // in the console for you rather than being shown as a raw string.
  var CONFIG_ERROR_PATTERN = /recaptcha|custom key|api key/i;

  function initForm(mount) {
    var source = mount.getAttribute('data-source') || 'unknown';
    var thankYouHref = mount.getAttribute('data-thank-you-href');
    var elementId = 'assessment-form-' + source;

    mount.innerHTML = FORM_HTML;

    var form = mount.querySelector('.assessment-form');
    form.id = elementId;
    var statusEl = mount.querySelector('.assessment-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn.querySelector('.btn-label');
    var phoneInput = mount.querySelector('#af-phone');
    var emailInput = mount.querySelector('#af-email');

    // Native HTML5 validation (required / type=email / the phone pattern
    // below) runs automatically before the browser ever dispatches this
    // form's submit event — there's no novalidate here — so the AJAX
    // client only ever sees submissions that already passed. These
    // listeners just make the browser's validation messages friendlier.
    phoneInput.pattern = PHONE_PATTERN;
    phoneInput.addEventListener('invalid', function () {
      phoneInput.setCustomValidity('Please enter a valid phone number, e.g. (416) 555-0100.');
    });
    phoneInput.addEventListener('input', function () {
      phoneInput.setCustomValidity('');
    });

    emailInput.addEventListener('invalid', function () {
      emailInput.setCustomValidity('Please enter a valid email address, e.g. jane@email.com.');
    });
    emailInput.addEventListener('input', function () {
      emailInput.setCustomValidity('');
    });

    mount.querySelectorAll('.assessment-form input[required], .assessment-form textarea[required]').forEach(function (field) {
      field.addEventListener('invalid', function () {
        if (field.validity.valueMissing) {
          field.setCustomValidity('This field is required.');
        }
      });
      field.addEventListener('input', function () {
        field.setCustomValidity('');
      });
    });

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? 'var(--orange-a11y)' : '';
    }

    function showGenericFailure() {
      setStatus('Something went wrong sending your request. Please try again, or call us at (289) 512-8112.', true);
    }

    function clearFieldFlags() {
      mount.querySelectorAll('.assessment-form [aria-invalid]').forEach(function (el) {
        el.removeAttribute('aria-invalid');
      });
    }

    // The official @formspree/ajax client attaches its own submit
    // listener to this exact element (by ID) and owns the whole
    // request/response lifecycle below — no separate fetch() or manual
    // submit handler here, so there's only ever one listener sending
    // one request per submit.
    window.formspree('initForm', {
      formElement: '#' + elementId,
      formId: FORM_ID,
      useDefaultStyles: false,
      data: { source: source },

      disable: function () {
        submitBtn.disabled = true;
        submitLabel.textContent = 'Sending…';
        setStatus('', false);
      },
      enable: function () {
        submitBtn.disabled = false;
        submitLabel.textContent = 'Submit Assessment Request';
      },

      onSuccess: function () {
        // Formspree has confirmed acceptance of the submission. This
        // confirms acceptance, not that a notification email has landed
        // in your inbox — check Formspree's dashboard/verified recipient
        // settings for that.
        try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch (err) { /* storage unavailable — redirect still works */ }
        if (thankYouHref) {
          window.location.href = thankYouHref;
        } else {
          setStatus('Thanks — your request was received. We\'ll be in touch to discuss your renovation.', false);
          form.reset();
        }
      },

      // Renders a SubmissionError (structured, e.g. a field Formspree
      // rejected). Entered values are left untouched by the library, so
      // a visitor can fix the message below and resubmit.
      renderFormError: function (context, message) {
        if (message && !CONFIG_ERROR_PATTERN.test(message)) {
          setStatus(message, true);
        } else {
          if (message && window.console && console.error) {
            console.error('Assessment form config error (see Formspree dashboard):', message);
          }
          showGenericFailure();
        }
      },
      renderFieldErrors: function (context, error) {
        clearFieldFlags();
        if (!error) return;
        error.getAllFieldErrors().forEach(function (pair) {
          var field = mount.querySelector('[name="' + pair[0] + '"]');
          if (field) field.setAttribute('aria-invalid', 'true');
        });
      },

      // Anything that isn't a structured Formspree response at all —
      // the request never completed (offline, blocked by a browser
      // extension, DNS failure, Formspree unreachable, etc.).
      onFailure: function (context, error) {
        if (window.console && console.error) {
          console.error('Assessment form submission failed:', error);
        }
        if (!navigator.onLine) {
          setStatus('You appear to be offline. Please check your connection and try again.', true);
        } else if (error instanceof TypeError) {
          setStatus('Your browser blocked this request before it was sent (often an ad blocker or privacy extension). Please try again with extensions disabled, or call us at (289) 512-8112.', true);
        } else {
          showGenericFailure();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-assessment-form-mount]').forEach(initForm);
  });
})();

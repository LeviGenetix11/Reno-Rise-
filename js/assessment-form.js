// Reno Rise — shared "Request Your Free Assessment" form component.
//
// Rendered identically wherever a [data-assessment-form-mount] element
// exists (the homepage, the Contact page, and the dedicated /assessment/
// page), so all three stay in sync from this one file instead of three
// hand-copied forms drifting apart.
//
// Each mount point can set:
//   data-source="homepage" | "contact" | "assessment"
//     — sent to Formspree so you can tell where an inquiry came from.
//   data-thank-you-href="assessment/thank-you.html" (relative to the page)
//     — where to redirect after Formspree accepts the submission.
//
// ---------------------------------------------------------------------
// BACKEND: this site is fully static and has no server of its own, so
// submissions are POSTed directly to Formspree (https://formspree.io) —
// a hosted form-processing service that emails each submission to you.
// No server code, database, or credentials are required. A Formspree
// form endpoint is a public identifier, not a secret, so it's safe to
// ship in this client-side file.
//
// STATUS: connected to a real Formspree endpoint (below). Before treating
// this as ready for real inquiries, confirm in your Formspree dashboard
// (Settings > verified recipients) that submission emails land at the
// right address, and send one real test submission through each of the
// three forms to confirm end-to-end delivery.
// ---------------------------------------------------------------------

(function () {
  'use strict';

  var FORM_ENDPOINT = 'https://formspree.io/f/xqpaanag';
  var ENDPOINT_CONFIGURED = FORM_ENDPOINT.indexOf('YOUR_FORM_ID') === -1;
  var PHONE_PATTERN = '[+]?1?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}';
  var SESSION_FLAG = 'renoriseAssessmentSubmitted';

  var FORM_HTML = [
    '<form class="assessment-form" novalidate>',
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

  function initForm(mount) {
    var source = mount.getAttribute('data-source') || 'unknown';
    var thankYouHref = mount.getAttribute('data-thank-you-href');

    mount.innerHTML = FORM_HTML;

    var form = mount.querySelector('.assessment-form');
    var statusEl = mount.querySelector('.assessment-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn.querySelector('.btn-label');
    var phoneInput = mount.querySelector('#af-phone');
    var emailInput = mount.querySelector('#af-email');
    var isSubmitting = false;

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

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (isSubmitting) return;

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!ENDPOINT_CONFIGURED) {
        setStatus('This form isn\'t connected to an email service yet. Please call us at (289) 512-8112 or email hello@renosrise.com instead.', true);
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      submitLabel.textContent = 'Sending…';
      setStatus('', false);

      var formData = new FormData(form);
      formData.append('source', source);
      formData.append('_subject', 'New Renovation Assessment Request (' + source + ')');

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      }).then(function (response) {
        if (response.ok) {
          // Formspree has accepted the submission. This confirms acceptance,
          // not that an email has been delivered to your inbox.
          try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch (err) { /* storage unavailable — redirect still works */ }
          if (thankYouHref) {
            window.location.href = thankYouHref;
          } else {
            setStatus('Thanks — your request was received. We\'ll be in touch to discuss your renovation.', false);
            form.reset();
          }
          return;
        }
        if (response.status === 429) {
          throw new Error('rate-limited');
        }
        return response.json().then(function (data) {
          var msg = (data && data.errors && data.errors.length) ? data.errors.map(function (er) { return er.message; }).join(', ') : null;
          throw new Error(msg || 'submission-failed');
        }).catch(function () {
          throw new Error('submission-failed');
        });
      }).catch(function (err) {
        // Log the real reason to the console for debugging — never shown
        // to the visitor, but essential when diagnosing a failed submission.
        if (window.console && console.error) {
          console.error('Assessment form submission failed:', err);
        }
        var reason = err && err.message;
        if (reason === 'rate-limited') {
          setStatus('We\'re receiving a high volume of requests right now. Please try again shortly, or call us at (289) 512-8112.', true);
        } else if (!navigator.onLine) {
          setStatus('You appear to be offline. Please check your connection and try again.', true);
        } else if (reason && reason !== 'submission-failed') {
          // A specific message from Formspree (e.g. a field it rejected) —
          // show it directly so the visitor knows what to fix.
          setStatus(reason, true);
        } else if (err instanceof TypeError) {
          // Fetch itself never reached Formspree — almost always a browser
          // extension (ad/privacy blocker) or network-level block, not a
          // problem with the form or the server.
          setStatus('Your browser blocked this request before it was sent (often an ad blocker or privacy extension). Please try again with extensions disabled, or call us at (289) 512-8112.', true);
        } else {
          setStatus('Something went wrong sending your request. Please try again, or call us at (289) 512-8112.', true);
        }
      }).finally(function () {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitLabel.textContent = 'Submit Assessment Request';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-assessment-form-mount]').forEach(initForm);
  });
})();

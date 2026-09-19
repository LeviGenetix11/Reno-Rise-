// Reno Rise — shared "Request Your Free Assessment" form component.
//
// Rendered identically wherever a [data-assessment-form-mount] element
// exists (the homepage, the Contact page, and the dedicated /assessment/
// page), so all three stay in sync from this one file. All three submit
// to the same backend.
//
// ---------------------------------------------------------------------
// BACKEND: submissions go to a Cloudflare Worker (renorise-forms) that
// validates the request, checks Cloudflare Turnstile, saves the lead to
// D1, and sends the two emails via Resend. This replaced Formspree
// (form id xqpaanag) after the Worker passed testing — see
// renorise-forms/README.md for the full deployment/testing record.
//
// TURNSTILE_SITE_KEY below is the public site key for the renosrise.com
// Turnstile widget — a public value, safe to commit. The matching secret
// key lives only on the Worker (TURNSTILE_SECRET_KEY).
// ---------------------------------------------------------------------

(function () {
  'use strict';

  var LEADS_API_URL = 'https://renorise-forms.levi-gene-ous.workers.dev/api/leads';
  var TURNSTILE_SITE_KEY = '0x4AAAAAAE8mYweT8x0kPwcV';
  var PHONE_PATTERN = '[+]?1?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}';
  var SESSION_FLAG = 'renoriseAssessmentSubmitted';

  // Load the Turnstile widget script exactly once per page.
  if (!document.querySelector('script[data-turnstile]')) {
    var tsScript = document.createElement('script');
    tsScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    tsScript.defer = true;
    tsScript.setAttribute('data-turnstile', '1');
    document.head.appendChild(tsScript);
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
    '    <label for="af-start-timeframe">When would you like the renovation to start? <span class="required-mark" aria-hidden="true">*</span></label>',
    '    <select id="af-start-timeframe" name="start_timeframe" required>',
    '      <option value="" disabled selected>Select a timeframe</option>',
    '      <option value="As soon as possible">As soon as possible</option>',
    '      <option value="Within 1-3 months">Within 1-3 months</option>',
    '      <option value="Within 3-6 months">Within 3-6 months</option>',
    '      <option value="More than 6 months away">More than 6 months away</option>',
    '      <option value="Just exploring">Just exploring</option>',
    '    </select>',
    '  </div>',
    '  <div class="field-full">',
    '    <label for="af-deadline">Do you have a target completion date or deadline? <span class="optional-mark">(optional)</span></label>',
    '    <input type="text" id="af-deadline" name="completion_deadline" placeholder="For example: before we move in on December 1. Let us know if your date is flexible.">',
    '  </div>',
    '  <p class="form-note-inline field-full">Your preferred timeline helps us plan. Dates are subject to project scope and contractor availability.</p>',
    '  <div class="field-full">',
    '    <label for="af-details">Project Details <span class="optional-mark">(optional)</span></label>',
    '    <textarea id="af-details" name="details" rows="4" placeholder="Anything else that would help us understand your project"></textarea>',
    '  </div>',
    '  <p class="form-note-inline field-full">This requests a free assessment — it does not confirm an appointment time.</p>',
    '  <div class="field-full turnstile-mount"></div>',
    '  <div class="field-full">',
    '    <button type="submit" class="btn btn-primary">',
    '      <span class="btn-label">Submit Assessment Request</span>',
    '      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '    </button>',
    '  </div>',
    '  <p class="form-note assessment-form-status" role="status" aria-live="polite"></p>',
    '</form>'
  ].join('\n');

  function generateIdempotencyKey() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function initForm(mount) {
    var source = mount.getAttribute('data-source') || 'unknown';
    var thankYouHref = mount.getAttribute('data-thank-you-href');
    // Generated once per page load / form instance, then reused across
    // retries of the SAME logical submission — this is what lets the
    // backend dedupe a resubmit-after-network-blip instead of creating
    // a second lead.
    var idempotencyKey = generateIdempotencyKey();

    mount.innerHTML = FORM_HTML;

    var form = mount.querySelector('.assessment-form');
    var statusEl = mount.querySelector('.assessment-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn.querySelector('.btn-label');
    var phoneInput = mount.querySelector('#af-phone');
    var emailInput = mount.querySelector('#af-email');
    var turnstileMount = mount.querySelector('.turnstile-mount');
    var turnstileWidgetId = null;
    var isSubmitting = false;

    // Native HTML5 validation (required / type=email / the phone pattern
    // below) runs automatically before the browser dispatches this
    // form's submit event — there's no novalidate here. These listeners
    // just make the resulting validation messages friendlier.
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

    mount.querySelectorAll('.assessment-form input[required], .assessment-form textarea[required], .assessment-form select[required]').forEach(function (field) {
      field.addEventListener('invalid', function () {
        if (field.validity.valueMissing) {
          field.setCustomValidity('This field is required.');
        }
      });
      field.addEventListener('input', function () {
        field.setCustomValidity('');
      });
      field.addEventListener('change', function () {
        field.setCustomValidity('');
      });
    });

    (function renderTurnstile() {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        turnstileWidgetId = window.turnstile.render(turnstileMount, { sitekey: TURNSTILE_SITE_KEY });
      } else {
        setTimeout(renderTurnstile, 150);
      }
    })();

    function resetTurnstile() {
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
    }

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? 'var(--orange-a11y)' : '';
    }

    function showGenericFailure() {
      setStatus('Something went wrong sending your request. Please try again, or call us at (289) 512-8112.', true);
    }

    function applyErrorResponse(status, data) {
      var code = data && data.error;
      if (code === 'validation_failed' && data.fields) {
        var messages = Object.keys(data.fields).map(function (key) { return data.fields[key]; });
        setStatus(messages.join(' '), true);
      } else if (code === 'spam_check_failed') {
        setStatus('We couldn\'t verify the security check. Please try it again, or call us at (289) 512-8112.', true);
      } else if (code === 'rate_limited') {
        setStatus('We\'re receiving a high volume of requests right now. Please try again shortly, or call us at (289) 512-8112.', true);
      } else if (status >= 500 || code === 'server_error') {
        // Explicitly NOT a success — the lead was not confirmed saved,
        // so there is no redirect to the thank-you page for this case.
        setStatus('Something went wrong on our end and your request was not saved. Please try again, or call us at (289) 512-8112.', true);
      } else {
        showGenericFailure();
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (isSubmitting) return;

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var turnstileToken = (window.turnstile && turnstileWidgetId !== null)
        ? window.turnstile.getResponse(turnstileWidgetId)
        : '';
      if (!turnstileToken) {
        setStatus('Please complete the verification check above before submitting.', true);
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      submitLabel.textContent = 'Sending…';
      setStatus('', false);

      var payload = {
        name: mount.querySelector('#af-name').value,
        email: mount.querySelector('#af-email').value,
        phone: mount.querySelector('#af-phone').value,
        city: mount.querySelector('#af-city').value,
        renovation_type: mount.querySelector('#af-type').value,
        start_timeframe: mount.querySelector('#af-start-timeframe').value,
        completion_deadline: mount.querySelector('#af-deadline').value,
        details: mount.querySelector('#af-details').value,
        source: source,
        idempotency_key: idempotencyKey,
        turnstile_token: turnstileToken
      };

      fetch(LEADS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          return { response: response, data: data };
        });
      }).then(function (result) {
        var response = result.response, data = result.data;

        // Redirect (or show inline success) ONLY when the backend has
        // confirmed the lead is actually saved — never on a guess.
        if (response.ok && data && data.ok === true) {
          try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch (err) { /* storage unavailable — redirect still works */ }
          if (thankYouHref) {
            window.location.href = thankYouHref;
          } else {
            setStatus('Thanks — your request was received. We\'ll be in touch to discuss your renovation.', false);
            form.reset();
            resetTurnstile();
          }
          return;
        }

        applyErrorResponse(response.status, data);
        resetTurnstile();
      }).catch(function (err) {
        if (window.console && console.error) {
          console.error('Assessment form submission failed:', err);
        }
        if (!navigator.onLine) {
          setStatus('You appear to be offline. Please check your connection and try again.', true);
        } else if (err instanceof TypeError) {
          setStatus('Your browser blocked this request before it was sent (often an ad blocker or privacy extension). Please try again with extensions disabled, or call us at (289) 512-8112.', true);
        } else {
          showGenericFailure();
        }
        resetTurnstile();
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

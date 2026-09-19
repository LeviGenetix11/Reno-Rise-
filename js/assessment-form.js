// Reno Rise — shared "Request a Basement Assessment" form component.
//
// Rendered identically wherever a [data-assessment-form-mount] element
// exists (the homepage, the Contact page, the legal secondary suite guide,
// and the dedicated /assessment/ page), so all of them stay in sync from
// this one file. All of them submit to the same backend.
//
// ---------------------------------------------------------------------
// BACKEND: submissions go to a Cloudflare Worker (renorise-forms) that
// validates the request, checks Cloudflare Turnstile, saves the lead to
// D1, and sends the two emails via Resend. See renorise-forms/README.md.
//
// The Worker accepts a fixed set of fields (renorise-forms/src/validate.js).
// The basement-qualification answers that have no column of their own
// (current condition, approximate size, budget range, consent, the page the
// enquiry came from) are written as labelled lines at the top of `details`,
// so they show up in the lead record, the dashboard and the notification
// email without any backend change. project type -> renovation_type,
// neighbourhood or postal code -> city.
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
  var CALL_US = 'call us at (289) 512-8112';

  var PROJECT_TYPES = [
    'Finished basement',
    'General basement renovation',
    'Legal secondary suite / basement apartment',
    'Underpinning or ceiling-height work',
    'Waterproofing or moisture issue',
    'Separate entrance or egress window',
    'Not sure'
  ];
  var CONDITIONS = ['Unfinished', 'Partially finished', 'Finished', 'Existing rental unit', 'Water or foundation concerns'];
  // Must match START_TIMEFRAMES in renorise-forms/src/validate.js.
  var TIMEFRAMES = ['As soon as possible', 'Within 1-3 months', 'Within 3-6 months', 'More than 6 months away', 'Just exploring'];
  var BUDGETS = ['Under $25,000', '$25,000 to $50,000', '$50,000 to $100,000', '$100,000 to $150,000', 'Over $150,000', 'Not sure yet'];

  var CONSENT_TEXT = 'I agree that Reno Rise may contact me by phone or email about this basement project, and may share the details I have provided with an independent professional who may be able to help. I can withdraw this consent at any time.';

  // Load the Turnstile widget script exactly once per page.
  if (!document.querySelector('script[data-turnstile]')) {
    var tsScript = document.createElement('script');
    tsScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    tsScript.defer = true;
    tsScript.setAttribute('data-turnstile', '1');
    document.head.appendChild(tsScript);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function options(list, placeholder, selected) {
    var html = placeholder ? '<option value="" disabled' + (selected ? '' : ' selected') + '>' + esc(placeholder) + '</option>' : '';
    list.forEach(function (item) {
      html += '<option value="' + esc(item) + '"' + (item === selected ? ' selected' : '') + '>' + esc(item) + '</option>';
    });
    return html;
  }

  var REQ = ' <span class="required-mark" aria-hidden="true">*</span>';
  var OPT = ' <span class="optional-mark">(optional)</span>';

  function formHtml(preselectType, submitText) {
    return [
      '<form class="assessment-form" aria-describedby="af-disclosure">',
      '  <p class="required-legend">Fields marked <span class="required-mark" aria-hidden="true">*</span> are required.</p>',
      '  <p class="form-section-title field-full">About you</p>',
      '  <div>',
      '    <label for="af-name">Name' + REQ + '</label>',
      '    <input type="text" id="af-name" name="name" placeholder="Jane Smith" autocomplete="name" required>',
      '  </div>',
      '  <div>',
      '    <label for="af-email">Email' + REQ + '</label>',
      '    <input type="email" id="af-email" name="email" placeholder="jane@email.com" autocomplete="email" required>',
      '  </div>',
      '  <div>',
      '    <label for="af-phone">Phone' + REQ + '</label>',
      '    <input type="tel" id="af-phone" name="phone" placeholder="(416) 555-0100" autocomplete="tel" required>',
      '  </div>',
      '  <div>',
      '    <label for="af-city">Toronto neighbourhood or postal code' + REQ + '</label>',
      '    <input type="text" id="af-city" name="city" placeholder="e.g. Leslieville or M4L 1A1" autocomplete="postal-code" required>',
      '  </div>',
      '  <p class="form-section-title field-full">About your basement</p>',
      '  <div class="field-full">',
      '    <label for="af-type">Project type' + REQ + '</label>',
      '    <select id="af-type" name="renovation_type" required>' + options(PROJECT_TYPES, 'Select a project type', preselectType) + '</select>',
      '  </div>',
      '  <div>',
      '    <label for="af-condition">Current basement condition' + OPT + '</label>',
      '    <select id="af-condition" name="condition">' + options(CONDITIONS, 'Select a condition') + '</select>',
      '  </div>',
      '  <div>',
      '    <label for="af-size">Approximate basement size' + OPT + '</label>',
      '    <input type="text" id="af-size" name="size" maxlength="60" placeholder="e.g. about 900 sq. ft. — a rough guess is fine">',
      '  </div>',
      '  <div>',
      '    <label for="af-start-timeframe">Desired start timeframe' + REQ + '</label>',
      '    <select id="af-start-timeframe" name="start_timeframe" required>' + options(TIMEFRAMES, 'Select a timeframe') + '</select>',
      '  </div>',
      '  <div>',
      '    <label for="af-budget">Approximate budget range' + OPT + '</label>',
      '    <select id="af-budget" name="budget">' + options(BUDGETS, 'Select a range') + '</select>',
      '  </div>',
      '  <div class="field-full">',
      '    <label for="af-details">Short project description' + OPT + '</label>',
      '    <textarea id="af-details" name="details" rows="4" maxlength="3000" placeholder="For example: unfinished basement with about 6 ft 8 in of ceiling height, thinking about a self-contained rental suite with a separate entrance."></textarea>',
      '    <p class="field-hint">Please do not include banking, payment card or other sensitive financial details.</p>',
      '  </div>',
      '  <div class="field-full consent-row">',
      '    <input type="checkbox" id="af-consent" name="consent" required>',
      '    <label for="af-consent">' + esc(CONSENT_TEXT) + REQ + ' See our <a href="' + rootPrefix() + 'privacy/">Privacy Policy</a>.</label>',
      '  </div>',
      '  <p class="disclosure field-full" id="af-disclosure">Reno Rise is an independent project-enquiry and contractor-matching service. Renovation services, estimates, contracts, warranties, and regulatory responsibilities are provided by the professional you choose. Confirm credentials, insurance, references, and permit responsibilities before hiring.</p>',
      '  <div class="field-full turnstile-mount"></div>',
      '  <div class="field-full">',
      '    <button type="submit" class="btn btn-primary">',
      '      <span class="btn-label">' + esc(submitText) + '</span>',
      '      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '    </button>',
      '  </div>',
      '  <p class="form-note field-full">Submitting this form requests a review of your project details. It does not book an appointment or guarantee a quote, an approval, or a match with a professional.</p>',
      '  <p class="form-note assessment-form-status field-full" role="status" aria-live="polite"></p>',
      '</form>',
      '<div class="form-success" role="status" tabindex="-1">',
      '  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '  <h3>Thanks &mdash; we have your basement enquiry</h3>',
      '  <p>Reno Rise will review the details you shared. If there is a suitable fit, you may be contacted about being introduced to an independent professional. We cannot promise a match, an appointment, a quote, or that any work is permitted.</p>',
      '</div>'
    ].join('\n');
  }

  // Relative path back to the site root, derived from the shared script's own URL.
  function rootPrefix() {
    var scripts = document.querySelectorAll('script[src$="js/assessment-form.js"]');
    if (scripts.length) {
      var src = scripts[scripts.length - 1].getAttribute('src');
      return src.replace(/js\/assessment-form\.js$/, '');
    }
    return '/';
  }

  function generateIdempotencyKey() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  // Builds the `details` text sent to the backend. Exposed for the local test.
  function buildDetails(values) {
    var lines = [];
    if (values.condition) lines.push('Basement condition: ' + values.condition);
    if (values.size) lines.push('Approximate size: ' + values.size);
    if (values.budget) lines.push('Budget range: ' + values.budget);
    lines.push('Consent: agreed to be contacted by phone or email about this project and to have these details shared with an independent professional.');
    if (values.page) lines.push('Submitted from: ' + values.page);
    var text = lines.join('\n');
    if (values.details) text += '\n\nProject description:\n' + values.details;
    return text;
  }

  function initForm(mount) {
    var source = mount.getAttribute('data-source') || 'unknown';
    var thankYouHref = mount.getAttribute('data-thank-you-href');
    var preselectType = mount.getAttribute('data-project-type') || '';
    var submitText = mount.getAttribute('data-submit-label') || 'Request a Basement Assessment';
    // Generated once per page load / form instance, then reused across
    // retries of the SAME logical submission — this is what lets the
    // backend dedupe a resubmit-after-network-blip instead of creating
    // a second lead.
    var idempotencyKey = generateIdempotencyKey();

    mount.innerHTML = formHtml(preselectType, submitText);

    var form = mount.querySelector('.assessment-form');
    var successEl = mount.querySelector('.form-success');
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

    form.querySelectorAll('input[required], textarea[required], select[required]').forEach(function (field) {
      field.addEventListener('invalid', function () {
        if (field.validity.valueMissing) {
          field.setCustomValidity(field.type === 'checkbox' ? 'Please tick the box to give your consent.' : 'This field is required.');
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
      setStatus('Something went wrong sending your request. Please try again, or ' + CALL_US + '.', true);
    }

    function applyErrorResponse(status, data) {
      var code = data && data.error;
      if (code === 'validation_failed' && data.fields) {
        var messages = Object.keys(data.fields).map(function (key) { return data.fields[key]; });
        setStatus(messages.join(' '), true);
      } else if (code === 'spam_check_failed') {
        setStatus('We could not verify the security check. Please try it again, or ' + CALL_US + '.', true);
      } else if (code === 'rate_limited') {
        setStatus('We are receiving a high volume of requests right now. Please try again shortly, or ' + CALL_US + '.', true);
      } else if (status >= 500 || code === 'server_error') {
        // Explicitly NOT a success — the lead was not confirmed saved,
        // so there is no redirect to the thank-you page for this case.
        setStatus('Something went wrong on our end and your request was not saved. Please try again, or ' + CALL_US + '.', true);
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

      var val = function (id) { return mount.querySelector(id).value.trim(); };
      var payload = {
        name: val('#af-name'),
        email: val('#af-email'),
        phone: val('#af-phone'),
        city: val('#af-city'),
        renovation_type: val('#af-type'),
        start_timeframe: val('#af-start-timeframe'),
        completion_deadline: '',
        details: buildDetails({
          condition: val('#af-condition'),
          size: val('#af-size'),
          budget: val('#af-budget'),
          details: val('#af-details'),
          page: window.location.pathname
        }),
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
            form.style.display = 'none';
            successEl.classList.add('show');
            successEl.focus();
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
          setStatus('Your browser blocked this request before it was sent (often an ad blocker or privacy extension). Please try again with extensions disabled, or ' + CALL_US + '.', true);
        } else {
          showGenericFailure();
        }
        resetTurnstile();
      }).finally(function () {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitLabel.textContent = submitText;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-assessment-form-mount]').forEach(initForm);
  });
})();

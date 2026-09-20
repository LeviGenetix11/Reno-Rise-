// Reno Rise - consultation booking page (/book/).
//
// Loads Cal.com's inline embed into #book-embed. The Cal.com link and origin come from data attributes written at
// build time from tools/site/booking-config.json, so this file holds no account details.
//
// The only thing passed to Cal.com is an optional opaque reference (?r=...) from a follow-up email or the thank-you
// page, sent as booking metadata `renorise_ref`. It is a hint that helps Reno Rise link the booking to an enquiry; it
// contains no name, email, phone number or database id, and the server still requires the booker's own email or phone
// to agree before anything is linked. Nothing here decides that a booking happened: only Cal.com's signed server-side
// notice does. If the embed does not load, the plain link to the hosted booking page stays available.
(function () {
  'use strict';

  var el = document.getElementById('book-embed');
  if (!el) return;

  var calLink = el.getAttribute('data-cal-link');
  var origin = el.getAttribute('data-cal-origin') || 'https://app.cal.com';
  var ns = el.getAttribute('data-cal-namespace') || '';
  var statusEl = document.getElementById('book-status');
  var fallbackEl = document.getElementById('book-fallback');
  if (!calLink || !/^[A-Za-z0-9_-]{1,60}$/.test(ns) || !/^https:\/\/[A-Za-z0-9.-]+$/.test(origin)) return;

  var REF_RE = /^[A-Za-z0-9_-]{20,64}$/;
  var ref = null;
  try {
    var r = new URLSearchParams(window.location.search).get('r');
    if (r && REF_RE.test(r)) ref = r;
  } catch (err) { /* older browser: book without a reference */ }

  var settled = false;
  function loaded() {
    settled = true;
    if (statusEl) statusEl.hidden = true;
  }
  function failed() {
    if (settled) return;
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'The booking calendar did not load.';
    }
    if (fallbackEl) fallbackEl.classList.add('is-failed');
  }

  // Cal.com's standard embed loader (queues calls until embed.js has loaded).
  (function (C, A, L) {
    var p = function (a, ar) { a.q.push(ar); };
    var d = C.document;
    C.Cal = C.Cal || function () {
      var cal = C.Cal;
      var ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        var s = d.createElement('script');
        s.src = A;
        s.async = true;
        s.onerror = failed;
        d.head.appendChild(s);
        cal.loaded = true;
      }
      if (ar[0] === L) {
        var api = function () { p(api, arguments); };
        var namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ['initNamespace', namespace]);
        } else {
          p(cal, ar);
        }
        return;
      }
      p(cal, ar);
    };
  })(window, origin + '/embed/embed.js', 'init');

  try {
    // Same options as the snippet Cal.com generates for this event. Deliberately NOT copied from it: `Cal.config.forwardQueryParams`,
    // which would forward every query parameter on this page (including any contact details typed into the URL) to Cal.com.
    var config = { layout: 'month_view', useSlotsViewOnSmallScreen: 'true' };
    if (ref) config['metadata[renorise_ref]'] = ref;
    window.Cal('init', ns, { origin: origin });
    var cal = window.Cal.ns[ns];
    cal('inline', { elementOrSelector: '#book-embed', calLink: calLink, config: config });
    cal('ui', { hideEventTypeDetails: false, layout: 'month_view' });
    // Event names are Cal.com's; if they change, the timer below still shows the fallback link.
    cal('on', { action: 'linkReady', callback: loaded });
    cal('on', { action: 'linkFailed', callback: failed });
  } catch (err) {
    failed();
  }

  // If Cal.com has not reported ready after a while (blocked script, offline, ad blocker), say so and point to the link.
  // An iframe inside the container means the embed did load even if its ready event was not seen.
  window.setTimeout(function () {
    if (settled) return;
    if (el.querySelector('iframe')) loaded();
    else failed();
  }, 12000);
})();

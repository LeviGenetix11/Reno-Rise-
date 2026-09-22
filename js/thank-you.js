// Reno Rise - assessment thank-you page (assessment/thank-you.html).
//
// Only shows the personalized success message to a browser that just completed a real
// submission (flagged by assessment-form.js right before it redirected here). Everyone
// else, including anyone who bookmarks or shares this URL, sees the fallback message.
(function () {
  'use strict';
  var FLAG = 'renoriseAssessmentSubmitted';
  var justSubmitted = false;
  try { justSubmitted = sessionStorage.getItem(FLAG) === '1'; } catch (err) { justSubmitted = false; }
  if (!justSubmitted) return;

  document.getElementById('ty-fallback').hidden = true;
  document.getElementById('ty-success').hidden = false;
  document.getElementById('ty-title').textContent = 'Thanks — we have your basement enquiry.';
  try { sessionStorage.removeItem(FLAG); } catch (err) { /* ignore */ }

  // The booking link carries only an opaque reference (never contact details); it is a
  // hint, not proof of identity. The link only exists on the page when booking is enabled,
  // so this is a no-op otherwise.
  var link = document.getElementById('ty-book-link');
  if (link) {
    var ref = null;
    try { ref = sessionStorage.getItem('renoriseBookingRef'); sessionStorage.removeItem('renoriseBookingRef'); } catch (err) { ref = null; }
    if (ref && /^[A-Za-z0-9_-]{20,64}$/.test(ref)) link.href = link.getAttribute('href') + '?r=' + ref;
  }
})();

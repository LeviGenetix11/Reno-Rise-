// Normalisation used ONLY for matching (duplicate suggestions). The display
// value a customer typed is always stored and shown as entered; these helpers
// never change it. Matching is deliberately conservative: two records that
// share a normalised value are SUGGESTED as possible duplicates, never merged
// automatically.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-case, trimmed email, or null when it is empty or not shaped like an address. */
export function normalizeEmail(value) {
  const e = String(value ?? '').trim().toLowerCase();
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/**
 * Digits-only phone for matching.
 *   (416) 555-0100, 416-555-0100, +1 416 555 0100, 1.416.555.0100  ->  "4165550100"
 *   +44 20 7946 0958 (international)                                ->  "+442079460958"
 * Numbers with fewer than 10 digits and no "+" are NOT matchable (a 7-digit
 * local number could belong to any area code), so they return null.
 */
export function normalizePhone(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  if (s.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

const POSTAL_RE = /\b([A-Za-z]\d[A-Za-z])[\s-]?(\d[A-Za-z]\d)\b/;

/**
 * The public form has ONE field, "City or postal code". Split what was typed
 * into a city and a full postal code WITHOUT inventing anything: a street
 * address is never inferred from a postal code, a partial code such as "M5V"
 * stays in the city text, and the original text remains on the submission.
 */
export function splitLocation(value) {
  const text = String(value ?? '').trim();
  if (!text) return { city: null, postal: null };
  const m = POSTAL_RE.exec(text);
  if (!m) return { city: text, postal: null };
  const postal = `${m[1]} ${m[2]}`.toUpperCase();
  const city = text.replace(POSTAL_RE, ' ').replace(/[\s,;-]+/g, ' ').trim();
  return { city: city || null, postal };
}

/** Comma-separated tags: trimmed, de-duplicated (case-insensitive), max 12 tags of 40 characters. */
export function normalizeTags(value) {
  const seen = new Set();
  const out = [];
  for (const raw of String(value ?? '').split(/[,\n;]/)) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
    if (out.length >= 12) break;
  }
  return out.join(', ');
}

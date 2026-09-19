// Date handling. Everything is STORED in UTC (ISO-8601) or as a plain
// calendar date, and DISPLAYED / ENTERED in America/Toronto, so daylight-saving
// changes never shift what the operator sees.
//
//   - created_at, updated_at, assessment_at, completed_at ... UTC ISO instants
//   - follow_ups.due_on ...................................... 'YYYY-MM-DD' Toronto calendar date

export const TZ = 'America/Toronto';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const displayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dateOnlyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function torontoParts(ms) {
  const out = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** Offset (ms) of Toronto from UTC at the given UTC instant. */
function offsetMs(utcMs) {
  const p = torontoParts(utcMs);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Today's calendar date in Toronto, 'YYYY-MM-DD'. */
export function torontoToday(now = new Date()) {
  const p = torontoParts(now.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM-DD' -> 'Fri, Sep 25, 2026' (no timezone conversion: it's a calendar date). */
export function formatDate(dateStr) {
  if (!isValidDateString(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateOnlyFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

/** UTC ISO instant -> 'Sep 19, 2026, 2:05 a.m.' in Toronto time. */
export function formatDateTime(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return displayFmt.format(new Date(ms));
}

/** UTC ISO instant -> value for <input type="datetime-local"> in Toronto time. */
export function utcIsoToTorontoInput(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = torontoParts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * <input type="datetime-local"> value (Toronto wall-clock) -> UTC ISO string.
 * Returns null for malformed input or for a wall-clock time that does not
 * exist (the hour skipped when clocks spring forward).
 */
export function torontoInputToUtcIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (!isValidDateString(`${m[1]}-${m[2]}-${m[3]}`) || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMs(guess);
  const second = guess - offsetMs(utc);
  if (second !== utc) utc = second;
  const iso = new Date(utc).toISOString();
  // Round-trip: a skipped (non-existent) local time will not come back unchanged.
  return utcIsoToTorontoInput(iso) === value ? iso : null;
}

// ---------------------------------------------------------------------------
// Calendar-date helpers used by the follow-up sequence (shared by both Workers).

/** 'YYYY-MM-DD' + n days -> 'YYYY-MM-DD' (pure calendar arithmetic, no time zone). */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Toronto calendar date of a UTC instant (ISO string or Date). */
export function torontoDateOf(instant) {
  const p = torontoParts(new Date(instant).getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

/** Toronto wall-clock hour (0-23) and minute of a UTC instant. */
export function torontoClock(instant) {
  const p = torontoParts(new Date(instant).getTime());
  return { hour: Number(p.hour), minute: Number(p.minute) };
}

/** Toronto calendar date + hour (e.g. '2026-09-20', 9) -> UTC ISO instant. */
export function torontoDateHourToUtcIso(dateStr, hour) {
  return torontoInputToUtcIso(`${dateStr}T${String(hour).padStart(2, '0')}:00`);
}

// CSV building with protection against spreadsheet formula injection.
//
// A cell that begins with = + - @ (optionally after whitespace) or with a tab
// / carriage return can be executed as a formula by Excel, Sheets, and
// LibreOffice. Customer-supplied text (names, project details...) is
// untrusted, so any such cell is prefixed with a single quote, which makes
// spreadsheets treat it as literal text. (This also means a phone number
// like "+1 289 ..." is exported as "'+1 289 ..." — a deliberate trade-off.)

export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r]|^\s*[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows: array of arrays. Returns CSV text with CRLF line ends and a UTF-8 BOM (so Excel reads accents correctly). */
export function toCsv(header, rows) {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

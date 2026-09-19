// Regenerates sitemap.xml from the pages on disk. Pages marked noindex are left out.
// Canonical URL format: folder pages end in "/", flat pages keep ".html" (same as their <link rel="canonical">).
'use strict';
const fs = require('fs');
const path = require('path');
const { walk, relOf, urlPathOf } = require('./sync');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://www.renosrise.com';
const LASTMOD = process.argv[2] || new Date().toISOString().slice(0, 10);

const rows = [];
for (const f of walk(ROOT)) {
  const rel = relOf(f);
  if (rel === '404.html') continue;
  const html = fs.readFileSync(f, 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
  rows.push(urlPathOf(rel));
}
rows.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
  .map((u) => `  <url>\n    <loc>${SITE}/${u}</loc>\n    <lastmod>${LASTMOD}</lastmod>\n  </url>`)
  .join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${rows.length} URLs`);

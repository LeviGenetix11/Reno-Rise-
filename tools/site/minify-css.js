// Produces css/style.min.css from the hand-authored css/style.css.
//
// style.css stays the file to edit (readable, and several checks in nav-check.js and
// browser-tests/nav.mjs read it directly for specific formatted rules). This script never
// changes it. Pages reference the minified file instead, purely to cut transfer size
// (Lighthouse: "Minify CSS").
//
// The minifier only removes comments and collapses/strips whitespace around punctuation
// that never needs it (`{ } : ; , >  ~`). It deliberately leaves `+` and `-` alone: calc()
// requires a space on both sides of those operators (e.g. `calc(100% + 16px)`), and this
// stylesheet uses that.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'css', 'style.css');
const OUT = path.join(__dirname, '..', '..', 'css', 'style.min.css');

function minifyCss(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // comments
    .replace(/\s+/g, ' ') // collapse all whitespace (incl. newlines) to a single space
    .replace(/ ?([{}:;,>~]) ?/g, '$1') // drop the space around punctuation that never needs one
    .replace(/;}/g, '}') // a trailing ; before } is redundant
    .trim();
}

module.exports = { minifyCss };

if (require.main === module) {
  const src = fs.readFileSync(SRC, 'utf8');
  const min = minifyCss(src);
  // Sanity check: minifying must not change the meaning. The most likely way a regex-based
  // minifier could break something is by touching a calc() operator; confirm every calc()
  // still has one.
  const calcsBefore = (src.match(/calc\([^)]*\)/g) || []).length;
  const calcsAfter = (min.match(/calc\([^)]*[+-][^)]*\)/g) || []).length;
  if (calcsBefore > 0 && calcsAfter < calcsBefore) {
    throw new Error(`minify-css: a calc() operator lost its required spacing (${calcsBefore} calc() before, ${calcsAfter} with a spaced operator after)`);
  }
  fs.writeFileSync(OUT, min);
  console.log(`wrote css/style.min.css (${src.length} -> ${min.length} bytes, ${Math.round((1 - min.length / src.length) * 100)}% smaller)`);
}

// Regenerates every generated page, applies the sitewide sync, rebuilds the sitemap and runs the checks.
//   node tools/site/build.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const here = __dirname;
const run = (file, args = []) => {
  console.log(`\n> ${path.relative(path.join(here, '..', '..'), path.join(here, file))} ${args.join(' ')}`);
  execFileSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' });
};

run('pages/suite.js');
run('pages/home.js');
run('pages/basement.js');
run('pages/cluster.js');
run('pages/services-index.js');
run('pages/misc.js');
run('pages/posts.js');
run('legacy.js');
run('pages/blog-index.js');
run('pages/cities.js');
run('pages/locations.js');
run('sync.js');
run('sitemap.js');
run('check.js');

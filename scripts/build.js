// Assembles a clean, self-contained build of the game into dist/.
// dist/ is the deployable root folder (index.html at the top level) — serve it
// as-is or upload it wherever a static site can live.
// Run `npm install` first so three.js is vendored into lib/.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const items = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'js',
  'assets',
  'lib', // vendored three.js — makes the build fully offline-capable
];

const libOk = fs.existsSync(path.join(root, 'lib', 'three.module.min.js'));
if (!libOk) {
  console.warn('warning: lib/ is missing (run `npm install` to vendor three.js);');
  console.warn('the build will load three.js from the CDN at runtime instead.');
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const item of items) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(dist, item), { recursive: true });
  console.log(`dist/${item}`);
}
console.log('\nbuild complete → dist/');

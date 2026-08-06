// Copies the three.js module builds into lib/ so the game runs fully
// self-contained (index.html falls back to the CDN when lib/ is absent).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'three', 'build');
const dst = path.join(__dirname, '..', 'lib');
const files = ['three.module.min.js', 'three.core.min.js'];

if (!fs.existsSync(src)) {
  console.log('three not installed; skipping vendor step');
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  console.log(`vendored lib/${f}`);
}

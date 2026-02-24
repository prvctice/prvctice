#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [path.join(root, 'dist', 'index.html'), path.join(root, 'dist', 'images')];

let missing = [];
for (const p of required) {
  if (!fs.existsSync(p)) missing.push(p);
}

if (missing.length) {
  console.error(
    '[check:dist] Missing required build outputs:\n' + missing.map((x) => ' - ' + x).join('\n')
  );
  process.exit(1);
}
console.log('[check:dist] OK');

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

const root = path.resolve(__dirname, '..');
const distIndex = path.join(root, 'dist', 'index.html');
const publicIndex = path.join(root, 'public', 'index.html');

const needBuild = (() => {
  if (!fs.existsSync(distIndex)) return true;
  const distTime = mtime(distIndex);
  const pubTime = mtime(publicIndex);
  // If public index is newer than built index, rebuild
  return pubTime > distTime;
})();

if (needBuild) {
  console.log('[ensure:dist] Building web assets...');
  execSync('ELECTRON_BUILD=true npm run web:build', { stdio: 'inherit' });
} else {
  console.log('[ensure:dist] Up to date.');
}

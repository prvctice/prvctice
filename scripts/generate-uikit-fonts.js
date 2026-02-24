#!/usr/bin/env node

/**
 * Generate base64-encoded @font-face CSS for the UI Kit.
 *
 * Run: node scripts/generate-uikit-fonts.js
 *
 * Reads WOFF2 font files from public/fonts/ and writes base64 data URIs
 * into web/services/apps/uikit/css/fonts.css. This file is imported via
 * Vite's ?raw suffix so the fonts are available synchronously in the browser
 * without async fetch() calls.
 */

const fs = require('fs');
const path = require('path');

const fontsDir = path.resolve(__dirname, '../public/fonts');
const outputPath = path.resolve(__dirname, '../web/services/apps/uikit/css/fonts.css');

const fonts = [
  { family: 'Gothic A1', weight: 300, file: 'gothic-a1-300.woff2' },
  { family: 'Gothic A1', weight: 400, file: 'gothic-a1-400.woff2' },
  { family: 'Gothic A1', weight: 500, file: 'gothic-a1-500.woff2' },
  { family: 'Gothic A1', weight: 600, file: 'gothic-a1-600.woff2' },
  { family: 'IBM Plex Mono', weight: 400, file: 'ibm-plex-mono-400.woff2' },
  { family: 'IBM Plex Mono', weight: 500, file: 'ibm-plex-mono-500.woff2' },
];

let css = '/* Auto-generated — do not edit. Run: node scripts/generate-uikit-fonts.js */\n\n';

for (const font of fonts) {
  const raw = fs.readFileSync(path.resolve(fontsDir, font.file));
  const b64 = raw.toString('base64');
  css += `@font-face {\n`;
  css += `  font-family: '${font.family}';\n`;
  css += `  font-style: normal;\n`;
  css += `  font-weight: ${font.weight};\n`;
  css += `  font-display: swap;\n`;
  css += `  src: url(data:font/woff2;base64,${b64}) format('woff2');\n`;
  css += `}\n\n`;
}

fs.writeFileSync(outputPath, css);
console.log(`Generated ${outputPath} (${css.length} bytes)`);

#!/usr/bin/env node
/*
 * Regenerates the list of `@import` statements for theme CSS files inside
 * `public/styles.css`.  This script scans the `/public/themes` directory for
 * `*-theme.css` files and overwrites the section between the markers
 * "Load Themes" and "BASE STYLES" with an alphabetically-sorted list of imports.
 *
 * Run manually with:
 *   node scripts/generate-theme-imports.js
 *
 * …or add an npm script:
 *   "generate-theme-imports": "node scripts/generate-theme-imports.js"
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path relative to project root (two levels up from this
 * script)
 */
const root = path.resolve(__dirname, '..');
const themesDir = path.join(root, 'public', 'themes');
const stylesCssPath = path.join(root, 'public', 'styles.css');

function getThemeFiles() {
  return fs
    .readdirSync(themesDir)
    .filter((file) => file.endsWith('.css'))
    .sort((a, b) => a.localeCompare(b));
}

function buildImportLines(files) {
  return files.map((f) => `@import url('/themes/${f}');`).join('\n');
}

function regenerateImports() {
  const themeFiles = getThemeFiles();
  const importsBlock = buildImportLines(themeFiles);

  let css = fs.readFileSync(stylesCssPath, 'utf8');

  const startMarker = '/**Load Themes**/';
  const endMarker = '/**BASE STYLES**/';

  const startIdx = css.indexOf(startMarker);
  const endIdx = css.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not locate theme import markers in styles.css');
    process.exit(1);
  }

  // Keep everything up to (and including) the marker comment.
  const before = css.slice(0, css.indexOf(startMarker) + startMarker.length);

  // Keep everything after the end marker (inclusive) as-is.
  const after = css.slice(endIdx);

  const newCss = [before, '\n', importsBlock, '\n\n', after].join('');

  fs.writeFileSync(stylesCssPath, newCss, 'utf8');

  console.log(`✅ Injected ${themeFiles.length} theme imports into styles.css`);
}

// Run if invoked directly (not required when imported as module)
if (require.main === module) {
  regenerateImports();
}

module.exports = { regenerateImports };

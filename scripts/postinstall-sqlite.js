#!/usr/bin/env node

const name = 'better-sqlite3';

try {
  require.resolve(name);
  console.log('[prvctice] better-sqlite3 available');
} catch (err) {
  console.warn('[prvctice] better-sqlite3 unavailable, falling back to sql.js');
  if (process.env.npm_lifecycle_event === 'postinstall') {
    console.warn(
      '  ↳ To enable native SQLite, install build tools and run `npm install better-sqlite3 --no-optional --force`.'
    );
  }
}

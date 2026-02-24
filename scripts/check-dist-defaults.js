#!/usr/bin/env node
/*
 * Verifies that when a dist/ directory exists, the app prefers serving from it
 * and the /api/v1/config/defaults endpoint returns the expected defaults.
 * This runs in-process without binding to a port.
 */
const assert = require('node:assert/strict');

function getConfigDefaultsViaHandler(app) {
  const configRouter = require('../src/routes/config');
  const layer = configRouter.stack.find(
    (l) => l.route && l.route.path === '/defaults' && l.route.methods.get
  );
  const handler = layer.route.stack.at(-1).handle;
  const req = { app };
  let payload;
  const res = {
    json: (obj) => {
      payload = obj;
    },
    status: (code) => ({
      json: (obj) => {
        throw new Error(`Unexpected ${code}: ${JSON.stringify(obj)}`);
      },
    }),
  };
  handler(req, res);
  return payload;
}

async function main() {
  const fs = require('fs');
  const path = require('path');
  const app = require('../src/app');

  // Check static root preference
  const distDir = path.join(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    console.warn('dist/ not found – run `npm run web:build` first.');
  }
  const staticRoot = app.get('staticRoot');
  assert.ok(staticRoot === 'dist' || staticRoot === 'public');
  if (fs.existsSync(distDir)) {
    assert.equal(staticRoot, 'dist', 'App should prefer dist/ when present');
  }

  // Verify defaults endpoint echoes the configured defaults
  const resp = getConfigDefaultsViaHandler(app);
  assert.equal(resp.ok, true);
  const d = resp.defaults || {};
  assert.equal(d.providerDefault, 'openai');
  assert.equal(d.models.openai, 'gpt-5-mini');
  assert.equal(d.reasoningDefault, 'low');

  console.log('check-dist-defaults: OK');
}

main().catch((err) => {
  console.error('check-dist-defaults: FAILED');
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

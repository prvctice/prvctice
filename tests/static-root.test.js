// Node.js built-in test to verify the static root selection logic
const test = require('node:test');
const assert = require('node:assert/strict');

test('app chooses dist as static root when present', async () => {
  // The repo includes a dist/ directory. Requiring the app should set app.locals
  const app = require('../src/app');
  const root = app.get('staticRoot');
  assert.ok(root === 'dist' || root === 'public', 'staticRoot set');
  // Prefer dist when available
  assert.equal(root, 'dist');
});

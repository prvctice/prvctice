/* eslint-disable import/extensions */
const assert = require('assert');
const { test, beforeEach } = require('node:test');

// Enable deduplication in test environment
process.env.TEST_ENABLE_DEDUPE = 'true';

let dedupe;
let req, res, nextCalled;

beforeEach(() => {
  // Reload the middleware to reset its internal cache
  delete require.cache[require.resolve('../../src/middleware/deduplicateRequests')];
  dedupe = require('../../src/middleware/deduplicateRequests');
  req = { body: { foo: 'bar' } };
  res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
  nextCalled = false;
});

test('first request calls next and does not send a response', () => {
  dedupe(req, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData, null);
});

test('second identical request returns 429 error', () => {
  // First call populates cache
  dedupe(req, res, () => {});
  // Reset response state
  res.statusCode = 200;
  res.jsonData = null;
  nextCalled = false;
  // Second call should detect duplicate
  dedupe(req, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 429);
  assert.ok(res.jsonData.error.includes('Duplicate request detected'));
  assert.ok(res.jsonData.details && typeof res.jsonData.details.requestHash === 'string');
});

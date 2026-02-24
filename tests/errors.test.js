/* eslint-disable import/extensions */
const assert = require('assert');
const { test } = require('node:test');

const { normaliseError, ProviderError } = require('../src/utils/errors');

test('normaliseError wraps into ProviderError', () => {
  const orig = new Error('Kaboom');
  orig.code = 500;
  const wrapped = normaliseError('openai', orig);
  assert.ok(wrapped instanceof ProviderError);
  assert.strictEqual(wrapped.provider, 'openai');
  assert.strictEqual(wrapped.retriable, true);
});

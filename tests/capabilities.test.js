/* eslint-disable import/extensions */
const assert = require('assert');
const { test } = require('node:test');

const { getCapabilities, supportsStreaming, supportsTools } = require('../src/utils/capabilities');

test('capability matrix – basic lookups', () => {
  const openai = getCapabilities('openai');
  assert.ok(openai);
  assert.strictEqual(openai.streaming, true);
  assert.strictEqual(openai.tools, 'full');

  assert.ok(supportsStreaming('gemini'));
  assert.ok(supportsTools('anthropic'));
});

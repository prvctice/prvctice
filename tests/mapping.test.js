/* eslint-disable import/extensions */
const assert = require('assert');
const { test } = require('node:test');

const { mcpToGeminiContents } = require('../src/utils/geminiMapping');

function findPartByKey(parts, key) {
  return parts.find((p) => Object.prototype.hasOwnProperty.call(p, key));
}

test('gemini mapping – user & assistant text passthrough', () => {
  const messages = [
    { role: 'user', content: 'Hi!' },
    { role: 'assistant', content: 'Hello there' },
  ];

  const out = mcpToGeminiContents(messages);

  assert.deepStrictEqual(out[0], {
    role: 'user',
    parts: [{ text: 'Hi!' }],
  });

  assert.deepStrictEqual(out[1], {
    role: 'model',
    parts: [{ text: 'Hello there' }],
  });
});

test('gemini mapping – tool result encoded as functionResponse', () => {
  const messages = [
    { role: 'tool', name: 'get_weather', content: JSON.stringify({ temp: '10C' }) },
  ];

  const out = mcpToGeminiContents(messages);

  assert.strictEqual(out[0].role, 'function');

  const part = findPartByKey(out[0].parts, 'functionResponse');
  assert.ok(part);
  assert.deepStrictEqual(part.functionResponse, {
    name: 'get_weather',
    response: { temp: '10C' },
  });
});

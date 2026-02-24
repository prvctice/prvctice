const test = require('node:test');
const assert = require('node:assert/strict');

// Test the CLI migrate function directly
const { migrate } = require('../scripts/config-migrate.js');

test('migrates legacy model keys and normalizes reasoning', () => {
  const storage = {
    openaiModel: 'gpt-x',
    anthropicModel: 'claude-x',
    geminiModel: 'gem-x',
    chatReasoningEffort: 'minimal',
  };

  migrate(storage);

  // New keys copied if missing
  assert.equal(storage['model:openai'], 'gpt-x');
  assert.equal(storage['model:anthropic'], 'claude-x');
  assert.equal(storage['model:gemini'], 'gem-x');
  // Normalized effort: legacy 'minimal' becomes 'low'
  assert.equal(storage['chatReasoningEffort'], 'low');
  // Marked as done
  assert.equal(storage['config:migration:v1'], '1');
});

test('migration is idempotent', () => {
  const storage = {
    openaiModel: 'a',
    'model:openai': 'b', // already migrated
  };
  migrate(storage);
  const afterFirst = JSON.stringify(storage);
  migrate(storage);
  const afterSecond = JSON.stringify(storage);
  assert.deepEqual(afterSecond, afterFirst, 'no changes after first run');
});

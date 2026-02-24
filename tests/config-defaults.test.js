const test = require('node:test');
const assert = require('node:assert/strict');

// Helper to clear module cache for fresh loads
function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('loadDefaults returns validated defaults from file', () => {
  const { loadDefaults } = fresh('../src/config/defaults');
  const d = loadDefaults();
  assert.equal(d.providerDefault, 'anthropic');
  assert.equal(typeof d.models, 'object');
  assert.equal(d.models.openai, 'gpt-5.2');
  assert.equal(d.reasoningDefault, 'low');
});

test('loadDefaults falls back safely on invalid JSON', () => {
  const path = require('path');
  const fs = require('fs');
  const target = path.join(__dirname, '../config/defaults.json');

  // Backup and write invalid content
  const original = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, '{"bad":', 'utf8');

  try {
    const { loadDefaults } = fresh('../src/config/defaults');
    const d = loadDefaults();
    assert.equal(d.providerDefault, 'anthropic');
    assert.equal(d.reasoningDefault, 'low');
    assert.ok(d._error, 'includes error message on fallback');
  } finally {
    // Restore file
    fs.writeFileSync(target, original, 'utf8');
  }
});

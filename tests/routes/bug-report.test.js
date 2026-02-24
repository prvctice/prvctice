const test = require('node:test');
const assert = require('node:assert/strict');

test('bug report includes defaults snapshot and runtime info', async () => {
  const router = require('../../src/routes/bugReport');
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.get);
  const handler = layer.route.stack.at(-1).handle;

  const req = {
    query: { lines: '5' },
    app: { get: (k) => (k === 'staticRoot' ? 'dist' : undefined) },
  };
  let json;
  const res = {
    json: (obj) => {
      json = obj;
    },
    status: (code) => ({
      json: (obj) => {
        throw new Error(`Unexpected ${code}: ${JSON.stringify(obj)}`);
      },
    }),
  };

  await handler(req, res);
  assert.ok(json.reportId);
  assert.ok(Array.isArray(json.logLines));
  assert.equal(typeof json.defaults, 'object');
  assert.equal(json.defaults.providerDefault, 'anthropic');
  assert.equal(json.defaults.reasoningDefault, 'low');
  assert.equal(typeof json.defaults.fileHash, 'string');
  assert.equal(json.runtime.staticRoot, 'dist');
  assert.equal(typeof json.runtime.version, 'string');
});

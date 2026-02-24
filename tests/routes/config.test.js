/* eslint-disable import/extensions */
const test = require('node:test');
const assert = require('node:assert/strict');

// Store original env vars to restore after tests
const originalEnv = { ...process.env };

// Helper to get route handler
function getHandler(router, path, method = 'get') {
  const layer = router.stack.find((l) => l.route && l.route.path === path);
  if (!layer) throw new Error(`No route found for ${path}`);
  const methodLayer = layer.route.stack.find((l) => l.method === method);
  if (!methodLayer) throw new Error(`No ${method} handler for ${path}`);
  return methodLayer.handle;
}

// Mock response object
function createMockRes() {
  const res = {};
  res.statusCode = 200;
  res.jsonData = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  return res;
}

test('GET /keys returns boolean flags for present API keys', async () => {
  // Set some env vars for testing
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  delete process.env.LMSTUDIO_URL;
  delete process.env.FREE_TIER_API_KEY;

  // Clear require cache to pick up new env
  delete require.cache[require.resolve('../../src/routes/config')];
  delete require.cache[require.resolve('../../src/config/index')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/keys');

  const req = {};
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.ok, true);
  assert.equal(res.jsonData.has.openai, true);
  assert.equal(res.jsonData.has.anthropic, true);
  assert.equal(res.jsonData.has.google, false);
  assert.equal(res.jsonData.has.openrouter, true);
  assert.equal(res.jsonData.has.lmstudio, false);
  assert.equal(res.jsonData.has.freeTier, false);

  // Restore env
  Object.assign(process.env, originalEnv);
});

test('GET /defaults returns app defaults', async () => {
  delete require.cache[require.resolve('../../src/routes/config')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/defaults');

  const req = {};
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.ok, true);
  assert.ok(res.jsonData.defaults);
  assert.ok(res.jsonData.defaults.models);
  assert.ok(res.jsonData.defaults.reasoningDefault);
});

test('GET /runtime returns version and staticRoot', async () => {
  delete require.cache[require.resolve('../../src/routes/config')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/runtime');

  const req = {
    app: { get: (key) => (key === 'staticRoot' ? 'dist' : undefined) },
  };
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.ok, true);
  assert.ok(res.jsonData.runtime);
  assert.equal(res.jsonData.runtime.staticRoot, 'dist');
  assert.equal(typeof res.jsonData.runtime.version, 'string');
});

test('GET /runtime uses default staticRoot when not set', async () => {
  delete require.cache[require.resolve('../../src/routes/config')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/runtime');

  const req = {
    app: { get: () => undefined },
  };
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.runtime.staticRoot, 'public');
});

test('GET /flags returns feature flags', async () => {
  process.env.MODEL_FIRST_ROUTER = 'true';
  process.env.MODEL_ROUTER_DRY_RUN = 'false';
  process.env.SMART_SWITCHES = 'true';
  process.env.RECENT_IMAGE_TTL_MIN = '30';

  delete require.cache[require.resolve('../../src/routes/config')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/flags');

  const req = {};
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.ok, true);
  assert.ok(res.jsonData.flags);
  assert.equal(res.jsonData.flags.MODEL_FIRST_ROUTER, true);
  assert.equal(res.jsonData.flags.MODEL_ROUTER_DRY_RUN, false);
  assert.equal(res.jsonData.flags.SMART_SWITCHES, true);
  assert.equal(res.jsonData.flags.RECENT_IMAGE_TTL_MIN, 30);
  assert.equal(res.jsonData.flags.schema_version, 'v2');

  // Restore env
  Object.assign(process.env, originalEnv);
});

test('GET /flags defaults correctly when env vars not set', async () => {
  delete process.env.MODEL_FIRST_ROUTER;
  delete process.env.MODEL_ROUTER_DRY_RUN;
  delete process.env.SMART_SWITCHES;
  delete process.env.RECENT_IMAGE_TTL_MIN;

  delete require.cache[require.resolve('../../src/routes/config')];
  const router = require('../../src/routes/config');
  const handler = getHandler(router, '/flags');

  const req = {};
  const res = createMockRes();
  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.flags.MODEL_FIRST_ROUTER, true); // default true
  assert.equal(res.jsonData.flags.MODEL_ROUTER_DRY_RUN, false); // default false
  assert.equal(res.jsonData.flags.SMART_SWITCHES, false); // default false
  assert.equal(res.jsonData.flags.RECENT_IMAGE_TTL_MIN, 20); // default 20

  // Restore env
  Object.assign(process.env, originalEnv);
});

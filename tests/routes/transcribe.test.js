/* eslint-disable import/extensions */
const test = require('node:test');
const assert = require('node:assert/strict');

// Store original env
const originalEnv = { ...process.env };

// Mock node-fetch before importing router
const mockFetch = {
  response: { ok: true, json: async () => ({ text: 'transcribed text' }) },
};

// Create mock function
const mockFetchFn = async () => mockFetch.response;
mockFetchFn.default = mockFetchFn;

require.cache[require.resolve('node-fetch')] = {
  id: require.resolve('node-fetch'),
  exports: mockFetchFn,
};

// Helper to get route handler(s)
function getHandlers(router, path, method = 'get') {
  const layer = router.stack.find((l) => l.route && l.route.path === path);
  if (!layer) throw new Error(`No route found for ${path}`);
  const methodLayers = layer.route.stack.filter((l) => l.method === method);
  return methodLayers.map((l) => l.handle);
}

function getHandler(router, path, method = 'get') {
  const handlers = getHandlers(router, path, method);
  return handlers[handlers.length - 1]; // Return the last handler (actual handler, not middleware)
}

// Mock response object
function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
  };
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

// Mock session
function createMockSession() {
  return {
    openaiApiKey: null,
    _userProvidedKeys: {},
  };
}

test('GET /status returns available when OpenAI key exists in env', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  delete require.cache[require.resolve('../../src/routes/transcribe')];
  delete require.cache[require.resolve('../../src/utils/sessionKeys')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/status');

  const req = { session: createMockSession() };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.available, true);
  assert.equal(res.jsonData.reason, null);

  Object.assign(process.env, originalEnv);
});

test('GET /status returns unavailable when no OpenAI key', async () => {
  delete process.env.OPENAI_API_KEY;

  delete require.cache[require.resolve('../../src/routes/transcribe')];
  delete require.cache[require.resolve('../../src/utils/sessionKeys')];
  delete require.cache[require.resolve('../../src/utils/apiKey')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/status');

  const req = { session: createMockSession() };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.available, false);
  assert.ok(res.jsonData.reason.includes('OpenAI API key'));

  Object.assign(process.env, originalEnv);
});

test('POST / returns 400 when no audio file provided', async () => {
  delete require.cache[require.resolve('../../src/routes/transcribe')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/', 'post');

  const req = {
    file: undefined,
    body: {},
    session: createMockSession(),
    get: () => null,
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.jsonData.error, 'no-audio-file');
});

test('POST / returns 503 when no API key available', async () => {
  delete process.env.OPENAI_API_KEY;

  delete require.cache[require.resolve('../../src/routes/transcribe')];
  delete require.cache[require.resolve('../../src/utils/apiKey')];
  delete require.cache[require.resolve('../../src/utils/sessionKeys')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/', 'post');

  const req = {
    file: { buffer: Buffer.from('audio'), originalname: 'test.webm' },
    body: {},
    session: createMockSession(),
    get: () => null,
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.ok(res.jsonData.error.includes('OpenAI API key'));
  assert.equal(res.jsonData.code, 'transcription_unavailable');

  Object.assign(process.env, originalEnv);
});

test('POST / successfully transcribes audio with explicit key', async () => {
  // Reset mock fetch to success
  mockFetch.response = {
    ok: true,
    json: async () => ({ text: 'Hello, this is transcribed text.' }),
  };

  delete require.cache[require.resolve('../../src/routes/transcribe')];
  delete require.cache[require.resolve('../../src/utils/apiKey')];
  delete require.cache[require.resolve('../../src/utils/sessionKeys')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/', 'post');

  const req = {
    file: { buffer: Buffer.from('audio data'), originalname: 'speech.webm' },
    body: { openaiApiKey: 'user-provided-key' }, // Explicit key required
    session: createMockSession(),
    get: () => null,
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.text, 'Hello, this is transcribed text.');
});

test('POST / returns 500 when OpenAI API returns error', async () => {
  // Set mock fetch to error response
  mockFetch.response = {
    ok: false,
    json: async () => ({ error: { message: 'Invalid API key' } }),
  };

  delete require.cache[require.resolve('../../src/routes/transcribe')];
  delete require.cache[require.resolve('../../src/utils/apiKey')];
  delete require.cache[require.resolve('../../src/utils/sessionKeys')];
  const router = require('../../src/routes/transcribe');
  const handler = getHandler(router, '/', 'post');

  const req = {
    file: { buffer: Buffer.from('audio data'), originalname: 'speech.webm' },
    body: { openaiApiKey: 'user-provided-key' }, // Explicit key required
    session: createMockSession(),
    get: () => null,
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.jsonData.error, 'Invalid API key');
});

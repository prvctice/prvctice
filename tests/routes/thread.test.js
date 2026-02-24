/* eslint-disable import/extensions */
const test = require('node:test');
const assert = require('node:assert/strict');

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

// Mock session object
function createMockSession() {
  return {
    threadId: null,
    isNewSession: false,
    mcpHistory: {},
  };
}

test('GET / creates new threadId in session', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/');

  const session = createMockSession();
  const req = { session };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.threadId);
  assert.equal(typeof res.jsonData.threadId, 'string');
  assert.equal(session.threadId, res.jsonData.threadId);
});

test('GET / returns 400 when session is missing', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/');

  const req = { session: null };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.jsonData.error);
  assert.ok(res.jsonData.error.includes('Session unavailable'));
});

test('POST /clear resets session and thread', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/clear', 'post');

  const session = createMockSession();
  session.threadId = 'old-thread-id';
  session.mcpHistory = { openai: [{ role: 'user', content: 'test' }] };

  const req = { session, body: {} };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.message);
  assert.equal(session.threadId, null);
  assert.equal(session.isNewSession, true);
});

test('POST /clear clears specific provider history', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/clear', 'post');

  const session = createMockSession();
  session.threadId = 'thread-123';
  session.mcpHistory = {
    openai: [{ role: 'user', content: 'openai msg' }],
    anthropic: [{ role: 'user', content: 'anthropic msg' }],
  };

  const req = { session, body: { provider: 'openai' } };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  // OpenAI history should be cleared
  assert.deepEqual(session.mcpHistory.openai, []);
  // Anthropic history should remain
  assert.deepEqual(session.mcpHistory.anthropic, [{ role: 'user', content: 'anthropic msg' }]);
});

test('POST /clear returns 400 when session is missing', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/clear', 'post');

  const req = { session: null, body: {} };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.jsonData.error.includes('Session unavailable'));
});

test('POST /restore adds messages to provider history', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/restore', 'post');

  const session = createMockSession();
  const req = {
    session,
    body: {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      provider: 'anthropic',
    },
  };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.ok, true);
  assert.equal(res.jsonData.count, 2);
  assert.deepEqual(session.mcpHistory.anthropic, [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ]);
});

test('POST /restore filters invalid messages and limits to 40', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/restore', 'post');

  const session = createMockSession();
  // Create 50 messages to test the limit
  const messages = [];
  for (let i = 0; i < 50; i++) {
    messages.push({ role: 'user', content: `Message ${i}` });
  }
  // Add some invalid messages
  messages.push({ role: 'user', content: '' }); // empty content
  messages.push({ role: 'user' }); // missing content
  messages.push({ content: 'no role' }); // missing role (defaults to user)

  const req = { session, body: { messages } };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.count, 40); // Capped at 40
});

test('POST /restore returns 400 when session is missing', async () => {
  const router = require('../../src/routes/thread');
  const handler = getHandler(router, '/restore', 'post');

  const req = {
    session: null,
    body: { messages: [{ role: 'user', content: 'test' }] },
  };
  const res = createMockRes();

  handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.jsonData.error.includes('Session unavailable'));
});

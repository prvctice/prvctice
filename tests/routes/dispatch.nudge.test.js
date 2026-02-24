/* eslint-disable import/extensions */
const assert = require('assert');
const { test, beforeEach } = require('node:test');

// Ensure deterministic behavior
process.env.NODE_ENV = 'test';

// Import router under test
const dispatchRouter = require('../../src/routes/dispatch');

function getPostHandler(router) {
  const layer = router.stack.find((l) => l.route && l.route.path === '/');
  const postLayer = layer.route.stack.find((l) => l.method === 'post');
  return postLayer.handle;
}

const dispatchHandler = getPostHandler(dispatchRouter);

function createMockRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res._json = null;
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res._json = obj;
    return res;
  };
  // Capture redirect target for assertions
  res._redirect = null;
  res.redirect = (codeOrUrl, maybeUrl) => {
    if (typeof codeOrUrl === 'number') {
      res._redirect = maybeUrl;
      res.statusCode = codeOrUrl;
    } else {
      res._redirect = codeOrUrl;
    }
    return res;
  };
  return res;
}

beforeEach(() => {
  // Clear any session between tests
});

test('chat_vision task redirects to chat endpoint', async () => {
  const req = {
    method: 'POST',
    body: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'Please read text in this image.' }],
      stream: true,
      images: [{ data: 'AA', mimeType: 'image/png' }],
    },
    headers: {},
    get(h) {
      return this.headers[h.toLowerCase()];
    },
    session: {},
  };
  const res = createMockRes();

  await dispatchHandler(req, res);

  // Vision tasks redirect to chat endpoint
  assert.strictEqual(res.statusCode, 307);
  assert.strictEqual(res._redirect, '/api/v1/chat');
});

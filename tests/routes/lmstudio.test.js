/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach, mock } = require('node:test');

let lmstudioRouter;
let originalFetch;
let originalEnv;

function getHandler(router, path, method = 'get') {
  const layer = router.stack.find((l) => l.route && l.route.path === path);
  if (!layer) throw new Error(`No route found for ${path}`);
  const methodLayer = layer.route.stack.find((l) => l.method === method);
  return methodLayer.handle;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this._json = obj;
      return this;
    },
  };
  return res;
}

beforeEach(() => {
  originalFetch = global.fetch;
  originalEnv = { ...process.env };
  delete require.cache[require.resolve('../../src/routes/lmstudio')];
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = originalEnv;
});

describe('lmstudio routes', () => {
  describe('GET /status', () => {
    test('returns available true when LM Studio is running', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/status');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.available, true);
      assert.strictEqual(res._json.error, null);
      assert.strictEqual(res._json.baseUrl, 'http://localhost:1234');
    });

    test('returns available false when LM Studio is not running', async () => {
      const connError = new Error('fetch failed');
      connError.cause = { code: 'ECONNREFUSED' };
      global.fetch = mock.fn(async () => {
        throw connError;
      });

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/status');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.available, false);
      assert.ok(res._json.error.includes('not running'));
    });

    test('uses custom baseUrl from query parameter', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/status');

      const req = { query: { baseUrl: 'http://custom:5000' }, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.baseUrl, 'http://custom:5000');
    });

    test('uses custom baseUrl from header', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/status');

      const req = { query: {}, headers: { 'x-lmstudio-url': 'http://header-url:6000' } };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.baseUrl, 'http://header-url:6000');
    });
  });

  describe('GET /models', () => {
    test('returns models when LM Studio is available', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'model-a', owned_by: 'local' }, { id: 'model-b' }],
        }),
      }));

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/models');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.available, true);
      assert.strictEqual(res._json.models.length, 2);
      assert.strictEqual(res._json.models[0].id, 'model-a');
      assert.strictEqual(res._json.models[0].owned_by, 'local');
    });

    test('returns empty models when LM Studio is not available', async () => {
      const connError = new Error('fetch failed');
      connError.cause = { code: 'ECONNREFUSED' };
      global.fetch = mock.fn(async () => {
        throw connError;
      });

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/models');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.available, false);
      assert.deepStrictEqual(res._json.models, []);
      assert.ok(res._json.error);
    });

    test('handles API error response', async () => {
      let callCount = 0;
      global.fetch = mock.fn(async () => {
        callCount++;
        // First call (status check) returns ok
        if (callCount === 1) {
          return { ok: true, json: async () => ({ data: [] }) };
        }
        // Second call (models fetch) returns error
        return { ok: false, status: 500 };
      });

      lmstudioRouter = require('../../src/routes/lmstudio');
      const handler = getHandler(lmstudioRouter, '/models');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.available, false);
      assert.ok(res._json.error);
    });
  });
});

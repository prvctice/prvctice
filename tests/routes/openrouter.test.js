/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach, mock } = require('node:test');

let openrouterRouter;
let originalFetch;

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
  // Clear module cache to reset models cache
  delete require.cache[require.resolve('../../src/routes/openrouter')];
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('openrouter routes', () => {
  describe('GET /models', () => {
    test('returns 401 when API key is missing', async () => {
      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = { query: {}, headers: {} };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res._json.ok, false);
      assert.ok(res._json.error.includes('API key required'));
    });

    test('accepts API key from Authorization header', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192 }],
        }),
      }));

      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = {
        query: {},
        headers: { authorization: 'Bearer sk-test-key' },
      };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.ok(res._json.models);
      assert.strictEqual(res._json.models.length, 1);
    });

    test('accepts API key from query parameter', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = {
        query: { apiKey: 'sk-query-key' },
        headers: {},
      };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
    });

    test('filters out image-only output models', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'text-model', name: 'Text Model', architecture: { modality: 'text->text' } },
            { id: 'image-gen', name: 'Image Gen', architecture: { modality: 'text->image' } },
            { id: 'audio-model', name: 'Audio Model', architecture: { modality: 'text->audio' } },
          ],
        }),
      }));

      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = {
        query: { apiKey: 'sk-test' },
        headers: {},
      };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res._json.ok, true);
      assert.strictEqual(res._json.models.length, 1);
      assert.strictEqual(res._json.models[0].id, 'text-model');
    });

    test('returns 500 on API error', async () => {
      global.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }));

      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = {
        query: { apiKey: 'sk-test' },
        headers: {},
      };
      const res = createMockRes();

      await handler(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res._json.ok, false);
      assert.ok(res._json.error);
    });

    test('formats model pricing correctly', async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'model-with-pricing',
              name: 'Priced Model',
              pricing: { prompt: 0.001, completion: 0.002 },
            },
            {
              id: 'model-no-pricing',
              name: 'Free Model',
            },
          ],
        }),
      }));

      openrouterRouter = require('../../src/routes/openrouter');
      const handler = getHandler(openrouterRouter, '/models');

      const req = {
        query: { apiKey: 'sk-test' },
        headers: {},
      };
      const res = createMockRes();

      await handler(req, res);

      const pricedModel = res._json.models.find((m) => m.id === 'model-with-pricing');
      const freeModel = res._json.models.find((m) => m.id === 'model-no-pricing');

      assert.deepStrictEqual(pricedModel.pricing, { prompt: 0.001, completion: 0.002 });
      assert.strictEqual(freeModel.pricing, null);
    });
  });
});

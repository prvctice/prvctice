/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach } = require('node:test');

let corsMiddleware;
let req, res, nextCalled, nextError;
let originalEnv;

beforeEach(() => {
  // Save original env
  originalEnv = { ...process.env };

  // Clear module cache to reset middleware state (including the extracted allowlist)
  delete require.cache[require.resolve('../../src/middleware/corsConfig')];
  delete require.cache[require.resolve('../../src/middleware/corsAllowlist')];

  // Mock request
  req = {
    method: 'GET',
    headers: {},
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };

  // Mock response
  res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      return this;
    },
  };

  nextCalled = false;
  nextError = null;
});

afterEach(() => {
  // Restore original env
  process.env = originalEnv;
});

describe('corsConfig middleware', () => {
  describe('origin validation', () => {
    test('allows request with no origin header (same-origin)', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');

      corsMiddleware(req, res, (err) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, undefined);
    });

    test('allows localhost origins by default', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.headers.origin = 'http://localhost:3000';

      corsMiddleware(req, res, (err) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, undefined);
      assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
    });

    test('allows any localhost port via regex', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.headers.origin = 'http://localhost:8080';

      corsMiddleware(req, res, (err) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, undefined);
    });

    test('rejects unknown origins not in allowlist', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.headers.origin = 'https://malicious-site.com';

      corsMiddleware(req, res, (err) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.ok(nextError instanceof Error);
      assert.ok(nextError.message.includes('not allowed by CORS'));
    });

    test('uses CORS_ORIGINS env var when set', () => {
      process.env.CORS_ORIGINS = 'https://myapp.com,https://staging.myapp.com';
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.headers.origin = 'https://myapp.com';

      corsMiddleware(req, res, (err) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, undefined);
      assert.strictEqual(res.headers['access-control-allow-origin'], 'https://myapp.com');
    });
  });

  describe('CORS headers', () => {
    test('sets credentials header to true', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.headers.origin = 'http://localhost:3000';

      corsMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
    });

    test('handles OPTIONS preflight request', () => {
      delete process.env.CORS_ORIGINS;
      corsMiddleware = require('../../src/middleware/corsConfig');
      req.method = 'OPTIONS';
      req.headers.origin = 'http://localhost:3000';
      req.headers['access-control-request-method'] = 'POST';

      corsMiddleware(req, res, () => {
        nextCalled = true;
      });

      // CORS middleware should handle preflight
      assert.ok(res.headers['access-control-allow-origin']);
    });
  });
});

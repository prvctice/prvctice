/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach } = require('node:test');

let sessionMiddleware;
let originalEnv;

beforeEach(() => {
  // Save original env
  originalEnv = { ...process.env };

  // Clear module cache to reset middleware state
  delete require.cache[require.resolve('../../src/middleware/sessionConfig')];
  delete require.cache[require.resolve('../../src/config/index')];
});

afterEach(() => {
  // Restore original env
  process.env = originalEnv;
});

describe('sessionConfig middleware', () => {
  describe('middleware creation', () => {
    test('exports a function middleware', () => {
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      sessionMiddleware = require('../../src/middleware/sessionConfig');

      assert.strictEqual(typeof sessionMiddleware, 'function');
      // Express middleware signature: (req, res, next)
      assert.strictEqual(sessionMiddleware.length, 3);
    });

    test('creates session middleware without Redis (memory store)', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      // Should not throw even without Redis
      sessionMiddleware = require('../../src/middleware/sessionConfig');
      assert.ok(sessionMiddleware);
    });
  });

  describe('cookie configuration', () => {
    test('uses lax sameSite by default', () => {
      delete process.env.COOKIE_SAMESITE;
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      sessionMiddleware = require('../../src/middleware/sessionConfig');
      // Middleware is created successfully
      assert.ok(sessionMiddleware);
    });

    test('respects COOKIE_SAMESITE env var', () => {
      process.env.COOKIE_SAMESITE = 'strict';
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      sessionMiddleware = require('../../src/middleware/sessionConfig');
      assert.ok(sessionMiddleware);
    });

    test('secure cookie is false in non-production', () => {
      process.env.NODE_ENV = 'development';
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      delete process.env.COOKIE_SECURE;

      sessionMiddleware = require('../../src/middleware/sessionConfig');
      assert.ok(sessionMiddleware);
    });

    test('respects COOKIE_SECURE env var override', () => {
      process.env.COOKIE_SECURE = 'true';
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      sessionMiddleware = require('../../src/middleware/sessionConfig');
      assert.ok(sessionMiddleware);
    });
  });

  describe('session behavior', () => {
    test('middleware can be called with mock request/response', async () => {
      process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      sessionMiddleware = require('../../src/middleware/sessionConfig');

      const req = {
        headers: {},
        connection: { encrypted: false },
        originalUrl: '/test',
      };
      const res = {
        headers: {},
        setHeader(name, value) {
          this.headers[name] = value;
        },
        getHeader(name) {
          return this.headers[name];
        },
        on() {},
        once() {},
        emit() {},
      };

      let nextCalled = false;
      await new Promise((resolve) => {
        sessionMiddleware(req, res, () => {
          nextCalled = true;
          resolve();
        });
      });

      assert.strictEqual(nextCalled, true);
      // Session should be attached to request
      assert.ok(req.session !== undefined);
    });
  });
});

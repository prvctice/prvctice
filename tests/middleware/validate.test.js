/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach } = require('node:test');

const validate = require('../../src/middleware/validate');

let req, res, nextCalled;

beforeEach(() => {
  req = {
    body: { name: 'test', value: 42 },
  };

  res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };

  nextCalled = false;
});

describe('validate middleware', () => {
  describe('null/undefined schema handling', () => {
    test('calls next when schema is null', () => {
      const middleware = validate(null);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test('calls next when schema is undefined', () => {
      const middleware = validate(undefined);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test('calls next when schema is not an object', () => {
      const middleware = validate('not-a-schema');

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe('non-Zod schema handling', () => {
    test('calls next when schema has no safeParse method', () => {
      const schema = { someOtherMethod: () => {} };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test('calls next when safeParse is not a function', () => {
      const schema = { safeParse: 'not-a-function' };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe('successful validation', () => {
    test('calls next when validation succeeds', () => {
      const schema = {
        safeParse: (data) => ({ success: true, data }),
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(res.statusCode, 200);
    });

    test('replaces req.body with parsed data', () => {
      const parsedData = { name: 'parsed', extra: 'field' };
      const schema = {
        safeParse: () => ({ success: true, data: parsedData }),
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.deepStrictEqual(req.body, parsedData);
    });
  });

  describe('validation failure', () => {
    test('returns 400 when validation fails', () => {
      const schema = {
        safeParse: () => ({
          success: false,
          error: {
            issues: [{ message: 'Name is required', path: ['name'] }],
          },
        }),
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.jsonData.error, 'Invalid body');
    });

    test('includes validation issues in response', () => {
      const issues = [
        { message: 'Name is required', path: ['name'] },
        { message: 'Value must be positive', path: ['value'] },
      ];
      const schema = {
        safeParse: () => ({
          success: false,
          error: { issues },
        }),
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.deepStrictEqual(res.jsonData.details, issues);
    });

    test('handles missing error.issues gracefully', () => {
      const schema = {
        safeParse: () => ({
          success: false,
          error: {},
        }),
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.jsonData.details, undefined);
    });
  });

  describe('error handling', () => {
    test('returns 400 when safeParse throws an error', () => {
      const schema = {
        safeParse: () => {
          throw new Error('Unexpected parsing error');
        },
      };
      const middleware = validate(schema);

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.jsonData.error, 'Invalid request payload');
    });
  });
});

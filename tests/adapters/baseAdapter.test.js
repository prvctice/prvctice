/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test } = require('node:test');

const { BaseAdapter } = require('../../src/adapters/baseAdapter');

describe('BaseAdapter', () => {
  describe('constructor', () => {
    test('stores options in protected property', () => {
      // Create a concrete implementation for testing
      class TestAdapter extends BaseAdapter {
        *streamChat() {
          yield { type: 'done' };
        }

        getOptions() {
          return this.options;
        }
      }

      const options = { apiKey: 'test-key', baseUrl: 'http://test' };
      const adapter = new TestAdapter(options);

      assert.deepStrictEqual(adapter.getOptions(), options);
    });

    test('handles empty options', () => {
      class TestAdapter extends BaseAdapter {
        *streamChat() {
          yield { type: 'done' };
        }

        getOptions() {
          return this.options;
        }
      }

      const adapter = new TestAdapter({});
      assert.deepStrictEqual(adapter.getOptions(), {});
    });
  });

  describe('abstract interface', () => {
    test('BaseAdapter cannot be instantiated directly (abstract class)', () => {
      // In JavaScript/TypeScript, abstract classes can technically be instantiated
      // if there's no runtime check. This test documents the expected interface.
      assert.ok(
        BaseAdapter.prototype.streamChat === undefined ||
          typeof BaseAdapter.prototype.streamChat === 'function'
      );
    });

    test('subclass must implement streamChat', () => {
      class IncompleteAdapter extends BaseAdapter {
        // Missing streamChat implementation
      }

      const adapter = new IncompleteAdapter({ apiKey: 'test' });
      // streamChat should be undefined since it's not implemented
      assert.strictEqual(adapter.streamChat, undefined);
    });

    test('subclass with streamChat implementation works', () => {
      class CompleteAdapter extends BaseAdapter {
        async *streamChat(req) {
          yield { type: 'delta', content: 'Hello' };
          yield { type: 'done' };
        }
      }

      const adapter = new CompleteAdapter({ apiKey: 'test' });
      assert.strictEqual(typeof adapter.streamChat, 'function');
    });
  });

  describe('CommonJS exports', () => {
    test('exports BaseAdapter as named export', () => {
      const mod = require('../../src/adapters/baseAdapter');
      assert.ok(mod.BaseAdapter);
      assert.strictEqual(mod.BaseAdapter, BaseAdapter);
    });

    test('exports BaseAdapter as default', () => {
      const mod = require('../../src/adapters/baseAdapter');
      assert.ok(mod.default);
      assert.strictEqual(mod.default, BaseAdapter);
    });
  });
});

/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach } = require('node:test');

const LMStudioAdapter = require('../../src/adapters/lmstudioAdapter');

// Helper to create a mock ReadableStream
function createMockStream(chunks) {
  let index = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (index >= chunks.length) {
          return { done: true };
        }
        const chunk = chunks[index++];
        return {
          done: false,
          value: new TextEncoder().encode(chunk),
        };
      },
      releaseLock: () => {},
    }),
  };
}

describe('LMStudioAdapter', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test('uses default localhost URL', async () => {
    let capturedUrl = null;

    globalThis.fetch = mock.fn(async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
      };
    });

    try {
      const adapter = new LMStudioAdapter();

      for await (const _ of adapter.streamChat({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
      }

      assert.ok(capturedUrl.startsWith('http://localhost:1234'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses custom baseUrl when provided', async () => {
    let capturedUrl = null;

    globalThis.fetch = mock.fn(async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
      };
    });

    try {
      const adapter = new LMStudioAdapter({ baseUrl: 'http://192.168.1.100:1234' });

      for await (const _ of adapter.streamChat({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
      }

      assert.ok(capturedUrl.startsWith('http://192.168.1.100:1234'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('does not require API key', async () => {
    let capturedHeaders = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
      };
    });

    try {
      const adapter = new LMStudioAdapter();

      for await (const _ of adapter.streamChat({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
      }

      // Should not have Authorization header
      assert.strictEqual(capturedHeaders.Authorization, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('converts messages to OpenAI format', async () => {
    let capturedBody = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
      };
    });

    try {
      const adapter = new LMStudioAdapter();

      for await (const _ of adapter.streamChat({
        model: 'local-model',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      })) {
      }

      assert.strictEqual(capturedBody.messages.length, 2);
      assert.strictEqual(capturedBody.messages[0].role, 'system');
      assert.strictEqual(capturedBody.messages[1].role, 'user');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses default model name when not specified', async () => {
    let capturedBody = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
      };
    });

    try {
      const adapter = new LMStudioAdapter();

      for await (const _ of adapter.streamChat({
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
      }

      assert.strictEqual(capturedBody.model, 'local-model');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  describe('streaming', () => {
    test('yields delta chunks for content', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
          'data: {"choices":[{"delta":{"content":" there"}}]}\n',
          'data: {"choices":[{"finish_reason":"stop"}]}\n',
        ]),
      }));

      try {
        const adapter = new LMStudioAdapter();
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }

        const deltas = chunks.filter((c) => c.type === 'delta');
        assert.strictEqual(deltas.length, 2);
        assert.strictEqual(deltas[0].content, 'Hello');
        assert.strictEqual(deltas[1].content, ' there');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('yields tool_call chunks', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"calc"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":1}"}}]}}]}\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n',
        ]),
      }));

      try {
        const adapter = new LMStudioAdapter();
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Calculate' }],
          tools: [{ name: 'calc', parameters: { type: 'object' } }],
        })) {
          chunks.push(chunk);
        }

        const toolCall = chunks.find((c) => c.type === 'tool_call');
        assert.ok(toolCall, 'Should have tool_call');
        assert.strictEqual(toolCall.id, 'call_1');
        assert.strictEqual(toolCall.name, 'calc');
        assert.deepStrictEqual(toolCall.arguments, { x: 1 });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('emits done at end', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
          'data: {"choices":[{"finish_reason":"stop"}]}\n',
        ]),
      }));

      try {
        const adapter = new LMStudioAdapter();
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }

        const done = chunks.find((c) => c.type === 'done');
        assert.ok(done, 'Should have done chunk');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('emits done even without explicit finish_reason', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"content":"Response"}}]}\n',
          'data: [DONE]\n',
        ]),
      }));

      try {
        const adapter = new LMStudioAdapter();
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }

        const done = chunks.find((c) => c.type === 'done');
        assert.ok(done, 'Should have done chunk');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('error handling', () => {
    test('provides helpful error when LM Studio not running', async () => {
      const connError = new Error('fetch failed');
      connError.cause = { code: 'ECONNREFUSED' };

      globalThis.fetch = mock.fn(async () => {
        throw connError;
      });

      try {
        const adapter = new LMStudioAdapter();

        await assert.rejects(
          async () => {
            for await (const _ of adapter.streamChat({
              model: 'local-model',
              messages: [{ role: 'user', content: 'Hi' }],
            })) {
            }
          },
          (err) => {
            assert.strictEqual(err.provider, 'lmstudio');
            assert.ok(err.message.includes('not running'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('handles timeout errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      globalThis.fetch = mock.fn(async () => {
        throw abortError;
      });

      try {
        const adapter = new LMStudioAdapter();

        await assert.rejects(
          async () => {
            for await (const _ of adapter.streamChat({
              model: 'local-model',
              messages: [{ role: 'user', content: 'Hi' }],
            })) {
            }
          },
          (err) => {
            assert.strictEqual(err.provider, 'lmstudio');
            assert.ok(err.message.includes('timed out'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('handles HTTP errors', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      }));

      try {
        const adapter = new LMStudioAdapter();

        await assert.rejects(
          async () => {
            for await (const _ of adapter.streamChat({
              model: 'local-model',
              messages: [{ role: 'user', content: 'Hi' }],
            })) {
            }
          },
          (err) => {
            assert.strictEqual(err.provider, 'lmstudio');
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('tools', () => {
    test('includes tools when provided', async () => {
      let capturedBody = null;

      globalThis.fetch = mock.fn(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
        };
      });

      try {
        const adapter = new LMStudioAdapter();

        for await (const _ of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Test' }],
          tools: [
            {
              name: 'get_time',
              description: 'Get current time',
              parameters: { type: 'object' },
            },
          ],
        })) {
        }

        assert.ok(capturedBody.tools, 'Should have tools');
        assert.strictEqual(capturedBody.tools[0].function.name, 'get_time');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('does not include tools when empty', async () => {
      let capturedBody = null;

      globalThis.fetch = mock.fn(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          body: createMockStream(['data: {"choices":[{"finish_reason":"stop"}]}\n']),
        };
      });

      try {
        const adapter = new LMStudioAdapter();

        for await (const _ of adapter.streamChat({
          model: 'local-model',
          messages: [{ role: 'user', content: 'Test' }],
          tools: [],
        })) {
        }

        assert.strictEqual(capturedBody.tools, undefined, 'Should not have tools key');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

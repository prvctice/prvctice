/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach } = require('node:test');

const OpenRouterAdapter = require('../../src/adapters/openrouterAdapter');

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

describe('OpenRouterAdapter', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test('sends correct headers including site info', async () => {
    let capturedRequest = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedRequest = { url, options };
      return {
        ok: true,
        body: createMockStream(['data: [DONE]\n']),
      };
    });

    try {
      const adapter = new OpenRouterAdapter({
        apiKey: 'test-key',
        siteUrl: 'https://mysite.com',
        siteName: 'MyApp',
      });

      for await (const _ of adapter.streamChat({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
      }

      assert.ok(capturedRequest, 'Request should be captured');
      assert.strictEqual(capturedRequest.options.headers.Authorization, 'Bearer test-key');
      assert.strictEqual(capturedRequest.options.headers['HTTP-Referer'], 'https://mysite.com');
      assert.strictEqual(capturedRequest.options.headers['X-Title'], 'MyApp');
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
        body: createMockStream(['data: [DONE]\n']),
      };
    });

    try {
      const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

      for await (const _ of adapter.streamChat({
        model: 'openai/gpt-4',
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      })) {
      }

      assert.ok(capturedBody.messages, 'Should have messages');
      assert.strictEqual(capturedBody.messages.length, 3);
      assert.strictEqual(capturedBody.messages[0].role, 'system');
      assert.strictEqual(capturedBody.messages[1].role, 'user');
      assert.strictEqual(capturedBody.messages[2].role, 'assistant');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('converts tool results correctly', async () => {
    let capturedBody = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: createMockStream(['data: [DONE]\n']),
      };
    });

    try {
      const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

      for await (const _ of adapter.streamChat({
        model: 'openai/gpt-4',
        messages: [
          { role: 'user', content: 'Search' },
          {
            role: 'tool',
            tool_call_id: 'call_123',
            content: '{"result":"found"}',
          },
        ],
      })) {
      }

      const toolMsg = capturedBody.messages.find((m) => m.role === 'tool');
      assert.ok(toolMsg, 'Should have tool message');
      assert.strictEqual(toolMsg.tool_call_id, 'call_123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('converts tools to OpenAI function format', async () => {
    let capturedBody = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: createMockStream(['data: [DONE]\n']),
      };
    });

    try {
      const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

      for await (const _ of adapter.streamChat({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        ],
      })) {
      }

      assert.ok(capturedBody.tools, 'Should have tools');
      const tool = capturedBody.tools[0];
      assert.strictEqual(tool.type, 'function');
      assert.strictEqual(tool.function.name, 'get_weather');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('skips web_search_preview tool', async () => {
    let capturedBody = null;

    globalThis.fetch = mock.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: createMockStream(['data: [DONE]\n']),
      };
    });

    try {
      const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

      for await (const _ of adapter.streamChat({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ type: 'web_search_preview' }, { name: 'search', parameters: { type: 'object' } }],
      })) {
      }

      // Should only have the search tool, not web_search_preview
      assert.strictEqual(capturedBody.tools.length, 1);
      assert.strictEqual(capturedBody.tools[0].function.name, 'search');
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
          'data: {"choices":[{"delta":{"content":" world"}}]}\n',
          'data: {"choices":[{"finish_reason":"stop"}]}\n',
          'data: [DONE]\n',
        ]),
      }));

      try {
        const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'openai/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }

        const deltas = chunks.filter((c) => c.type === 'delta');
        assert.strictEqual(deltas.length, 2);
        assert.strictEqual(deltas[0].content, 'Hello');
        assert.strictEqual(deltas[1].content, ' world');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('yields tool_call chunks', async () => {
      // Note: The adapter tracks tool calls by ID, so we include the ID on every chunk
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"search"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"arguments":"{\\"q\\":"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"arguments":"\\"test\\"}"}}]}}]}\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n',
          'data: [DONE]\n',
        ]),
      }));

      try {
        const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'openai/gpt-4',
          messages: [{ role: 'user', content: 'Search' }],
          tools: [{ name: 'search', parameters: { type: 'object' } }],
        })) {
          chunks.push(chunk);
        }

        const toolCall = chunks.find((c) => c.type === 'tool_call');
        assert.ok(toolCall, 'Should have tool_call');
        assert.strictEqual(toolCall.id, 'call_abc');
        assert.strictEqual(toolCall.name, 'search');
        assert.deepStrictEqual(toolCall.arguments, { q: 'test' });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('emits done at end of stream', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        body: createMockStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
          'data: [DONE]\n',
        ]),
      }));

      try {
        const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
        const chunks = [];

        for await (const chunk of adapter.streamChat({
          model: 'openai/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }

        const lastChunk = chunks[chunks.length - 1];
        assert.strictEqual(lastChunk.type, 'done');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('error handling', () => {
    test('normalizes HTTP errors', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
      }));

      try {
        const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

        await assert.rejects(
          async () => {
            for await (const _ of adapter.streamChat({
              model: 'openai/gpt-4',
              messages: [{ role: 'user', content: 'Hi' }],
            })) {
            }
          },
          (err) => {
            assert.strictEqual(err.provider, 'openrouter');
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('handles network errors', async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error('Network error');
      });

      try {
        const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });

        await assert.rejects(
          async () => {
            for await (const _ of adapter.streamChat({
              model: 'openai/gpt-4',
              messages: [{ role: 'user', content: 'Hi' }],
            })) {
            }
          },
          (err) => {
            assert.strictEqual(err.provider, 'openrouter');
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

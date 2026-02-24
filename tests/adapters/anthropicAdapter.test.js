/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock } = require('node:test');

// Test the message conversion functions by importing the adapter
// and testing its internal behavior through the public interface

describe('AnthropicAdapter', () => {
  describe('convertImageBlock', () => {
    test('converts OpenAI image_url format to Anthropic format', async () => {
      // We test this indirectly through message conversion
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');

      // Create adapter with mock client
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      // Mock the client to capture the converted payload
      let capturedPayload = null;
      adapter.client = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            // Return a mock async iterator
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      // Call streamChat with an image message
      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
              },
            ],
          },
        ],
      });

      // Consume the iterator
      for await (const _ of iterator) {
        // Just consume
      }

      // Verify the image was converted to Anthropic format
      assert.ok(capturedPayload, 'Payload should be captured');
      const userMsg = capturedPayload.messages.find((m) => m.role === 'user');
      assert.ok(userMsg, 'Should have user message');
      assert.ok(Array.isArray(userMsg.content), 'Content should be array');

      const imageBlock = userMsg.content.find((b) => b.type === 'image');
      assert.ok(imageBlock, 'Should have image block');
      assert.strictEqual(imageBlock.source.type, 'base64');
      assert.strictEqual(imageBlock.source.media_type, 'image/png');
      assert.strictEqual(imageBlock.source.data, 'iVBORw0KGgo=');
    });

    test('passes through Anthropic format unchanged', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      let capturedPayload = null;
      adapter.client = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
              },
            ],
          },
        ],
      });

      for await (const _ of iterator) {
      }

      const userMsg = capturedPayload.messages.find((m) => m.role === 'user');
      const imageBlock = userMsg.content.find((b) => b.type === 'image');
      assert.strictEqual(imageBlock.source.data, 'abc123');
    });
  });

  describe('message conversion', () => {
    test('aggregates system messages into system prompt', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      let capturedPayload = null;
      adapter.client = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      for await (const _ of iterator) {
      }

      assert.ok(capturedPayload.system, 'Should have system prompt');
      assert.ok(capturedPayload.system.includes('You are helpful.'));
      assert.ok(capturedPayload.system.includes('Be concise.'));

      // System messages should not be in messages array
      const systemMsg = capturedPayload.messages.find((m) => m.role === 'system');
      assert.strictEqual(systemMsg, undefined, 'System messages should be extracted');
    });

    test('converts tool result messages to user messages with tool_result', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      let capturedPayload = null;
      adapter.client = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [
          { role: 'user', content: 'Search for cats' },
          { role: 'assistant', content: 'I will search for cats.' },
          {
            role: 'tool',
            tool_use_id: 'tool_123',
            content: JSON.stringify({ results: ['cat1', 'cat2'] }),
          },
        ],
      });

      for await (const _ of iterator) {
      }

      // The last message should be a user message with tool_result
      const lastMsg = capturedPayload.messages[capturedPayload.messages.length - 1];
      assert.strictEqual(lastMsg.role, 'user');
      assert.ok(Array.isArray(lastMsg.content));
      assert.strictEqual(lastMsg.content[0].type, 'tool_result');
      assert.strictEqual(lastMsg.content[0].tool_use_id, 'tool_123');
    });

    test('throws error when tool result missing tool_use_id', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      adapter.client = {
        messages: {
          create: async () => {
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'tool', content: 'result' }, // Missing tool_use_id
        ],
      });

      await assert.rejects(async () => {
        for await (const _ of iterator) {
        }
      }, /tool_use_id/i);
    });
  });

  describe('streaming', () => {
    test('yields delta chunks for text content', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      adapter.client = {
        messages: {
          create: async () => {
            return (async function* () {
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.length, 3);
      assert.deepStrictEqual(chunks[0], { type: 'delta', content: 'Hello' });
      assert.deepStrictEqual(chunks[1], { type: 'delta', content: ' world' });
      assert.deepStrictEqual(chunks[2], { type: 'done' });
    });

    test('yields tool_call chunks for tool use', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      adapter.client = {
        messages: {
          create: async () => {
            return (async function* () {
              yield {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'tool_abc', name: 'search' },
              };
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'input_json_delta', partial_json: '{"query":' },
              };
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'input_json_delta', partial_json: '"cats"}' },
              };
              yield { type: 'content_block_stop', index: 0 };
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Search for cats' }],
        tools: [{ name: 'search', description: 'Search the web', parameters: { type: 'object' } }],
      })) {
        chunks.push(chunk);
      }

      const toolCall = chunks.find((c) => c.type === 'tool_call');
      assert.ok(toolCall, 'Should have tool_call chunk');
      assert.strictEqual(toolCall.id, 'tool_abc');
      assert.strictEqual(toolCall.name, 'search');
      assert.deepStrictEqual(toolCall.arguments, { query: 'cats' });

      const done = chunks.find((c) => c.type === 'done');
      assert.ok(done, 'Should have done chunk');
    });

    test('handles incomplete JSON in tool arguments gracefully', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      adapter.client = {
        messages: {
          create: async () => {
            return (async function* () {
              yield {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'tool_xyz', name: 'calc' },
              };
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'input_json_delta', partial_json: '{"incomplete":' },
              };
              // Stream ends without completing JSON
              yield { type: 'content_block_stop', index: 0 };
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk);
      }

      const toolCall = chunks.find((c) => c.type === 'tool_call');
      assert.ok(toolCall);
      // Should fall back to empty object for invalid JSON
      assert.deepStrictEqual(toolCall.arguments, {});
    });
  });

  describe('tools conversion', () => {
    test('converts tools to Anthropic format', async () => {
      const AnthropicAdapter = require('../../src/adapters/anthropicAdapter');
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      let capturedPayload = null;
      adapter.client = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return (async function* () {
              yield { type: 'message_stop' };
            })();
          },
        },
      };

      const iterator = adapter.streamChat({
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        ],
      });

      for await (const _ of iterator) {
      }

      assert.ok(capturedPayload.tools, 'Should have tools');
      // tools includes the user-provided tool + auto-injected web_search tool
      assert.strictEqual(capturedPayload.tools.length, 2);
      assert.strictEqual(capturedPayload.tools[0].name, 'get_weather');
      assert.ok(capturedPayload.tools[0].input_schema, 'Should have input_schema');
      // Verify web search tool was auto-injected
      assert.strictEqual(capturedPayload.tools[1].type, 'web_search_20250305');
      assert.strictEqual(capturedPayload.tools[1].name, 'web_search');
    });
  });
});

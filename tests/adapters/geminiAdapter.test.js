/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe } = require('node:test');

const GeminiAdapter = require('../../src/adapters/geminiAdapter');

describe('GeminiAdapter', () => {
  describe('streaming', () => {
    test('yields delta chunks for text content', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      // Replace the client with a mock
      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: (async function* () {
              yield { text: () => 'Hello' };
              yield { text: () => ' world' };
            })(),
            response: Promise.resolve({ candidates: [] }),
          }),
        }),
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      const deltas = chunks.filter((c) => c.type === 'delta');
      assert.strictEqual(deltas.length, 2);
      assert.strictEqual(deltas[0].content, 'Hello');
      assert.strictEqual(deltas[1].content, ' world');

      const done = chunks.find((c) => c.type === 'done');
      assert.ok(done, 'Should have done chunk');
    });

    test('yields tool_call for function calls in response', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: (async function* () {
              yield { text: () => '' };
            })(),
            response: Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'get_weather',
                          args: { location: 'NYC' },
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          }),
        }),
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Weather in NYC' }],
        tools: [{ name: 'get_weather', parameters: { type: 'object' } }],
      })) {
        chunks.push(chunk);
      }

      const toolCall = chunks.find((c) => c.type === 'tool_call');
      assert.ok(toolCall, 'Should have tool_call');
      assert.strictEqual(toolCall.name, 'get_weather');
      assert.deepStrictEqual(toolCall.arguments, { location: 'NYC' });
    });

    test('generates unique tool call IDs when not provided', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: (async function* () {})(),
            response: Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      { functionCall: { name: 'tool1', args: {} } },
                      { functionCall: { name: 'tool2', args: {} } },
                    ],
                  },
                },
              ],
            }),
          }),
        }),
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk);
      }

      const toolCalls = chunks.filter((c) => c.type === 'tool_call');
      assert.strictEqual(toolCalls.length, 2);
      assert.notStrictEqual(toolCalls[0].id, toolCalls[1].id, 'IDs should be unique');
    });

    test('yields image data for inline images', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: (async function* () {})(),
            response: Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'image/png',
                          data: 'base64imagedata',
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          }),
        }),
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'gemini-pro-vision',
        messages: [{ role: 'user', content: 'Generate an image' }],
      })) {
        chunks.push(chunk);
      }

      const image = chunks.find((c) => c.type === 'image');
      assert.ok(image, 'Should have image chunk');
      assert.strictEqual(image.mimeType, 'image/png');
      assert.strictEqual(image.data, 'base64imagedata');
    });

    test('handles text extraction errors gracefully', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: (async function* () {
              yield {
                text: () => {
                  throw new Error('Text extraction failed');
                },
              };
              yield { text: () => 'recovered' };
            })(),
            response: Promise.resolve({ candidates: [] }),
          }),
        }),
      };

      const chunks = [];
      for await (const chunk of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk);
      }

      // Should continue despite error in first chunk
      const deltas = chunks.filter((c) => c.type === 'delta');
      assert.strictEqual(deltas.length, 1);
      assert.strictEqual(deltas[0].content, 'recovered');
    });
  });

  describe('tools conversion', () => {
    test('converts tools to Gemini function declarations', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      let capturedConfig = null;
      adapter.client = {
        getGenerativeModel: (config) => {
          capturedConfig = config;
          return {
            generateContentStream: async () => ({
              stream: (async function* () {})(),
              response: Promise.resolve({ candidates: [] }),
            }),
          };
        },
      };

      for await (const _ of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        ],
      })) {
      }

      assert.ok(capturedConfig.tools, 'Should have tools');
      assert.ok(capturedConfig.tools[0].functionDeclarations, 'Should have functionDeclarations');
      const fn = capturedConfig.tools[0].functionDeclarations[0];
      assert.strictEqual(fn.name, 'search');
      assert.strictEqual(fn.description, 'Search the web');
    });

    test('passes system instruction when provided', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      let capturedConfig = null;
      adapter.client = {
        getGenerativeModel: (config) => {
          capturedConfig = config;
          return {
            generateContentStream: async () => ({
              stream: (async function* () {})(),
              response: Promise.resolve({ candidates: [] }),
            }),
          };
        },
      };

      for await (const _ of adapter.streamChat({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompt: 'You are a helpful assistant',
      })) {
      }

      assert.ok(capturedConfig.systemInstruction, 'Should have systemInstruction');
      assert.strictEqual(
        capturedConfig.systemInstruction.parts[0].text,
        'You are a helpful assistant'
      );
    });
  });

  describe('error handling', () => {
    test('normalizes SDK errors', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      adapter.client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => {
            const error = new Error('API rate limit exceeded');
            error.status = 429;
            throw error;
          },
        }),
      };

      await assert.rejects(
        async () => {
          for await (const _ of adapter.streamChat({
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'Test' }],
          })) {
          }
        },
        (err) => {
          assert.strictEqual(err.provider, 'gemini');
          return true;
        }
      );
    });
  });
});

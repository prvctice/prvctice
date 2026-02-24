/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test } = require('node:test');

const { createAdapter } = require('../../src/services/llmProviderFactory');

describe('llmProviderFactory', () => {
  describe('createAdapter', () => {
    describe('LM Studio (no API key required)', () => {
      test('creates LMStudioAdapter without API key', () => {
        const adapter = createAdapter('lmstudio');
        assert.ok(adapter);
        assert.strictEqual(adapter.constructor.name, 'LMStudioAdapter');
      });

      test('creates LMStudioAdapter with custom baseUrl', () => {
        const adapter = createAdapter('lmstudio', undefined, { baseUrl: 'http://custom:1234' });
        assert.ok(adapter);
      });

      test('handles case-insensitive provider name', () => {
        const adapter = createAdapter('LMSTUDIO');
        assert.ok(adapter);
      });
    });

    describe('Anthropic', () => {
      test('creates AnthropicAdapter with API key', () => {
        const adapter = createAdapter('anthropic', 'sk-ant-test');
        assert.ok(adapter);
        assert.strictEqual(adapter.constructor.name, 'AnthropicAdapter');
      });

      test('throws error when API key is missing', () => {
        assert.throws(() => createAdapter('anthropic'), /API key required for provider: anthropic/);
      });
    });

    describe('Gemini', () => {
      test('creates GeminiAdapter with provider name "gemini"', () => {
        const adapter = createAdapter('gemini', 'test-api-key');
        assert.ok(adapter);
        assert.strictEqual(adapter.constructor.name, 'GeminiAdapter');
      });

      test('creates GeminiAdapter with provider name "google"', () => {
        const adapter = createAdapter('google', 'test-api-key');
        assert.ok(adapter);
        assert.strictEqual(adapter.constructor.name, 'GeminiAdapter');
      });

      test('throws error when API key is missing', () => {
        assert.throws(() => createAdapter('gemini'), /API key required for provider: gemini/);
      });
    });

    describe('OpenRouter', () => {
      test('creates OpenRouterAdapter with API key', () => {
        const adapter = createAdapter('openrouter', 'sk-or-test');
        assert.ok(adapter);
        assert.strictEqual(adapter.constructor.name, 'OpenRouterAdapter');
      });

      test('throws error when API key is missing', () => {
        assert.throws(
          () => createAdapter('openrouter'),
          /API key required for provider: openrouter/
        );
      });
    });

    describe('unsupported providers', () => {
      test('throws error for unknown provider', () => {
        assert.throws(
          () => createAdapter('unknownprovider', 'some-key'),
          /Unsupported provider: unknownprovider/
        );
      });

      test('throws error for empty provider', () => {
        assert.throws(() => createAdapter('', 'some-key'), /Unsupported provider/);
      });

      test('throws error for null provider', () => {
        assert.throws(() => createAdapter(null, 'some-key'), /Unsupported provider/);
      });

      test('throws error for openai provider (disconnected)', () => {
        assert.throws(() => createAdapter('openai', 'sk-test-key'), /Unsupported provider: openai/);
      });
    });

    describe('case insensitivity', () => {
      test('handles mixed case provider names', () => {
        const adapter = createAdapter('AnThrOpIC', 'sk-test');
        assert.strictEqual(adapter.constructor.name, 'AnthropicAdapter');
      });
    });
  });
});

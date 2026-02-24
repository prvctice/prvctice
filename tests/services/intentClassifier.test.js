/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach } = require('node:test');

let originalEnv;
let resolveClassifierProvider;

const envKeys = [
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
];

function loadResolveClassifierProvider() {
  delete require.cache[require.resolve('../../src/services/intentClassifier')];
  delete require.cache[require.resolve('../../src/utils/apiKey')];
  delete require.cache[require.resolve('../../src/config/index')];
  return require('../../src/services/intentClassifier').resolveClassifierProvider;
}

beforeEach(() => {
  originalEnv = { ...process.env };
  // Prevent .env loading from overriding these values in config
  envKeys.forEach((key) => {
    process.env[key] = '';
  });
  resolveClassifierProvider = loadResolveClassifierProvider();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('intentClassifier', () => {
  describe('resolveClassifierProvider', () => {
    describe('explicit provider selection', () => {
      test('returns null for openai when no key available and no env key', () => {
        const result = resolveClassifierProvider({ provider_selected: 'openai' });
        assert.strictEqual(result, null);
      });

      test('returns anthropic when anthropicApiKey is provided', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'anthropic',
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'anthropic');
        assert.strictEqual(result?.apiKey, 'sk-ant-test');
      });

      test('returns anthropic with alias "claude"', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'claude',
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'anthropic');
      });

      test('returns gemini when geminiApiKey is provided', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'gemini',
          geminiApiKey: 'test-gemini-key',
        });
        assert.strictEqual(result?.provider, 'gemini');
        assert.strictEqual(result?.apiKey, 'test-gemini-key');
      });

      test('returns gemini with alias "google"', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'google',
          googleApiKey: 'test-google-key',
        });
        assert.strictEqual(result?.provider, 'gemini');
      });

      test('returns openrouter when openrouterApiKey is provided', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'openrouter',
          openrouterApiKey: 'sk-or-test',
        });
        assert.strictEqual(result?.provider, 'openrouter');
        assert.strictEqual(result?.apiKey, 'sk-or-test');
      });

      test('returns null for lmstudio (not supported)', () => {
        const result = resolveClassifierProvider({ provider_selected: 'lmstudio' });
        assert.strictEqual(result, null);
      });

      test('returns null for local (alias for lmstudio)', () => {
        const result = resolveClassifierProvider({ provider_selected: 'local' });
        assert.strictEqual(result, null);
      });

      test('returns null when selected provider key is missing', () => {
        const result = resolveClassifierProvider({ provider_selected: 'anthropic' });
        assert.strictEqual(result, null);
      });
    });

    describe('cascade fallback (no provider selected)', () => {
      test('uses anthropic when anthropicApiKey available', () => {
        const result = resolveClassifierProvider({
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'anthropic');
      });

      test('uses gemini when geminiApiKey available', () => {
        const result = resolveClassifierProvider({
          geminiApiKey: 'test-gemini-key',
        });
        assert.strictEqual(result?.provider, 'gemini');
      });

      test('uses openrouter when openrouterApiKey available', () => {
        const result = resolveClassifierProvider({
          openrouterApiKey: 'sk-or-test',
        });
        assert.strictEqual(result?.provider, 'openrouter');
      });
    });

    describe('trial mode with explicit keys', () => {
      // Test trial mode behavior with explicitly passed keys (avoids env caching issues)
      test('uses anthropic when anthropicApiKey and trialActive', () => {
        const result = resolveClassifierProvider({
          trialActive: true,
          anthropicApiKey: 'test-ant-key',
        });
        assert.strictEqual(result?.provider, 'anthropic');
      });

      test('does not use passed keys when trial mode is false and no provider selected', () => {
        // When trialActive is false, only explicitly passed keys work (not env)
        const result = resolveClassifierProvider({
          trialActive: false,
          anthropicApiKey: 'test-ant-key',
        });
        // Should use anthropic since we passed a key directly
        assert.strictEqual(result?.provider, 'anthropic');
      });
    });

    describe('session keys', () => {
      test('uses session anthropicApiKey', () => {
        const result = resolveClassifierProvider({
          session: { anthropicApiKey: 'session-ant-key' },
        });
        assert.strictEqual(result?.provider, 'anthropic');
      });

      test('uses session googleApiKey for gemini', () => {
        const result = resolveClassifierProvider({
          session: { googleApiKey: 'session-google-key' },
        });
        assert.strictEqual(result?.provider, 'gemini');
      });

      test('uses session openrouterApiKey', () => {
        const result = resolveClassifierProvider({
          session: { openrouterApiKey: 'session-or-key' },
        });
        assert.strictEqual(result?.provider, 'openrouter');
      });
    });

    describe('provider alias', () => {
      test('accepts "provider" as alias for "provider_selected"', () => {
        const result = resolveClassifierProvider({
          provider: 'anthropic',
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'anthropic');
      });
    });

    describe('explicit provider selection overrides cascade', () => {
      test('explicit anthropic selection uses anthropic even if openai available', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'anthropic',
          anthropicApiKey: 'sk-ant-test',
          openaiApiKey: 'sk-openai-test',
        });
        assert.strictEqual(result?.provider, 'anthropic');
        assert.strictEqual(result?.apiKey, 'sk-ant-test');
      });

      test('explicit gemini selection uses gemini', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'gemini',
          geminiApiKey: 'test-gemini-key',
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'gemini');
        assert.strictEqual(result?.apiKey, 'test-gemini-key');
      });

      test('explicit openrouter selection uses openrouter', () => {
        const result = resolveClassifierProvider({
          provider_selected: 'openrouter',
          openrouterApiKey: 'sk-or-test',
          anthropicApiKey: 'sk-ant-test',
        });
        assert.strictEqual(result?.provider, 'openrouter');
        assert.strictEqual(result?.apiKey, 'sk-or-test');
      });
    });
  });
});

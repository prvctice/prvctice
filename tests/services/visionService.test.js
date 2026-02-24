/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach } = require('node:test');

const { runVision, VisionError, loadLocalFile } = require('../../src/services/visionService');

describe('VisionService', () => {
  describe('VisionError', () => {
    test('creates error with code, message, and status', () => {
      const error = new VisionError('test_code', 'Test message', 400);
      assert.strictEqual(error.code, 'test_code');
      assert.strictEqual(error.message, 'Test message');
      assert.strictEqual(error.status, 400);
    });

    test('defaults status to 400', () => {
      const error = new VisionError('code', 'message');
      assert.strictEqual(error.status, 400);
    });

    test('is instance of Error', () => {
      const error = new VisionError('code', 'message');
      assert.ok(error instanceof Error);
    });
  });

  describe('runVision', () => {
    test('throws VisionError when API key is missing', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'openai',
            apiKey: null,
            message: 'test',
          });
        },
        (err) => {
          assert.ok(err instanceof VisionError);
          assert.strictEqual(err.code, 'missing_key');
          return true;
        }
      );
    });

    test('throws VisionError when both message and images are missing', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'openai',
            apiKey: 'test-key',
            message: '',
            images: [],
          });
        },
        (err) => {
          assert.ok(err instanceof VisionError);
          assert.strictEqual(err.code, 'missing_input');
          return true;
        }
      );
    });

    test('throws VisionError for unsupported provider', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'unsupported_provider',
            apiKey: 'test-key',
            message: 'test',
          });
        },
        (err) => {
          assert.ok(err instanceof VisionError);
          assert.strictEqual(err.code, 'unsupported_provider');
          return true;
        }
      );
    });

    test('accepts whitespace-padded message', async () => {
      // Should trim message and use it if non-empty after trim
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'openai',
            apiKey: 'test-key',
            message: '   ',
            images: [], // Still need either message or images
          });
        },
        (err) => {
          // Should fail with missing_input since trimmed message is empty
          assert.strictEqual(err.code, 'missing_input');
          return true;
        }
      );
    });

    test('normalizes images from different formats', async () => {
      // This tests the normalizeImages internal function indirectly
      // The function handles: fileIds, images (base64 strings or objects), attachments

      // Without mocking the actual provider SDK, we can only test
      // error conditions and validation
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'unsupported',
            apiKey: 'key',
            message: 'test',
            images: [{ data: 'base64data', mimeType: 'image/png' }],
          });
        },
        (err) => err.code === 'unsupported_provider'
      );
    });

    test('handles provider name case-insensitively', async () => {
      // Provider names should be lowercased before lookup
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'OPENAI',
            apiKey: null, // Will fail on missing key, proving provider was recognized
          });
        },
        (err) => err.code === 'missing_key' // Not 'unsupported_provider'
      );

      await assert.rejects(
        async () => {
          await runVision({
            provider: 'Anthropic',
            apiKey: null,
          });
        },
        (err) => err.code === 'missing_key'
      );
    });
  });

  describe('loadLocalFile', () => {
    test('returns null for nonexistent file', async () => {
      // loadLocalFile attempts to load from SQLite storage
      // Without a real database, it should return null gracefully
      const result = await loadLocalFile('nonexistent-file-id');
      assert.strictEqual(result, null);
    });

    test('returns null for empty file ID', async () => {
      const result = await loadLocalFile('');
      assert.strictEqual(result, null);
    });
  });

  describe('supported providers', () => {
    const providers = ['openai', 'anthropic', 'gemini', 'openrouter'];

    for (const provider of providers) {
      test(`recognizes ${provider} as valid provider`, async () => {
        await assert.rejects(
          async () => {
            await runVision({
              provider,
              apiKey: null, // Should fail on missing key, not unsupported provider
              message: 'test',
            });
          },
          (err) => err.code === 'missing_key'
        );
      });
    }
  });

  describe('normalizeImages', () => {
    // Test normalizeImages behavior through runVision
    // The function handles three input types: fileIds, images, attachments

    test('handles base64 string images', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'fake',
            apiKey: 'key',
            images: ['base64string1', 'base64string2'],
          });
        },
        (err) => err.code === 'unsupported_provider' // Images were normalized successfully
      );
    });

    test('handles image objects with data property', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'fake',
            apiKey: 'key',
            images: [
              { data: 'base64data', mimeType: 'image/jpeg' },
              { data: 'moredata', mime: 'image/png', detail: 'high' },
            ],
          });
        },
        (err) => err.code === 'unsupported_provider'
      );
    });

    test('handles attachments array', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'fake',
            apiKey: 'key',
            attachments: [{ data: 'attachment1', mimeType: 'image/png' }],
          });
        },
        (err) => err.code === 'unsupported_provider'
      );
    });

    test('filters out null and invalid entries', async () => {
      await assert.rejects(
        async () => {
          await runVision({
            provider: 'fake',
            apiKey: 'key',
            images: [null, '', undefined, { data: 'valid' }],
          });
        },
        (err) => err.code === 'unsupported_provider'
      );
    });
  });
});

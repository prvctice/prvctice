/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('TumblrService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/tumblrService')];

    // Mock axios
    mockAxiosGet = mock.fn();
    originalAxios = require('axios');
    require('axios').get = mockAxiosGet;
  });

  afterEach(() => {
    // Restore axios
    if (originalAxios) {
      require('axios').get = originalAxios.get;
    }
  });

  describe('searchTumblrImages', () => {
    test('returns images from photo posts with legacy photo-url-1280', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            {
              type: 'photo',
              'photo-url-1280': 'https://tumblr.com/photo1.jpg',
              'photo-caption': 'A beautiful photo',
            },
          ],
        },
      }));

      const results = await searchTumblrImages('nature', 8);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://tumblr.com/photo1.jpg');
      assert.strictEqual(results[0].caption, 'A beautiful photo');
    });

    test('returns images from photo posts with photos array', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            {
              type: 'photo',
              photos: [
                {
                  alt_sizes: [{ url: 'https://tumblr.com/photo-large.jpg' }],
                },
              ],
            },
          ],
        },
      }));

      const results = await searchTumblrImages('art', 8);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://tumblr.com/photo-large.jpg');
    });

    test('extracts images from text posts with img tags', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            {
              type: 'text',
              body: '<p>Check out this image:</p><img src="https://tumblr.com/embedded.jpg" alt="Image">',
            },
          ],
        },
      }));

      const results = await searchTumblrImages('photography', 8);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://tumblr.com/embedded.jpg');
    });

    test('filters out posts without extractable images', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            { type: 'photo', 'photo-url-1280': 'https://valid.jpg' },
            { type: 'text', body: 'No images here' },
            { type: 'video' },
            { type: 'photo', 'photo-url-1280': 'https://also-valid.jpg' },
          ],
        },
      }));

      const results = await searchTumblrImages('test', 8);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].url, 'https://valid.jpg');
      assert.strictEqual(results[1].url, 'https://also-valid.jpg');
    });

    test('respects limit parameter', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            { type: 'photo', 'photo-url-1280': 'https://1.jpg' },
            { type: 'photo', 'photo-url-1280': 'https://2.jpg' },
            { type: 'photo', 'photo-url-1280': 'https://3.jpg' },
            { type: 'photo', 'photo-url-1280': 'https://4.jpg' },
          ],
        },
      }));

      const results = await searchTumblrImages('test', 2);

      assert.strictEqual(results.length, 2);
    });

    test('throws error when API returns non-200 status', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 401, msg: 'Unauthorized' },
          response: [],
        },
      }));

      await assert.rejects(
        async () => {
          await searchTumblrImages('test', 8);
        },
        (err) => {
          assert.ok(err.message.includes('Tumblr API error'));
          return true;
        }
      );
    });

    test('lowercases query for tag normalization', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');
      let capturedUrl;

      mockAxiosGet.mock.mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          data: {
            meta: { status: 200 },
            response: [],
          },
        };
      });

      await searchTumblrImages('MyTag', 8);

      assert.ok(capturedUrl.includes('tag=mytag'));
    });

    test('encodes special characters in query', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');
      let capturedUrl;

      mockAxiosGet.mock.mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          data: {
            meta: { status: 200 },
            response: [],
          },
        };
      });

      await searchTumblrImages('art & design', 8);

      // Should be URL-encoded
      assert.ok(capturedUrl.includes('tag=art%20%26%20design'));
    });

    test('handles empty photo-caption', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          meta: { status: 200 },
          response: [
            {
              type: 'photo',
              'photo-url-1280': 'https://tumblr.com/photo.jpg',
              // No photo-caption
            },
          ],
        },
      }));

      const results = await searchTumblrImages('test', 8);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].caption, '');
    });

    test('handles network errors', async () => {
      const { searchTumblrImages } = require('../../src/services/tumblrService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      await assert.rejects(
        async () => {
          await searchTumblrImages('test', 8);
        },
        (err) => {
          assert.ok(err.message.includes('Network error'));
          return true;
        }
      );
    });
  });
});

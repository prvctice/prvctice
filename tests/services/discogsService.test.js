/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('DiscogsService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/discogsService')];

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

  describe('resolveApiKey', () => {
    test('returns key from context.apiKeys.discogs', () => {
      const { resolveApiKey } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'api-key-1' } };
      assert.strictEqual(resolveApiKey(context), 'api-key-1');
    });

    test('returns key from context.session.discogsToken', () => {
      const { resolveApiKey } = require('../../src/services/discogsService');
      const context = { session: { discogsToken: 'session-token' } };
      assert.strictEqual(resolveApiKey(context), 'session-token');
    });

    test('returns key from context.getApiKey function', () => {
      const { resolveApiKey } = require('../../src/services/discogsService');
      const context = { getApiKey: (name) => (name === 'discogs' ? 'func-key' : null) };
      assert.strictEqual(resolveApiKey(context), 'func-key');
    });

    test('returns null when no key available', () => {
      const { resolveApiKey } = require('../../src/services/discogsService');
      assert.strictEqual(resolveApiKey({}), null);
      assert.strictEqual(resolveApiKey(), null);
    });

    test('prefers apiKeys.discogs over other sources', () => {
      const { resolveApiKey } = require('../../src/services/discogsService');
      const context = {
        apiKeys: { discogs: 'preferred' },
        session: { discogsToken: 'session' },
        getApiKey: () => 'func',
      };
      assert.strictEqual(resolveApiKey(context), 'preferred');
    });
  });

  describe('isAvailable', () => {
    test('returns true when API key is configured', () => {
      const { isAvailable } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'some-key' } };
      assert.strictEqual(isAvailable(context), true);
    });

    test('returns false when no API key', () => {
      const { isAvailable } = require('../../src/services/discogsService');
      assert.strictEqual(isAvailable({}), false);
      assert.strictEqual(isAvailable(), false);
    });
  });

  describe('searchDiscogs', () => {
    test('returns empty array when no API key', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const results = await searchDiscogs('test query', 8, {});
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for empty query', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };
      const results = await searchDiscogs('', 8, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };
      const results = await searchDiscogs(null, 8, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };
      const results = await searchDiscogs('   ', 8, context);
      assert.deepStrictEqual(results, []);
    });

    test('parses artist and title from release title', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Artist Name - Album Title',
              year: 2020,
              cover_image: 'https://img.discogs.com/cover.jpg',
              thumb: 'https://img.discogs.com/thumb.jpg',
              uri: '/releases/123',
              format: ['Vinyl', 'LP'],
              label: ['Record Label'],
            },
          ],
        },
      }));

      const results = await searchDiscogs('test', 1, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].artist, 'Artist Name');
      assert.strictEqual(results[0].title, 'Album Title');
      assert.strictEqual(results[0].date, '2020');
      assert.strictEqual(results[0].format, 'Vinyl, LP');
      assert.strictEqual(results[0].label, 'Record Label');
    });

    test('handles title without artist separator', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Single Title Without Artist',
              cover_image: 'https://img.discogs.com/cover.jpg',
            },
          ],
        },
      }));

      const results = await searchDiscogs('test', 1, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].title, 'Single Title Without Artist');
    });

    test('filters out releases with spacer.gif as cover image', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            { title: 'Artist - Valid', cover_image: 'https://img.discogs.com/cover.jpg' },
            { title: 'Artist - Invalid', cover_image: 'https://img.discogs.com/spacer.gif' },
            { title: 'Artist - Also Valid', cover_image: 'https://img.discogs.com/cover2.jpg' },
          ],
        },
      }));

      const results = await searchDiscogs('test', 8, context);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'Valid');
      assert.strictEqual(results[1].title, 'Also Valid');
    });

    test('respects limit parameter', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            { title: 'A - 1', cover_image: 'https://1.jpg' },
            { title: 'A - 2', cover_image: 'https://2.jpg' },
            { title: 'A - 3', cover_image: 'https://3.jpg' },
            { title: 'A - 4', cover_image: 'https://4.jpg' },
          ],
        },
      }));

      const results = await searchDiscogs('test', 2, context);

      assert.strictEqual(results.length, 2);
    });

    test('handles API errors gracefully', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const results = await searchDiscogs('test', 8, context);

      assert.deepStrictEqual(results, []);
    });

    test('handles 401 unauthorized errors', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'invalid-key' } };

      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      mockAxiosGet.mock.mockImplementation(async () => {
        throw error;
      });

      const results = await searchDiscogs('test', 8, context);

      assert.deepStrictEqual(results, []);
    });

    test('constructs correct sourceUrl', async () => {
      const { searchDiscogs } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Artist - Album',
              cover_image: 'https://img.jpg',
              uri: '/releases/12345',
            },
          ],
        },
      }));

      const results = await searchDiscogs('test', 1, context);

      assert.strictEqual(results[0].sourceUrl, 'https://www.discogs.com/releases/12345');
      assert.strictEqual(results[0].source, 'Discogs');
    });
  });

  describe('getAlbumArt', () => {
    test('returns first result from search', async () => {
      const { getAlbumArt } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Pink Floyd - Dark Side of the Moon',
              cover_image: 'https://img.jpg',
              year: 1973,
            },
          ],
        },
      }));

      const result = await getAlbumArt('Pink Floyd', 'Dark Side of the Moon', context);

      assert.ok(result);
      assert.strictEqual(result.title, 'Dark Side of the Moon');
    });

    test('returns null when no results found', async () => {
      const { getAlbumArt } = require('../../src/services/discogsService');
      const context = { apiKeys: { discogs: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: { results: [] },
      }));

      const result = await getAlbumArt('Unknown Artist', 'Unknown Album', context);

      assert.strictEqual(result, null);
    });

    test('returns null when no API key', async () => {
      const { getAlbumArt } = require('../../src/services/discogsService');

      const result = await getAlbumArt('Artist', 'Album', {});

      assert.strictEqual(result, null);
    });
  });
});

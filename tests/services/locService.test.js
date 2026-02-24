/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('LocService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/locService')];

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

  describe('searchLoC', () => {
    test('returns empty array for empty query', async () => {
      const { searchLoC } = require('../../src/services/locService');
      const results = await searchLoC('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const { searchLoC } = require('../../src/services/locService');
      const results = await searchLoC(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const { searchLoC } = require('../../src/services/locService');
      const results = await searchLoC('   ');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for non-string query', async () => {
      const { searchLoC } = require('../../src/services/locService');
      const results = await searchLoC(123);
      assert.deepStrictEqual(results, []);
    });

    test('returns results with correct shape', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              id: 'http://www.loc.gov/item/12345/',
              title: 'Sunset in California',
              image_url: ['https://tile.loc.gov/storage-services/12345-150px.jpg'],
              date: '1864',
              contributor: ['Albert Bierstadt'],
              url: 'https://www.loc.gov/item/12345/',
            },
          ],
        },
      }));

      const results = await searchLoC('sunset', 4);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://tile.loc.gov/storage-services/12345-150px.jpg');
      assert.strictEqual(results[0].title, 'Sunset in California');
      assert.strictEqual(results[0].artist, 'Albert Bierstadt');
      assert.strictEqual(results[0].date, '1864');
      assert.strictEqual(results[0].source, 'Library of Congress');
      assert.strictEqual(results[0].sourceUrl, 'https://www.loc.gov/item/12345/');
    });

    test('handles image_url as array correctly (uses first element)', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Multi-res Image',
              image_url: [
                'https://tile.loc.gov/150px.jpg',
                'https://tile.loc.gov/600px.jpg',
                'https://tile.loc.gov/full.jpg',
              ],
              url: 'https://www.loc.gov/item/1/',
            },
          ],
        },
      }));

      const results = await searchLoC('test', 4);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://tile.loc.gov/150px.jpg');
    });

    test('skips items without image_url', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            { title: 'No Image', url: 'https://www.loc.gov/item/1/' },
            {
              title: 'Has Image',
              image_url: ['https://tile.loc.gov/img.jpg'],
              url: 'https://www.loc.gov/item/2/',
            },
            { title: 'Empty Array', image_url: [], url: 'https://www.loc.gov/item/3/' },
          ],
        },
      }));

      const results = await searchLoC('test', 8);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Has Image');
    });

    test('handles contributor as array (uses first element)', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Test',
              image_url: ['https://tile.loc.gov/img.jpg'],
              contributor: ['First Artist', 'Second Artist'],
              url: 'https://www.loc.gov/item/1/',
            },
          ],
        },
      }));

      const results = await searchLoC('test', 4);

      assert.strictEqual(results[0].artist, 'First Artist');
    });

    test('respects limit parameter', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'Item 1',
              image_url: ['https://tile.loc.gov/1.jpg'],
              url: 'https://www.loc.gov/item/1/',
            },
            {
              title: 'Item 2',
              image_url: ['https://tile.loc.gov/2.jpg'],
              url: 'https://www.loc.gov/item/2/',
            },
            {
              title: 'Item 3',
              image_url: ['https://tile.loc.gov/3.jpg'],
              url: 'https://www.loc.gov/item/3/',
            },
            {
              title: 'Item 4',
              image_url: ['https://tile.loc.gov/4.jpg'],
              url: 'https://www.loc.gov/item/4/',
            },
          ],
        },
      }));

      const results = await searchLoC('test', 2);

      assert.strictEqual(results.length, 2);
    });

    test('returns empty on API error (graceful degradation)', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const results = await searchLoC('test');

      assert.deepStrictEqual(results, []);
    });

    test('provides default values for missing fields', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              image_url: ['https://tile.loc.gov/img.jpg'],
            },
          ],
        },
      }));

      const results = await searchLoC('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Untitled');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].source, 'Library of Congress');
      assert.strictEqual(results[0].sourceUrl, '');
    });

    test('uses url field for sourceUrl, falls back to id', async () => {
      const { searchLoC } = require('../../src/services/locService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          results: [
            {
              title: 'With URL',
              image_url: ['https://tile.loc.gov/1.jpg'],
              url: 'https://www.loc.gov/item/1/',
              id: 'http://www.loc.gov/item/1/',
            },
            {
              title: 'With ID only',
              image_url: ['https://tile.loc.gov/2.jpg'],
              id: 'http://www.loc.gov/item/2/',
            },
          ],
        },
      }));

      const results = await searchLoC('test', 2);

      assert.strictEqual(results[0].sourceUrl, 'https://www.loc.gov/item/1/');
      assert.strictEqual(results[1].sourceUrl, 'http://www.loc.gov/item/2/');
    });
  });
});

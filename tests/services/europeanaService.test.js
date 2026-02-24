/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('EuropeanaService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/europeanaService')];

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

  describe('searchEuropeana', () => {
    test('returns empty array for empty query', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');
      const results = await searchEuropeana('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');
      const results = await searchEuropeana(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');
      const results = await searchEuropeana('   ');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for non-string query', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');
      const results = await searchEuropeana(123);
      assert.deepStrictEqual(results, []);
    });

    test('prefers edmIsShownBy over edmPreview for image URL', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              id: '/123/abc',
              guid: 'https://europeana.eu/item/123/abc',
              title: 'Test Item',
              edmIsShownBy: ['https://full-image.jpg'],
              edmPreview: ['https://preview-image.jpg'],
            },
          ],
        },
      }));

      const results = await searchEuropeana('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://full-image.jpg');
    });

    test('falls back to edmPreview when edmIsShownBy is missing', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              id: '/123/abc',
              guid: 'https://europeana.eu/item/123/abc',
              title: 'Test Item',
              edmPreview: ['https://preview-image.jpg'],
            },
          ],
        },
      }));

      const results = await searchEuropeana('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://preview-image.jpg');
    });

    test('filters out items without image URLs', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            { id: '/1', title: 'With Image', edmIsShownBy: ['https://img.jpg'] },
            { id: '/2', title: 'No Image' },
            { id: '/3', title: 'Also With Image', edmPreview: ['https://preview.jpg'] },
          ],
        },
      }));

      const results = await searchEuropeana('test', 8);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'With Image');
      assert.strictEqual(results[1].title, 'Also With Image');
    });

    test('handles array fields (title, dcCreator, year, dataProvider)', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              id: '/123/abc',
              guid: 'https://europeana.eu/item/123/abc',
              title: ['Title One', 'Title Two'],
              dcCreator: ['Artist One', 'Artist Two'],
              year: ['1900', '1901'],
              dataProvider: ['Provider One'],
              edmIsShownBy: ['https://img.jpg'],
            },
          ],
        },
      }));

      const results = await searchEuropeana('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Title One');
      assert.strictEqual(results[0].artist, 'Artist One');
      assert.strictEqual(results[0].date, '1900');
      assert.strictEqual(results[0].provider, 'Provider One');
    });

    test('respects limit parameter', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            { id: '/1', title: 'Item 1', edmIsShownBy: ['https://1.jpg'] },
            { id: '/2', title: 'Item 2', edmIsShownBy: ['https://2.jpg'] },
            { id: '/3', title: 'Item 3', edmIsShownBy: ['https://3.jpg'] },
            { id: '/4', title: 'Item 4', edmIsShownBy: ['https://4.jpg'] },
          ],
        },
      }));

      const results = await searchEuropeana('test', 2);

      assert.strictEqual(results.length, 2);
    });

    test('handles API errors gracefully', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const results = await searchEuropeana('test');

      assert.deepStrictEqual(results, []);
    });

    test('provides default values for missing fields', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              id: '/123/abc',
              edmIsShownBy: ['https://img.jpg'],
            },
          ],
        },
      }));

      const results = await searchEuropeana('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Untitled');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].source, 'Europeana');
    });

    test('constructs sourceUrl from guid or id', async () => {
      const { searchEuropeana } = require('../../src/services/europeanaService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              id: '/123/abc',
              guid: 'https://europeana.eu/item/123/abc',
              edmIsShownBy: ['https://img1.jpg'],
            },
            {
              id: '/456/def',
              edmIsShownBy: ['https://img2.jpg'],
            },
          ],
        },
      }));

      const results = await searchEuropeana('test', 2);

      assert.strictEqual(results[0].sourceUrl, 'https://europeana.eu/item/123/abc');
      assert.strictEqual(results[1].sourceUrl, 'https://www.europeana.eu/item/456/def');
    });
  });
});

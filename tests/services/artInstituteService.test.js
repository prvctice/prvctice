/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('ArtInstituteService', () => {
  let originalAxios;
  let mockAxiosGet;
  let artInstituteService;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/artInstituteService')];

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

  describe('searchArtInstitute', () => {
    test('returns empty array for empty query', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');
      const results = await searchArtInstitute('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');
      const results = await searchArtInstitute(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');
      const results = await searchArtInstitute('   ');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for non-string query', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');
      const results = await searchArtInstitute(123);
      assert.deepStrictEqual(results, []);
    });

    test('filters out artworks without image_id', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              id: 1,
              title: 'With Image',
              artist_display: 'Artist 1',
              image_id: 'abc123',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
            { id: 2, title: 'No Image', artist_display: 'Artist 2', image_id: null },
            {
              id: 3,
              title: 'Also With Image',
              artist_display: 'Artist 3',
              image_id: 'def456',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
          ],
        },
      }));

      const results = await searchArtInstitute('test', 8);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'With Image');
      assert.strictEqual(results[1].title, 'Also With Image');
    });

    test('constructs correct IIIF image URLs', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              id: 123,
              title: 'Test Art',
              artist_display: 'Test Artist',
              image_id: 'abc123',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
          ],
        },
      }));

      const results = await searchArtInstitute('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(
        results[0].url,
        'https://www.artic.edu/iiif/2/abc123/full/843,/0/default.jpg'
      );
      assert.strictEqual(results[0].sourceUrl, 'https://www.artic.edu/artworks/123');
      assert.strictEqual(results[0].source, 'Art Institute of Chicago');
    });

    test('respects limit parameter', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              id: 1,
              title: 'Art 1',
              image_id: 'a',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
            {
              id: 2,
              title: 'Art 2',
              image_id: 'b',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
            {
              id: 3,
              title: 'Art 3',
              image_id: 'c',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
            {
              id: 4,
              title: 'Art 4',
              image_id: 'd',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
            {
              id: 5,
              title: 'Art 5',
              image_id: 'e',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            },
          ],
        },
      }));

      const results = await searchArtInstitute('test', 3);

      assert.strictEqual(results.length, 3);
    });

    test('handles API errors gracefully', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const results = await searchArtInstitute('test');

      assert.deepStrictEqual(results, []);
    });

    test('provides default values for missing fields', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              id: 1,
              image_id: 'abc',
              is_public_domain: true,
              thumbnail: { width: 100, height: 100 },
            }, // No title, artist, date, medium
          ],
        },
      }));

      const results = await searchArtInstitute('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Untitled');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].medium, '');
    });

    test('handles empty response data', async () => {
      const { searchArtInstitute } = require('../../src/services/artInstituteService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {},
      }));

      const results = await searchArtInstitute('test');

      assert.deepStrictEqual(results, []);
    });
  });
});

/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('MetMuseumService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/metMuseumService')];

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

  describe('searchMetMuseum', () => {
    test('returns empty array for empty query', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');
      const results = await searchMetMuseum('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');
      const results = await searchMetMuseum(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');
      const results = await searchMetMuseum('   ');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for non-string query', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');
      const results = await searchMetMuseum(123);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array when search returns no objectIDs', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: null } };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test');

      assert.deepStrictEqual(results, []);
    });

    test('fetches object details for each objectID', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1, 2] } };
        }
        if (url.includes('/objects/1')) {
          return {
            data: {
              objectID: 1,
              title: 'Artwork 1',
              artistDisplayName: 'Artist 1',
              objectDate: '1900',
              medium: 'Oil on canvas',
              primaryImage: 'https://images.metmuseum.org/1.jpg',
              objectURL: 'https://www.metmuseum.org/art/collection/search/1',
            },
          };
        }
        if (url.includes('/objects/2')) {
          return {
            data: {
              objectID: 2,
              title: 'Artwork 2',
              artistDisplayName: 'Artist 2',
              primaryImage: 'https://images.metmuseum.org/2.jpg',
            },
          };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 8);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'Artwork 1');
      assert.strictEqual(results[0].artist, 'Artist 1');
      assert.strictEqual(results[0].url, 'https://images.metmuseum.org/1.jpg');
    });

    test('filters out objects without primaryImage', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1, 2, 3] } };
        }
        if (url.includes('/objects/1')) {
          return { data: { objectID: 1, title: 'With Image', primaryImage: 'https://img.jpg' } };
        }
        if (url.includes('/objects/2')) {
          return { data: { objectID: 2, title: 'No Image', primaryImage: '' } };
        }
        if (url.includes('/objects/3')) {
          return {
            data: { objectID: 3, title: 'Also With Image', primaryImage: 'https://img2.jpg' },
          };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 8);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'With Image');
      assert.strictEqual(results[1].title, 'Also With Image');
    });

    test('respects limit parameter', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1, 2, 3, 4, 5] } };
        }
        const match = url.match(/\/objects\/(\d+)/);
        if (match) {
          const id = match[1];
          return {
            data: {
              objectID: parseInt(id),
              title: `Artwork ${id}`,
              primaryImage: `https://img${id}.jpg`,
            },
          };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 2);

      assert.strictEqual(results.length, 2);
    });

    test('handles search API errors gracefully', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const results = await searchMetMuseum('test');

      assert.deepStrictEqual(results, []);
    });

    test('handles individual object fetch errors gracefully', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1, 2] } };
        }
        if (url.includes('/objects/1')) {
          return {
            data: { objectID: 1, title: 'Valid', primaryImage: 'https://img.jpg' },
          };
        }
        if (url.includes('/objects/2')) {
          throw new Error('Object not found');
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 8);

      // Should still return the valid result
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Valid');
    });

    test('provides default values for missing fields', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1] } };
        }
        if (url.includes('/objects/1')) {
          return {
            data: {
              objectID: 1,
              primaryImage: 'https://img.jpg',
            },
          };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 1);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Untitled');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].medium, '');
      assert.strictEqual(results[0].source, 'Met Museum');
    });

    test('constructs sourceUrl from objectURL or objectID', async () => {
      const { searchMetMuseum } = require('../../src/services/metMuseumService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search')) {
          return { data: { objectIDs: [1, 2] } };
        }
        if (url.includes('/objects/1')) {
          return {
            data: {
              objectID: 1,
              primaryImage: 'https://img1.jpg',
              objectURL: 'https://www.metmuseum.org/art/collection/search/1',
            },
          };
        }
        if (url.includes('/objects/2')) {
          return {
            data: {
              objectID: 2,
              primaryImage: 'https://img2.jpg',
              // No objectURL
            },
          };
        }
        return { data: {} };
      });

      const results = await searchMetMuseum('test', 2);

      assert.strictEqual(results[0].sourceUrl, 'https://www.metmuseum.org/art/collection/search/1');
      assert.strictEqual(results[1].sourceUrl, 'https://www.metmuseum.org/art/collection/search/2');
    });
  });
});

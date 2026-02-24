/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('OpenLibraryService', () => {
  let originalAxiosGet;
  let mockAxiosGet;

  beforeEach(() => {
    delete require.cache[require.resolve('../../src/services/openLibraryService')];

    mockAxiosGet = mock.fn();
    originalAxiosGet = require('axios').get;
    require('axios').get = mockAxiosGet;
  });

  afterEach(() => {
    if (originalAxiosGet) {
      require('axios').get = originalAxiosGet;
    }
  });

  describe('searchOpenLibrary', () => {
    test('returns mapped BookResult from valid API response', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          docs: [
            {
              key: '/works/OL27448W',
              title: 'Thinking, Fast and Slow',
              author_name: ['Daniel Kahneman'],
              first_publish_year: 2011,
              cover_i: 8231856,
              isbn: ['9780374275631', '0374275637'],
            },
          ],
        },
      }));

      const results = await searchOpenLibrary('thinking fast and slow');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Thinking, Fast and Slow');
      assert.deepStrictEqual(results[0].authors, ['Daniel Kahneman']);
      assert.strictEqual(results[0].publishYear, 2011);
      assert.strictEqual(results[0].source, 'Open Library');
      assert.strictEqual(results[0].sourceUrl, 'https://openlibrary.org/works/OL27448W');
      assert.strictEqual(results[0].isbn, '9780374275631');
      assert.strictEqual(results[0].description, '');
    });

    test('filters out results without cover_i', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          docs: [
            { key: '/works/OL1', title: 'No Cover', author_name: ['Author A'] },
            {
              key: '/works/OL2',
              title: 'Has Cover',
              author_name: ['Author B'],
              cover_i: 12345,
            },
            { key: '/works/OL3', title: 'Also No Cover', cover_i: 0 },
          ],
        },
      }));

      const results = await searchOpenLibrary('test');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Has Cover');
    });

    test('constructs correct cover URL from cover_i', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          docs: [{ key: '/works/OL1', title: 'Test', cover_i: 9876543 }],
        },
      }));

      const results = await searchOpenLibrary('test');

      assert.strictEqual(results[0].coverUrl, 'https://covers.openlibrary.org/b/id/9876543-M.jpg');
    });

    test('handles author filter parameter', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async (url, config) => {
        // Verify author param is passed
        assert.strictEqual(config.params.author, 'Kahneman');
        return { data: { docs: [] } };
      });

      await searchOpenLibrary('thinking', 10, { author: 'Kahneman' });

      assert.strictEqual(mockAxiosGet.mock.calls.length, 1);
    });

    test('returns empty array on empty query', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');
      const results = await searchOpenLibrary('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on null query', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');
      const results = await searchOpenLibrary(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on non-string query', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');
      const results = await searchOpenLibrary(123);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on whitespace-only query', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');
      const results = await searchOpenLibrary('   ');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on API error', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Network timeout');
      });

      const results = await searchOpenLibrary('test');
      assert.deepStrictEqual(results, []);
    });

    test('handles missing isbn gracefully', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          docs: [{ key: '/works/OL1', title: 'No ISBN', cover_i: 111 }],
        },
      }));

      const results = await searchOpenLibrary('test');

      assert.strictEqual(results[0].isbn, null);
    });

    test('respects limit parameter', async () => {
      const { searchOpenLibrary } = require('../../src/services/openLibraryService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          docs: [
            { key: '/works/OL1', title: 'Book 1', cover_i: 1 },
            { key: '/works/OL2', title: 'Book 2', cover_i: 2 },
            { key: '/works/OL3', title: 'Book 3', cover_i: 3 },
          ],
        },
      }));

      const results = await searchOpenLibrary('test', 2);

      assert.strictEqual(results.length, 2);
    });
  });
});

/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('GoogleBooksService', () => {
  let originalAxiosGet;
  let mockAxiosGet;

  beforeEach(() => {
    delete require.cache[require.resolve('../../src/services/googleBooksService')];

    mockAxiosGet = mock.fn();
    originalAxiosGet = require('axios').get;
    require('axios').get = mockAxiosGet;
  });

  afterEach(() => {
    if (originalAxiosGet) {
      require('axios').get = originalAxiosGet;
    }
  });

  describe('searchGoogleBooks', () => {
    test('returns mapped BookResult from valid API response', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          totalItems: 1,
          items: [
            {
              volumeInfo: {
                title: 'Sapiens',
                authors: ['Yuval Noah Harari'],
                description: 'A brief history of humankind.',
                publishedDate: '2015-02-10',
                imageLinks: {
                  thumbnail: 'https://books.google.com/books/content?id=1EiJAwAAQBAJ&img=1',
                },
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9780062316097' },
                  { type: 'ISBN_10', identifier: '0062316095' },
                ],
                infoLink: 'https://books.google.com/books?id=1EiJAwAAQBAJ',
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('sapiens');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Sapiens');
      assert.deepStrictEqual(results[0].authors, ['Yuval Noah Harari']);
      assert.strictEqual(results[0].description, 'A brief history of humankind.');
      assert.strictEqual(results[0].publishYear, 2015);
      assert.strictEqual(results[0].source, 'Google Books');
      assert.strictEqual(results[0].sourceUrl, 'https://books.google.com/books?id=1EiJAwAAQBAJ');
      assert.strictEqual(results[0].isbn, '9780062316097');
    });

    test('strips HTML from descriptions', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'HTML Book',
                description: '<p>This is <b>bold</b> and <i>italic</i> text.</p>',
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('html');

      assert.strictEqual(results[0].description, 'This is bold and italic text.');
    });

    test('replaces http with https in cover URLs', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'HTTP Cover',
                imageLinks: {
                  thumbnail: 'http://books.google.com/books/content?id=abc&img=1',
                },
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('test');

      assert.strictEqual(
        results[0].coverUrl,
        'https://books.google.com/books/content?id=abc&img=1'
      );
    });

    test('filters out results without cover images', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'No Cover',
                description: 'A book without a cover',
              },
            },
            {
              volumeInfo: {
                title: 'Has Cover',
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
              },
            },
            {
              volumeInfo: {
                title: 'Empty Image Links',
                imageLinks: {},
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('test');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Has Cover');
    });

    test('handles author filter (inauthor: query construction)', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async (url, config) => {
        assert.strictEqual(config.params.q, 'sapiens+inauthor:Harari');
        return { data: { items: [] } };
      });

      await searchGoogleBooks('sapiens', 10, { author: 'Harari' });

      assert.strictEqual(mockAxiosGet.mock.calls.length, 1);
    });

    test('returns empty array on empty query', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');
      const results = await searchGoogleBooks('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on null query', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');
      const results = await searchGoogleBooks(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on non-string query', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');
      const results = await searchGoogleBooks(42);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on API error', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('Service unavailable');
      });

      const results = await searchGoogleBooks('test');
      assert.deepStrictEqual(results, []);
    });

    test('extracts ISBN_13 preferring over ISBN_10', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'ISBN Book',
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
                industryIdentifiers: [
                  { type: 'ISBN_10', identifier: '0123456789' },
                  { type: 'ISBN_13', identifier: '9780123456789' },
                ],
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('isbn');

      assert.strictEqual(results[0].isbn, '9780123456789');
    });

    test('falls back to ISBN_10 when no ISBN_13', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'ISBN10 Only',
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
                industryIdentifiers: [{ type: 'ISBN_10', identifier: '0123456789' }],
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('isbn');

      assert.strictEqual(results[0].isbn, '0123456789');
    });

    test('truncates description to 300 characters', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      const longDescription = 'A'.repeat(500);
      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'Long Desc',
                description: longDescription,
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('test');

      assert.strictEqual(results[0].description.length, 300);
    });

    test('uses previewLink as fallback when infoLink missing', async () => {
      const { searchGoogleBooks } = require('../../src/services/googleBooksService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          items: [
            {
              volumeInfo: {
                title: 'Preview Only',
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
                previewLink: 'https://books.google.com/preview?id=abc',
              },
            },
          ],
        },
      }));

      const results = await searchGoogleBooks('test');

      assert.strictEqual(results[0].sourceUrl, 'https://books.google.com/preview?id=abc');
    });
  });
});

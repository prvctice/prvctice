/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('BookSearchService', () => {
  let originalAxiosGet;
  let mockAxiosGet;
  let circuitBreaker;

  beforeEach(() => {
    // Clear module caches
    delete require.cache[require.resolve('../../src/services/bookSearchService')];
    delete require.cache[require.resolve('../../src/services/openLibraryService')];
    delete require.cache[require.resolve('../../src/services/googleBooksService')];

    mockAxiosGet = mock.fn();
    originalAxiosGet = require('axios').get;
    require('axios').get = mockAxiosGet;

    circuitBreaker = require('../../src/services/circuitBreaker');
    circuitBreaker.resetAllCircuits();
  });

  afterEach(() => {
    if (originalAxiosGet) {
      require('axios').get = originalAxiosGet;
    }
    circuitBreaker.resetAllCircuits();
  });

  /** Helper: mock both Open Library and Google Books responses */
  function mockBothSources(openLibraryDocs, googleBooksItems) {
    let callCount = 0;
    mockAxiosGet.mock.mockImplementation(async (url) => {
      callCount++;
      if (url.includes('openlibrary.org')) {
        return { data: { docs: openLibraryDocs } };
      }
      if (url.includes('googleapis.com')) {
        return { data: { items: googleBooksItems } };
      }
      return { data: {} };
    });
  }

  describe('searchBooks', () => {
    test('queries both sources in parallel', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        [{ key: '/works/OL1', title: 'OL Book', cover_i: 1, author_name: ['Author A'] }],
        [
          {
            volumeInfo: {
              title: 'GB Book',
              authors: ['Author B'],
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
            },
          },
        ]
      );

      const result = await searchBooks({ query: 'test' });

      assert.strictEqual(result.sourcesTotal, 2);
      assert.strictEqual(result.sourcesResponded, 2);
      assert.ok(result.books.length >= 2);
    });

    test('deduplicates by ISBN (keeps richer result)', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        [
          {
            key: '/works/OL1',
            title: 'Same Book',
            cover_i: 111,
            author_name: ['Author'],
            isbn: ['9780123456789'],
          },
        ],
        [
          {
            volumeInfo: {
              title: 'Same Book',
              authors: ['Author'],
              description:
                'A detailed description of this excellent book that provides great insight.',
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780123456789' }],
            },
          },
        ]
      );

      const result = await searchBooks({ query: 'same book' });

      // Should deduplicate to 1 result, keeping the richer one (Google Books has description)
      const matchingBooks = result.books.filter((b) => b.isbn === '9780123456789');
      assert.strictEqual(matchingBooks.length, 1);
      // Google Books result is richer (has description > 50 chars)
      assert.strictEqual(matchingBooks[0].source, 'Google Books');
    });

    test('deduplicates by normalized title when no ISBN', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        [
          {
            key: '/works/OL1',
            title: 'The Great Gatsby',
            cover_i: 111,
            author_name: ['F. Scott Fitzgerald'],
          },
        ],
        [
          {
            volumeInfo: {
              title: 'The Great Gatsby: A Novel',
              authors: ['F. Scott Fitzgerald'],
              description:
                'A masterful novel about the American Dream and its discontents in the roaring twenties.',
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
            },
          },
        ]
      );

      const result = await searchBooks({ query: 'great gatsby' });

      // Both titles normalize to "the great gatsby" (subtitle stripped)
      // Should deduplicate to 1 result
      const gatsbyBooks = result.books.filter((b) => b.title.toLowerCase().includes('gatsby'));
      assert.strictEqual(gatsbyBooks.length, 1);
    });

    test('skips short titles in dedup (includes both)', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        [
          {
            key: '/works/OL1',
            title: 'Art',
            cover_i: 111,
            author_name: ['Author A'],
          },
        ],
        [
          {
            volumeInfo: {
              title: 'Art',
              authors: ['Author B'],
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
            },
          },
        ]
      );

      const result = await searchBooks({ query: 'art' });

      // "Art" normalizes to "art" (3 chars < 5 minimum)
      // Both should be included since title is too short for dedup
      assert.ok(result.books.length >= 2);
    });

    test('respects circuit breaker (skips open circuits)', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      // Open the circuit for Open Library
      circuitBreaker.recordFailure('Open Library');
      circuitBreaker.recordFailure('Open Library');
      circuitBreaker.recordFailure('Open Library');

      mockBothSources(
        // Open Library would return this, but circuit is open
        [{ key: '/works/OL1', title: 'OL Book', cover_i: 1 }],
        [
          {
            volumeInfo: {
              title: 'GB Book',
              authors: ['Author'],
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
            },
          },
        ]
      );

      const result = await searchBooks({ query: 'test' });

      // Only Google Books should respond (Open Library circuit is open)
      assert.strictEqual(result.sourcesTotal, 1);
      assert.strictEqual(result.sourcesResponded, 1);
      // Only Google Books results should appear
      const sources = result.books.map((b) => b.source);
      assert.ok(!sources.includes('Open Library'));
    });

    test('returns error message on total failure with essay search suggestion', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('All APIs down');
      });

      const result = await searchBooks({ query: 'test' });

      assert.strictEqual(result.books.length, 0);
      assert.strictEqual(result.sourcesResponded, 0);
      assert.strictEqual(result.sourcesTotal, 2);
      assert.ok(result.error);
      assert.ok(result.error.includes('essay_search'));
    });

    test('clamps limit to 3-10 range', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        Array.from({ length: 15 }, (_, i) => ({
          key: `/works/OL${i}`,
          title: `Book ${i}`,
          cover_i: i + 1,
          author_name: [`Author ${i}`],
        })),
        []
      );

      // Test minimum clamping
      const result1 = await searchBooks({ query: 'test', limit: 1 });
      assert.ok(
        result1.books.length >= 3 || result1.books.length === 0,
        `Expected at least 3 results with limit=1 (clamped to 3), got ${result1.books.length}`
      );

      // Test maximum clamping
      const result2 = await searchBooks({ query: 'test', limit: 20 });
      assert.ok(
        result2.books.length <= 10,
        `Expected at most 10 results with limit=20 (clamped to 10), got ${result2.books.length}`
      );
    });

    test('returns empty for empty query', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      const result = await searchBooks({ query: '' });

      assert.deepStrictEqual(result.books, []);
      assert.strictEqual(result.sourcesTotal, 0);
      assert.strictEqual(result.sourcesResponded, 0);
    });

    test('returns empty for null query', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      const result = await searchBooks({ query: null });

      assert.deepStrictEqual(result.books, []);
    });

    test('handles one source failing gracefully', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('openlibrary.org')) {
          throw new Error('Open Library is down');
        }
        return {
          data: {
            items: [
              {
                volumeInfo: {
                  title: 'Google Book',
                  authors: ['Author'],
                  imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
                },
              },
            ],
          },
        };
      });

      const result = await searchBooks({ query: 'test' });

      // Google Books should still respond
      assert.strictEqual(result.sourcesResponded, 1);
      assert.strictEqual(result.sourcesTotal, 2);
      assert.ok(result.books.length > 0);
      assert.ok(!result.error, 'Should not have error when at least one source responds');
    });

    test('default limit is 5', async () => {
      const { searchBooks } = require('../../src/services/bookSearchService');

      mockBothSources(
        Array.from({ length: 10 }, (_, i) => ({
          key: `/works/OL${i}`,
          title: `OL Book ${i}`,
          cover_i: i + 1,
          author_name: [`Author ${i}`],
          isbn: [`978000000000${i}`],
        })),
        Array.from({ length: 10 }, (_, i) => ({
          volumeInfo: {
            title: `GB Book ${i}`,
            authors: [`Author ${i}`],
            imageLinks: { thumbnail: `https://books.google.com/cover${i}.jpg` },
            industryIdentifiers: [{ type: 'ISBN_13', identifier: `978111111111${i}` }],
          },
        }))
      );

      const result = await searchBooks({ query: 'test' });

      assert.strictEqual(result.books.length, 5);
    });
  });
});

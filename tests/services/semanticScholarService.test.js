/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('SemanticScholarService', () => {
  let originalAxiosGet;
  let mockAxiosGet;

  beforeEach(() => {
    delete require.cache[require.resolve('../../src/services/semanticScholarService')];

    mockAxiosGet = mock.fn();
    originalAxiosGet = require('axios').get;
    require('axios').get = mockAxiosGet;
  });

  afterEach(() => {
    if (originalAxiosGet) {
      require('axios').get = originalAxiosGet;
    }
  });

  describe('searchSemanticScholar', () => {
    test('returns mapped EssayResult from valid API response', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          total: 1,
          data: [
            {
              paperId: 'abc123',
              title: 'Attention Is All You Need',
              authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
              abstract:
                'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',
              citationCount: 90000,
              year: 2017,
              isOpenAccess: true,
              openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762' },
              url: 'https://www.semanticscholar.org/paper/abc123',
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('attention mechanism');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Attention Is All You Need');
      assert.deepStrictEqual(results[0].authors, ['Ashish Vaswani', 'Noam Shazeer']);
      assert.ok(results[0].abstract.includes('dominant sequence transduction'));
      assert.strictEqual(results[0].citationCount, 90000);
      assert.strictEqual(results[0].year, 2017);
      assert.strictEqual(results[0].isOpenAccess, true);
      assert.strictEqual(results[0].pdfUrl, 'https://arxiv.org/pdf/1706.03762');
      assert.strictEqual(results[0].source, 'Semantic Scholar');
      assert.strictEqual(results[0].sourceUrl, 'https://www.semanticscholar.org/paper/abc123');
    });

    test('maps authors array to name strings', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'xyz',
              title: 'Test Paper',
              authors: [
                { authorId: '1', name: 'Alice' },
                { authorId: '2', name: 'Bob' },
                { authorId: '3', name: 'Charlie' },
              ],
              citationCount: 10,
              year: 2020,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.deepStrictEqual(results[0].authors, ['Alice', 'Bob', 'Charlie']);
    });

    test('includes openAccessPdf URL when available', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'open',
              title: 'Open Paper',
              authors: [],
              isOpenAccess: true,
              openAccessPdf: { url: 'https://arxiv.org/pdf/2020.12345' },
              citationCount: 50,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.strictEqual(results[0].pdfUrl, 'https://arxiv.org/pdf/2020.12345');
      assert.strictEqual(results[0].isOpenAccess, true);
    });

    test('sets pdfUrl to null when not available', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'closed',
              title: 'Closed Paper',
              authors: [],
              isOpenAccess: false,
              citationCount: 20,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.strictEqual(results[0].pdfUrl, null);
      assert.strictEqual(results[0].isOpenAccess, false);
    });

    test('returns empty array on empty query', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');
      const results = await searchSemanticScholar('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on null query', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');
      const results = await searchSemanticScholar(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on non-string query', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');
      const results = await searchSemanticScholar(42);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array on API error', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('429 Too Many Requests');
      });

      const results = await searchSemanticScholar('test');
      assert.deepStrictEqual(results, []);
    });

    test('passes minCitationCount=5 in request', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async (url, config) => {
        assert.strictEqual(config.params.minCitationCount, 5);
        return { data: { data: [] } };
      });

      await searchSemanticScholar('test');

      assert.strictEqual(mockAxiosGet.mock.calls.length, 1);
    });

    test('includes x-api-key header when env var set', async () => {
      // Set env var for this test
      const original = process.env.SEMANTIC_SCHOLAR_API_KEY;
      process.env.SEMANTIC_SCHOLAR_API_KEY = 'test-api-key-123';

      // Clear module cache to pick up new env var
      delete require.cache[require.resolve('../../src/services/semanticScholarService')];
      const {
        searchSemanticScholar: searchWithKey,
      } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async (url, config) => {
        assert.strictEqual(config.headers['x-api-key'], 'test-api-key-123');
        return { data: { data: [] } };
      });

      await searchWithKey('test');

      assert.strictEqual(mockAxiosGet.mock.calls.length, 1);

      // Restore env var
      if (original === undefined) {
        delete process.env.SEMANTIC_SCHOLAR_API_KEY;
      } else {
        process.env.SEMANTIC_SCHOLAR_API_KEY = original;
      }
    });

    test('constructs sourceUrl from paperId when url is missing', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'def456',
              title: 'No URL Paper',
              authors: [],
              citationCount: 15,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.strictEqual(results[0].sourceUrl, 'https://www.semanticscholar.org/paper/def456');
    });

    test('handles missing abstract gracefully', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'noabs',
              title: 'No Abstract',
              authors: [],
              abstract: null,
              citationCount: 10,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.strictEqual(results[0].abstract, '');
    });

    test('filters out authors with empty names', async () => {
      const { searchSemanticScholar } = require('../../src/services/semanticScholarService');

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          data: [
            {
              paperId: 'emptyauth',
              title: 'Empty Author Names',
              authors: [
                { authorId: '1', name: 'Alice' },
                { authorId: '2', name: '' },
                { authorId: '3', name: 'Charlie' },
              ],
              citationCount: 10,
            },
          ],
        },
      }));

      const results = await searchSemanticScholar('test');

      assert.deepStrictEqual(results[0].authors, ['Alice', 'Charlie']);
    });
  });
});

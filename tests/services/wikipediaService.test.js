/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe } = require('node:test');

const {
  searchWikipediaArticles,
  searchWikimediaImages,
} = require('../../src/services/wikipediaService');

const hasIntegration = process.env.INTEGRATION_TESTS === '1';

describe('WikipediaService', () => {
  describe('searchWikipediaArticles', () => {
    test('returns empty array when query is missing', async () => {
      const results = await searchWikipediaArticles('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array when query is null', async () => {
      const results = await searchWikipediaArticles(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array when query is undefined', async () => {
      const results = await searchWikipediaArticles(undefined);
      assert.deepStrictEqual(results, []);
    });

    // Integration test - makes real API call
    test('returns formatted articles from Wikipedia API', { skip: !hasIntegration }, async () => {
      const results = await searchWikipediaArticles('JavaScript programming', 3);

      // Should return array
      assert.ok(Array.isArray(results), 'Results should be an array');

      // If we got results, verify structure
      if (results.length > 0) {
        const article = results[0];
        assert.ok('title' in article, 'Article should have title');
        assert.ok('snippet' in article, 'Article should have snippet');
        assert.ok('url' in article, 'Article should have url');
        assert.ok(article.url.includes('wikipedia.org'), 'URL should be Wikipedia');
      }
    });

    test('respects limit parameter', async () => {
      const results = await searchWikipediaArticles('programming', 2);
      assert.ok(results.length <= 2, 'Should respect limit');
    });
  });

  describe('searchWikimediaImages', () => {
    test('returns empty array for empty query', async () => {
      const results = await searchWikimediaImages('');
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const results = await searchWikimediaImages(null);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const results = await searchWikimediaImages('   ');
      assert.deepStrictEqual(results, []);
    });

    // Integration test - makes real API call
    test('returns images with correct structure', { skip: !hasIntegration }, async () => {
      const results = await searchWikimediaImages('nature photograph', 3);

      assert.ok(Array.isArray(results), 'Results should be an array');

      // All returned results should have thumbnails (service filters out those without)
      for (const img of results) {
        assert.ok('title' in img, 'Image should have title');
        assert.ok('thumbnail' in img, 'Image should have thumbnail');
        assert.ok('url' in img, 'Image should have url');
        if (img.thumbnail) {
          assert.ok(typeof img.thumbnail === 'string', 'Thumbnail should be URL string');
        }
      }
    });

    test('strips HTML from snippets', async () => {
      const results = await searchWikimediaImages('art', 1);

      for (const img of results) {
        if (img.snippet) {
          assert.ok(!img.snippet.includes('<'), 'Snippet should not contain HTML tags');
        }
      }
    });
  });
});

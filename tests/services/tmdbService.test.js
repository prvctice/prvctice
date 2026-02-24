/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe } = require('node:test');

const {
  searchTMDB,
  getMovieStills,
  isAvailable,
  resolveApiKey,
} = require('../../src/services/tmdbService');

describe('TMDBService', () => {
  describe('resolveApiKey', () => {
    test('returns key from context.apiKeys.tmdb', () => {
      const context = { apiKeys: { tmdb: 'api-key-1' } };
      assert.strictEqual(resolveApiKey(context), 'api-key-1');
    });

    test('returns key from context.session.tmdbApiKey', () => {
      const context = { session: { tmdbApiKey: 'session-key' } };
      assert.strictEqual(resolveApiKey(context), 'session-key');
    });

    test('returns key from context.getApiKey function', () => {
      const context = { getApiKey: (name) => (name === 'tmdb' ? 'func-key' : null) };
      assert.strictEqual(resolveApiKey(context), 'func-key');
    });

    test('returns null when no key available', () => {
      assert.strictEqual(resolveApiKey({}), null);
      assert.strictEqual(resolveApiKey(), null);
    });

    test('prefers apiKeys.tmdb over other sources', () => {
      const context = {
        apiKeys: { tmdb: 'preferred' },
        session: { tmdbApiKey: 'session' },
        getApiKey: () => 'func',
      };
      assert.strictEqual(resolveApiKey(context), 'preferred');
    });
  });

  describe('isAvailable', () => {
    test('returns true when API key is configured', () => {
      const context = { apiKeys: { tmdb: 'some-key' } };
      assert.strictEqual(isAvailable(context), true);
    });

    test('returns false when no API key', () => {
      assert.strictEqual(isAvailable({}), false);
      assert.strictEqual(isAvailable(), false);
    });
  });

  describe('searchTMDB', () => {
    test('returns empty array when no API key', async () => {
      const results = await searchTMDB('test query', 8, {});
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for empty query', async () => {
      const context = { apiKeys: { tmdb: 'test-key' } };
      const results = await searchTMDB('', 8, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for null query', async () => {
      const context = { apiKeys: { tmdb: 'test-key' } };
      const results = await searchTMDB(null, 8, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for whitespace-only query', async () => {
      const context = { apiKeys: { tmdb: 'test-key' } };
      const results = await searchTMDB('   ', 8, context);
      assert.deepStrictEqual(results, []);
    });

    // Note: Tests with real API calls would require a valid TMDB API key
    // These are skipped by default as they require external dependencies
  });

  describe('getMovieStills', () => {
    test('returns empty array when no API key', async () => {
      const results = await getMovieStills('Inception', null, {});
      assert.deepStrictEqual(results, []);
    });

    test('returns empty array for empty context', async () => {
      const results = await getMovieStills('Test Movie', 2020, {});
      assert.deepStrictEqual(results, []);
    });
  });
});

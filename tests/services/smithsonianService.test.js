/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('SmithsonianService', () => {
  let originalAxios;
  let mockAxiosGet;

  beforeEach(() => {
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../../src/services/smithsonianService')];

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

  describe('isAvailable', () => {
    test('returns false with no context', () => {
      const { isAvailable } = require('../../src/services/smithsonianService');
      assert.strictEqual(isAvailable(), false);
      assert.strictEqual(isAvailable({}), false);
    });

    test('returns true with apiKeys.smithsonian set', () => {
      const { isAvailable } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };
      assert.strictEqual(isAvailable(context), true);
    });

    test('returns true with session.smithsonianApiKey set', () => {
      const { isAvailable } = require('../../src/services/smithsonianService');
      const context = { session: { smithsonianApiKey: 'session-key' } };
      assert.strictEqual(isAvailable(context), true);
    });

    test('returns true with getApiKey function', () => {
      const { isAvailable } = require('../../src/services/smithsonianService');
      const context = { getApiKey: (name) => (name === 'smithsonian' ? 'func-key' : undefined) };
      assert.strictEqual(isAvailable(context), true);
    });
  });

  describe('resolveApiKey', () => {
    test('returns null when no key available', () => {
      const { resolveApiKey } = require('../../src/services/smithsonianService');
      assert.strictEqual(resolveApiKey(), null);
      assert.strictEqual(resolveApiKey({}), null);
    });

    test('cascades through context.apiKeys -> context.session -> context.getApiKey', () => {
      const { resolveApiKey } = require('../../src/services/smithsonianService');

      // apiKeys has highest priority
      const fullContext = {
        apiKeys: { smithsonian: 'api-key' },
        session: { smithsonianApiKey: 'session-key' },
        getApiKey: () => 'func-key',
      };
      assert.strictEqual(resolveApiKey(fullContext), 'api-key');

      // Falls back to session
      const sessionContext = {
        session: { smithsonianApiKey: 'session-key' },
        getApiKey: () => 'func-key',
      };
      assert.strictEqual(resolveApiKey(sessionContext), 'session-key');

      // Falls back to getApiKey
      const funcContext = {
        getApiKey: (name) => (name === 'smithsonian' ? 'func-key' : undefined),
      };
      assert.strictEqual(resolveApiKey(funcContext), 'func-key');
    });

    test('returns null when getApiKey returns undefined', () => {
      const { resolveApiKey } = require('../../src/services/smithsonianService');
      const context = { getApiKey: () => undefined };
      assert.strictEqual(resolveApiKey(context), null);
    });
  });

  describe('searchSmithsonian', () => {
    test('returns empty when no API key', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const results = await searchSmithsonian('test query', 4, {});
      assert.deepStrictEqual(results, []);
    });

    test('returns empty for empty query', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };
      const results = await searchSmithsonian('', 4, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty for null query', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };
      const results = await searchSmithsonian(null, 4, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns empty for whitespace-only query', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };
      const results = await searchSmithsonian('   ', 4, context);
      assert.deepStrictEqual(results, []);
    });

    test('returns results with correct shape from deeply nested response', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          responseCode: 1,
          response: {
            rowCount: 1,
            rows: [
              {
                id: 'abc123',
                title: 'On the Sunset Hill, 1926',
                url: 'saam-12345',
                content: {
                  freetext: {
                    name: [{ label: 'Artist', content: 'John Smith' }],
                    date: [{ label: 'Date', content: '1926' }],
                  },
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Images',
                          resources: [
                            {
                              label: 'High Resolution',
                              url: 'https://ids.si.edu/ids/deliveryService?id=highres',
                            },
                            {
                              label: 'Screen Image',
                              url: 'https://ids.si.edu/ids/deliveryService?id=screen',
                            },
                            {
                              label: 'Thumbnail',
                              url: 'https://ids.si.edu/ids/deliveryService?id=thumb',
                            },
                          ],
                        },
                      ],
                    },
                    record_link: 'https://www.si.edu/object/saam-12345',
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('sunset painting', 4, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].url, 'https://ids.si.edu/ids/deliveryService?id=screen');
      assert.strictEqual(
        results[0].thumbnailUrl,
        'https://ids.si.edu/ids/deliveryService?id=thumb'
      );
      assert.strictEqual(results[0].title, 'On the Sunset Hill, 1926');
      assert.strictEqual(results[0].artist, 'John Smith');
      assert.strictEqual(results[0].date, '1926');
      assert.strictEqual(results[0].source, 'Smithsonian');
      assert.strictEqual(results[0].sourceUrl, 'https://www.si.edu/object/saam-12345');
    });

    test('skips rows without online_media', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              {
                title: 'No Media',
                content: {
                  freetext: {},
                  descriptiveNonRepeating: {},
                },
              },
              {
                title: 'Has Media',
                content: {
                  freetext: {
                    name: [{ label: 'Artist', content: 'Jane Doe' }],
                  },
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Images',
                          resources: [
                            { label: 'Screen Image', url: 'https://ids.si.edu/screen.jpg' },
                          ],
                        },
                      ],
                    },
                    record_link: 'https://www.si.edu/object/1',
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 4, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Has Media');
    });

    test('skips media entries that are not Images type', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              {
                title: 'Video Only',
                content: {
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Videos',
                          resources: [{ label: 'Video', url: 'https://example.com/video.mp4' }],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 4, context);

      assert.strictEqual(results.length, 0);
    });

    test('handles missing nested fields with optional chaining (no crashes)', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              {
                title: 'Minimal Entry',
                content: {
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Images',
                          resources: [{ url: 'https://ids.si.edu/minimal.jpg' }],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 4, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Minimal Entry');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].source, 'Smithsonian');
    });

    test('returns empty on API error', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => {
        throw new Error('API timeout');
      });

      const results = await searchSmithsonian('test', 4, context);

      assert.deepStrictEqual(results, []);
    });

    test('respects limit parameter', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      const makeRow = (id, title) => ({
        id,
        title,
        content: {
          descriptiveNonRepeating: {
            online_media: {
              media: [
                {
                  type: 'Images',
                  resources: [{ label: 'Screen Image', url: `https://ids.si.edu/${id}.jpg` }],
                },
              ],
            },
            record_link: `https://www.si.edu/object/${id}`,
          },
        },
      });

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              makeRow('1', 'Item 1'),
              makeRow('2', 'Item 2'),
              makeRow('3', 'Item 3'),
              makeRow('4', 'Item 4'),
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 2, context);

      assert.strictEqual(results.length, 2);
    });

    test('prefers Screen Image over other resource labels', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              {
                title: 'Multi-res',
                content: {
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Images',
                          resources: [
                            { label: 'High Resolution', url: 'https://ids.si.edu/highres.jpg' },
                            { label: 'Screen Image', url: 'https://ids.si.edu/screen.jpg' },
                            { label: 'Thumbnail', url: 'https://ids.si.edu/thumb.jpg' },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 4, context);

      assert.strictEqual(results[0].url, 'https://ids.si.edu/screen.jpg');
      assert.strictEqual(results[0].thumbnailUrl, 'https://ids.si.edu/thumb.jpg');
    });

    test('provides default values for missing fields', async () => {
      const { searchSmithsonian } = require('../../src/services/smithsonianService');
      const context = { apiKeys: { smithsonian: 'test-key' } };

      mockAxiosGet.mock.mockImplementation(async () => ({
        data: {
          status: 200,
          response: {
            rows: [
              {
                content: {
                  descriptiveNonRepeating: {
                    online_media: {
                      media: [
                        {
                          type: 'Images',
                          resources: [{ url: 'https://ids.si.edu/img.jpg' }],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      }));

      const results = await searchSmithsonian('test', 1, context);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Untitled');
      assert.strictEqual(results[0].artist, 'Unknown');
      assert.strictEqual(results[0].date, '');
      assert.strictEqual(results[0].source, 'Smithsonian');
    });
  });
});

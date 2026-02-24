/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test, beforeEach, afterEach, mock } = require('node:test');

let storyboardRouter;
let mockMoodBoardService;
let mockYoutubeService;

function getHandler(router, path, method = 'get') {
  const layer = router.stack.find((l) => l.route && l.route.path === path);
  if (!layer) throw new Error(`No route found for ${path}`);
  const methodLayer = layer.route.stack.find((l) => l.method === method);
  return methodLayer.handle;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this._json = obj;
      return this;
    },
  };
  return res;
}

beforeEach(() => {
  // Clear module caches
  delete require.cache[require.resolve('../../src/routes/storyboard')];
  delete require.cache[require.resolve('../../src/services/moodBoardService')];
  delete require.cache[require.resolve('../../src/services/youtubeService')];

  // Create mock services
  mockMoodBoardService = {
    getMoodBoardImages: mock.fn(async () => ({
      images: [
        { url: 'https://example.com/image1.jpg' },
        { url: 'https://example.com/image2.jpg' },
      ],
    })),
  };

  mockYoutubeService = {
    searchYouTube: mock.fn(async () => [
      { url: 'https://youtube.com/watch?v=abc123' },
      { url: 'https://youtube.com/watch?v=def456' },
    ]),
  };

  // Mock the services
  require.cache[require.resolve('../../src/services/moodBoardService')] = {
    exports: mockMoodBoardService,
  };
  require.cache[require.resolve('../../src/services/youtubeService')] = {
    exports: mockYoutubeService,
  };
});

afterEach(() => {
  // Clear mocks
  delete require.cache[require.resolve('../../src/routes/storyboard')];
  delete require.cache[require.resolve('../../src/services/moodBoardService')];
  delete require.cache[require.resolve('../../src/services/youtubeService')];
});

describe('storyboard routes', () => {
  describe('GET /', () => {
    test('returns combined images and videos', async () => {
      storyboardRouter = require('../../src/routes/storyboard');
      const handler = getHandler(storyboardRouter, '/');

      const req = { query: { query: 'sunset beach' } };
      const res = createMockRes();
      const next = mock.fn();

      await handler(req, res, next);

      assert.ok(res._json);
      assert.ok(Array.isArray(res._json.images));
      assert.ok(Array.isArray(res._json.videos));
      assert.strictEqual(res._json.images.length, 2);
      assert.strictEqual(res._json.videos.length, 2);
      assert.strictEqual(res._json.images[0], 'https://example.com/image1.jpg');
      assert.strictEqual(res._json.videos[0], 'https://youtube.com/watch?v=abc123');
    });

    test('uses empty string for missing query parameter', async () => {
      storyboardRouter = require('../../src/routes/storyboard');
      const handler = getHandler(storyboardRouter, '/');

      const req = { query: {} };
      const res = createMockRes();
      const next = mock.fn();

      await handler(req, res, next);

      assert.ok(res._json);
    });

    test('calls next with error on service failure', async () => {
      // Override mock to throw error
      mockMoodBoardService.getMoodBoardImages = mock.fn(async () => {
        throw new Error('API rate limit exceeded');
      });

      storyboardRouter = require('../../src/routes/storyboard');
      const handler = getHandler(storyboardRouter, '/');

      const req = { query: { query: 'test' } };
      const res = createMockRes();
      let nextError = null;
      const next = (err) => {
        nextError = err;
      };

      await handler(req, res, next);

      assert.ok(nextError instanceof Error);
      assert.ok(nextError.message.includes('rate limit'));
    });

    test('extracts only URLs from service responses', async () => {
      // Mock services return objects with additional metadata
      mockMoodBoardService.getMoodBoardImages = mock.fn(async () => ({
        images: [
          { url: 'https://example.com/img1.jpg', width: 800, height: 600 },
          { url: 'https://example.com/img2.jpg', width: 1024, height: 768 },
        ],
      }));

      mockYoutubeService.searchYouTube = mock.fn(async () => [
        { url: 'https://youtube.com/v1', title: 'Video 1', duration: 120 },
        { url: 'https://youtube.com/v2', title: 'Video 2', duration: 300 },
      ]);

      storyboardRouter = require('../../src/routes/storyboard');
      const handler = getHandler(storyboardRouter, '/');

      const req = { query: { query: 'nature' } };
      const res = createMockRes();
      const next = mock.fn();

      await handler(req, res, next);

      // Should only have URL strings, not full objects
      assert.strictEqual(typeof res._json.images[0], 'string');
      assert.strictEqual(typeof res._json.videos[0], 'string');
      assert.ok(!res._json.images[0].width);
    });
  });
});

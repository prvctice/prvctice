/* eslint-disable import/extensions */
const test = require('node:test');
const assert = require('node:assert/strict');

// Mock the storage module before importing the router
const mockStorage = {
  __ensureReady: async () => {},
  blobs: {
    getById: async () => null,
    get: () => null,
  },
};

// Override the storage module
require.cache[require.resolve('../../src/storage/node/sqlite')] = {
  id: require.resolve('../../src/storage/node/sqlite'),
  exports: mockStorage,
};

// Helper to get route handler
function getHandler(router, path, method = 'get') {
  // Handle parameterized routes like /:fileId
  const layer = router.stack.find((l) => {
    if (!l.route) return false;
    // Match exact path or parameterized path
    return l.route.path === path || (path.includes(':') && l.route.path === path);
  });
  if (!layer) {
    // For parameterized routes, find by pattern
    const paramLayer = router.stack.find(
      (l) => l.route && l.route.path && l.route.path.includes(':')
    );
    if (!paramLayer) throw new Error(`No route found for ${path}`);
    const methodLayer = paramLayer.route.stack.find((l) => l.method === method);
    return methodLayer.handle;
  }
  const methodLayer = layer.route.stack.find((l) => l.method === method);
  if (!methodLayer) throw new Error(`No ${method} handler for ${path}`);
  return methodLayer.handle;
}

// Mock response object with headers support
function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    sentData: null,
    headers: {},
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  res.send = (data) => {
    res.sentData = data;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  return res;
}

test('GET /:fileId returns 400 when fileId is missing', async () => {
  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: '' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonData, { error: 'File ID is required.' });
});

test('GET /:fileId returns 404 when blob not found', async () => {
  mockStorage.blobs.getById = async () => null;

  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: 'nonexistent-id' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.jsonData, { error: 'File not found.' });
});

test('GET /:fileId returns 404 when file content not found', async () => {
  mockStorage.blobs.getById = async () => ({
    id: 'test-id',
    mime: 'image/png',
  });
  mockStorage.blobs.get = () => null;

  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: 'test-id' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.jsonData, { error: 'File content not found.' });
});

test('GET /:fileId returns file with correct headers', async () => {
  const fileBuffer = Buffer.from('fake image data');
  mockStorage.blobs.getById = async () => ({
    id: 'test-id',
    mime: 'image/png',
  });
  mockStorage.blobs.get = () => fileBuffer;

  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: 'test-id' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.equal(res.headers['Content-Length'], fileBuffer.length);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=3600');
  assert.deepEqual(res.sentData, fileBuffer);
});

test('GET /:fileId uses default mime type when not specified', async () => {
  const fileBuffer = Buffer.from('binary data');
  mockStorage.blobs.getById = async () => ({
    id: 'test-id',
    // No mime type
  });
  mockStorage.blobs.get = () => fileBuffer;

  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: 'test-id' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/octet-stream');
});

test('GET /:fileId returns 500 on storage error', async () => {
  mockStorage.__ensureReady = async () => {
    throw new Error('Storage connection failed');
  };

  // Clear require cache to get fresh router with new mock
  delete require.cache[require.resolve('../../src/routes/files')];
  const router = require('../../src/routes/files');
  const handler = getHandler(router, '/:fileId');

  const req = { params: { fileId: 'test-id' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.jsonData, { error: 'Failed to load attachment.' });

  // Restore mock
  mockStorage.__ensureReady = async () => {};
});

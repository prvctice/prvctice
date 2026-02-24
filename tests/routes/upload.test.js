/* eslint-disable import/extensions */
const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');

// Import router, utilities, and stub file operations
const uploadRouter = require('../../src/routes/upload');
const fileUtils = require('../../src/utils/fileUtils');
const storage = require('../../src/storage/node/sqlite');
// Prevent actual file IO by stubbing fs.readFileSync
const fs = require('fs');
const originalReadFileSync = fs.readFileSync;
const originalEnv = { ...process.env };
const originalGetExtension = fileUtils.getExtension;
const originalRenameFile = fileUtils.renameFile;
const originalDeleteFile = fileUtils.deleteFile;
const originalBlobs = storage.blobs;

beforeEach(() => {
  // Set test environment to disable deduplication
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'test-key';
  fs.readFileSync = () => Buffer.from('fake image data');
});

afterEach(() => {
  fs.readFileSync = originalReadFileSync;
  fileUtils.getExtension = originalGetExtension;
  fileUtils.renameFile = originalRenameFile;
  fileUtils.deleteFile = originalDeleteFile;
  storage.blobs = originalBlobs;
  process.env = originalEnv;
});

// Extract POST handlers for '/' route
function getPostHandlers(router) {
  const layer = router.stack.find((l) => l.route && l.route.path === '/');
  const postLayers = layer.route.stack.filter((l) => l.method === 'post');
  return postLayers.map((l) => l.handle);
}

const [uploadMiddleware, uploadHandler] = getPostHandlers(uploadRouter);

// Mock response object
function createMockRes() {
  const res = {};
  res.statusCode = 200;
  res.jsonData = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  return res;
}

// Test: No file provided
test('uploadHandler returns 400 when no file is provided', async () => {
  const req = { file: undefined };
  const res = createMockRes();
  await uploadHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.jsonData, { error: 'No file uploaded.' });
});

// Test: Unsupported file type (getExtension returns falsy)
test('uploadHandler returns 400 for unsupported file type', async () => {
  const req = {
    file: { mimetype: 'application/x-foo', originalname: 'test.foo', path: '/tmp/file' },
  };
  const res = createMockRes();
  await uploadHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.jsonData, { error: 'Unsupported file type.' });
});

// Test: Successful upload flow
test('uploadHandler returns success and fileId for valid image', async () => {
  // Stub file utilities
  fileUtils.getExtension = () => 'png';
  const fakePath = '/fake/path/file.png';
  fileUtils.renameFile = async () => fakePath;
  fileUtils.deleteFile = () => {};
  // Stub local blob storage
  storage.blobs = {
    put: async () => ({ id: 'blob123', size: 100 }),
  };
  const req = {
    file: { mimetype: 'image/png', originalname: 'test.png', path: '/tmp/uploadedfile' },
  };
  const res = createMockRes();
  await uploadHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.jsonData.success, 'expected success true');
  assert.strictEqual(res.jsonData.fileId, 'blob123');
  assert.strictEqual(res.jsonData.filename, 'test.png');
});

// Test: Storage returns no id
test('uploadHandler returns 500 when storage returns no id', async () => {
  fileUtils.getExtension = () => 'png';
  fileUtils.renameFile = async () => '/fake/path/file.png';
  fileUtils.deleteFile = () => {};
  storage.blobs = { put: async () => ({}) };
  const req = {
    file: { mimetype: 'image/png', originalname: 'test.png', path: '/tmp/uploadedfile' },
  };
  const res = createMockRes();
  await uploadHandler(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.jsonData.error, 'expected error message');
});

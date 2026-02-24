import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { webcrypto as nodeCrypto } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexedModuleUrl = pathToFileURL(path.resolve(__dirname, '../web/storage/storage.js')).href;

function createFileHandle() {
  let storedBlob = null;
  return {
    async createWritable() {
      return {
        async write(data) {
          storedBlob = data instanceof Blob ? data : new Blob([data]);
        },
        async close() {},
      };
    },
    async getFile() {
      if (!storedBlob) {
        const err = new Error('NotFoundError');
        err.name = 'NotFoundError';
        throw err;
      }
      return storedBlob;
    },
  };
}

function createDirectoryHandle() {
  const files = new Map();
  return {
    async getFileHandle(name, options = {}) {
      if (!files.has(name)) {
        if (!options.create) {
          const err = new Error('NotFoundError');
          err.name = 'NotFoundError';
          throw err;
        }
        files.set(name, createFileHandle());
      }
      return files.get(name);
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
}

function createOpfsRoot() {
  const dirs = new Map();
  return {
    async getDirectoryHandle(name, options = {}) {
      if (!dirs.has(name)) {
        if (!options.create) {
          const err = new Error('NotFoundError');
          err.name = 'NotFoundError';
          throw err;
        }
        dirs.set(name, createDirectoryHandle());
      }
      return dirs.get(name);
    },
  };
}

test('indexed storage facade supports kv, docs, and blobs', async () => {
  await import('fake-indexeddb/auto');
  if (typeof globalThis.crypto === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
      value: nodeCrypto,
      configurable: true,
      writable: false,
    });
  }
  const opfsRoot = createOpfsRoot();
  const originalNavigatorDefined = typeof globalThis.navigator !== 'undefined';
  const originalStorage = originalNavigatorDefined ? globalThis.navigator.storage : undefined;
  if (!originalNavigatorDefined) {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
  }
  globalThis.navigator.storage = {
    getDirectory: async () => opfsRoot,
  };

  // Bust the module cache to ensure clean state for each run
  const storageModule = await import(`${indexedModuleUrl}?${Date.now()}`);
  const {
    kvSet,
    kvGet,
    kvRemove,
    docPut,
    docGet,
    docDelete,
    docList,
    blobPut,
    blobGet,
    blobRemove,
  } = storageModule;

  await kvSet('greeting', 'hello');
  assert.equal(await kvGet('greeting'), 'hello');
  await kvRemove('greeting');
  assert.equal(await kvGet('greeting'), undefined);

  await docPut('conversations', { id: 'c1', title: 'Chat' });
  const fetched = await docGet('conversations', 'c1');
  assert.equal(fetched.title, 'Chat');
  const listed = await docList('conversations');
  assert.equal(listed.length, 1);
  await docDelete('conversations', 'c1');
  assert.equal(await docGet('conversations', 'c1'), undefined);

  const record = await blobPut(new Blob(['hello world'], { type: 'text/plain' }));
  assert.ok(record.hash, 'blob hash generated');
  const retrieved = await blobGet(record);
  assert.equal(await retrieved.text(), 'hello world');
  await blobRemove(record);
  await assert.rejects(() => blobGet(record), /NotFound/i);
  assert.equal(await docGet('blobs', record.hash), undefined);

  if (!originalNavigatorDefined) {
    delete globalThis.navigator;
  } else if (typeof originalStorage === 'undefined') {
    delete globalThis.navigator.storage;
  } else {
    globalThis.navigator.storage = originalStorage;
  }
});

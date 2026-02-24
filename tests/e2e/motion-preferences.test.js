const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Store mocked storage values
let mockStorageValues = {};

// Set up browser globals before any imports
function setupGlobals(initialStorage = {}) {
  mockStorageValues = { ...initialStorage };

  // Mock document for storage.ts event listener setup
  global.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
  };

  // Mock localStorage
  const localStorageImpl = {
    getItem: (key) => (key in mockStorageValues ? String(mockStorageValues[key]) : null),
    setItem: (key, value) => {
      mockStorageValues[key] = String(value);
    },
    removeItem: (key) => {
      delete mockStorageValues[key];
    },
    clear: () => {
      mockStorageValues = {};
    },
    get length() {
      return Object.keys(mockStorageValues).length;
    },
    key: (i) => Object.keys(mockStorageValues)[i] || null,
  };

  global.localStorage = localStorageImpl;

  // Mock window with minimal required properties
  global.window = {
    localStorage: localStorageImpl,
    prvStorage: {
      get: (key) => localStorageImpl.getItem(key),
      set: (key, value) => {
        localStorageImpl.setItem(key, value);
        return value == null ? null : String(value);
      },
      remove: (key) => localStorageImpl.removeItem(key),
    },
  };

  // Mock Storage constructor for storage.ts to bind methods
  global.Storage = class Storage {};
  global.Storage.prototype = {
    getItem: localStorageImpl.getItem,
    setItem: localStorageImpl.setItem,
    removeItem: localStorageImpl.removeItem,
    clear: localStorageImpl.clear,
  };
}

// Initialize globals before module imports
setupGlobals();

const visualsModuleUrl = pathToFileURL(path.resolve(__dirname, '../../web/utils/visuals.ts')).href;

test('canStartDotMatrix motion gating', async (t) => {
  // Import the module (will be cached, but that's OK - we mock the underlying storage)
  const module = await import(visualsModuleUrl);
  const exports = module.default || module['module.exports'] || module;
  const { canStartDotMatrix } = exports;

  // Also get the storage module so we can directly set values in its mirror
  const storageModuleUrl = pathToFileURL(
    path.resolve(__dirname, '../../web/storage/storage.ts')
  ).href;
  const storageModule = await import(storageModuleUrl);
  const storage = storageModule.storage || storageModule.default?.storage;

  await t.test('respects dotMatrixMotion.isReduced()', () => {
    setupGlobals();
    window.dotMatrixMotion = { isReduced: () => true };
    assert.equal(canStartDotMatrix(), false);
  });

  await t.test('honours stored reduce-effects preference', async () => {
    // Set up globals fresh
    setupGlobals();
    delete window.dotMatrixMotion;

    // Set preference via storage.mirror.set which updates mirrorCache
    if (storage && storage.mirror) {
      await storage.mirror.set('dotMatrixReduceEffects', 'true');
    }
    assert.equal(canStartDotMatrix(), false);

    // Now test with 'false'
    if (storage && storage.mirror) {
      await storage.mirror.set('dotMatrixReduceEffects', 'false');
    }
    assert.equal(canStartDotMatrix(), true);
  });

  await t.test('falls back to matchMedia when no explicit preference', async () => {
    setupGlobals();
    delete window.dotMatrixMotion;

    // Remove any stored preference
    if (storage && storage.mirror) {
      await storage.mirror.remove('dotMatrixReduceEffects');
    }

    window.matchMedia = () => ({ matches: true });
    assert.equal(canStartDotMatrix(), false);

    window.matchMedia = () => ({ matches: false });
    assert.equal(canStartDotMatrix(), true);
  });
});

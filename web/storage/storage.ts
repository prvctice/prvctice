/**
 * Unified storage module for prvctice.
 *
 * Consolidates:
 * - IndexedDB operations (kv, docs, blobs)
 * - OPFS blob storage
 * - localStorage mirror/shim
 * - Legacy data migration
 */

import { logError } from '@web/utils/debugLog.js';

// =============================================================================
// Types
// =============================================================================

interface IndexDef {
  name: string;
  keyPath: string;
  options?: IDBIndexParameters;
}

interface StoreDef {
  name: string;
  options?: IDBObjectStoreParameters;
  indexes?: IndexDef[];
}

interface BlobRef {
  id?: string;
  hash: string;
}

interface BlobRecord {
  id: string;
  hash: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  v: number;
  [key: string]: unknown;
}

interface DocRecord {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  conversationId?: string;
  [key: string]: unknown;
}

interface ListOptions {
  limit?: number;
  since?: number;
  index?: string | { conversationId?: string; value?: string; since?: number; updatedAt?: number };
}

interface MirrorOptions {
  skipNative?: boolean;
}

interface PrvStorage {
  __shimVersion: number;
  get: (key: string) => string | null;
  set: (key: string, value: unknown) => string | null;
  remove: (key: string) => void;
  keys: () => string[];
  dump: () => Record<string, string>;
}

interface ClearResult {
  success: boolean;
  errors?: string[];
}

interface EnsureOpfsRootFn {
  (): Promise<FileSystemDirectoryHandle>;
  rootPromise?: Promise<FileSystemDirectoryHandle>;
}

interface InstallLegacyShimFn {
  (): void;
  __patched?: boolean;
}

// Extend window
declare global {
  interface Window {
    prvStorage?: PrvStorage;
  }
}

// =============================================================================
// Constants
// =============================================================================

const DB_NAME = 'prvctice';
const DB_VERSION = 4;

const STORE_DEFS: StoreDef[] = [
  { name: 'kv' },
  {
    name: 'conversations',
    options: { keyPath: 'id' },
    indexes: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
  },
  {
    name: 'messages',
    options: { keyPath: 'id' },
    indexes: [
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'conversationId', keyPath: 'conversationId', options: { unique: false } },
    ],
  },
  { name: 'blobs', options: { keyPath: 'id' } },
];

const MIRROR_KEY = 'mirror/localStorage';
const MIRROR_SAVE_DEBOUNCE_MS = 200;
const MIGRATION_FLAG_KEY = 'migrations/localStorage:v1';

export const LEGACY_KEYS: readonly string[] = [
  'apiKeys',
  'anthropicApiKey',
  'chatReasoningEffort',
  'customSkills',
  'dotMatrixReduceEffects',
  'dotMatrixSizePreference',
  'geminiApiKey',
  'graphicsQualityTier',
  'hardwareAccelerationEnabled',
  'hiddenSkills',
  'llmProvider',
  'model:anthropic',
  'model:gemini',
  'model:google',
  'model:openai',
  'openaiApiKey',
  'prv_conversations',
  'prv_hasOnboarded',
  'prv_lastRoute',
  'prv_model',
  'prv_theme',
  'prvcticeNotes',
  'prvcticeNotesHistory',
  'showRulerPreference',
  'theme',
  'uiFontSize',
  'uiLineHeight',
  'uiSpellCheck',
  'weatherWidgetPrefs',
];

// =============================================================================
// Module State
// =============================================================================

let mirrorCache: Record<string, string> = {};
let mirrorLoaded = false;
let storageInitialized = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let syncingNative = false;
let nativeSetItem: ((key: string, value: string) => void) | null = null;
let nativeGetItem: ((key: string) => string | null) | null = null;
let nativeRemoveItem: ((key: string) => void) | null = null;
let nativeClear: (() => void) | null = null;

export function isStorageInitialized(): boolean {
  return storageInitialized;
}

// =============================================================================
// IndexedDB Helpers
// =============================================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const def of STORE_DEFS) {
        if (!db.objectStoreNames.contains(def.name)) {
          const store = db.createObjectStore(def.name, def.options || undefined);
          if (def.indexes) {
            for (const idx of def.indexes) {
              store.createIndex(idx.name, idx.keyPath, idx.options || undefined);
            }
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => T | Promise<T>
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result: T | Promise<T>;
    try {
      result = fn(store, tx);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
  });
}

function iterateCursor<T>(
  index: IDBIndex,
  range: IDBKeyRange | null,
  direction: IDBCursorDirection | null,
  limit = 1000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const items: T[] = [];
    const request = index.openCursor(range || null, direction || 'next');
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor || items.length >= limit) {
        resolve(items);
        return;
      }
      items.push(cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

// =============================================================================
// KV Store Operations
// =============================================================================

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  return withStore('kv', 'readonly', (store) => requestToPromise(store.get(key))) as Promise<
    T | undefined
  >;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  return withStore('kv', 'readwrite', (store) => {
    store.put(value, key);
  });
}

export async function kvRemove(key: string): Promise<void> {
  return withStore('kv', 'readwrite', (store) => {
    store.delete(key);
  });
}

// =============================================================================
// Document Store Operations
// =============================================================================

export async function docGet<T = DocRecord>(storeName: string, id: string): Promise<T | undefined> {
  return withStore(storeName, 'readonly', (store) => requestToPromise(store.get(id))) as Promise<
    T | undefined
  >;
}

export async function docPut<T extends DocRecord>(storeName: string, doc: T): Promise<T> {
  const now = Date.now();
  const record = { ...doc, updatedAt: now } as T;
  if (!record.createdAt) record.createdAt = now;
  return withStore(storeName, 'readwrite', (store) => {
    store.put(record);
    return record;
  });
}

export async function docDelete(storeName: string, id: string): Promise<void> {
  return withStore(storeName, 'readwrite', (store) => {
    store.delete(id);
  });
}

function applyFilters<T extends DocRecord>(rows: T[], storeName: string, opts: ListOptions): T[] {
  const limit = Number.isFinite(opts.limit) ? opts.limit! : 1000;
  const since = Number.isFinite(opts.since) ? opts.since! : null;
  let out = rows.slice();

  if (storeName === 'messages' && opts.index && typeof opts.index === 'object') {
    const indexObj = opts.index as {
      conversationId?: string;
      value?: string;
      since?: number;
      updatedAt?: number;
    };
    const convId = indexObj.conversationId || indexObj.value;
    if (convId) {
      out = out.filter((row) => row.conversationId === convId);
    }
    const indexSince = Number.isFinite(indexObj.since)
      ? indexObj.since!
      : Number.isFinite(indexObj.updatedAt)
        ? indexObj.updatedAt!
        : since;
    if (indexSince) {
      out = out.filter((row) => (row.updatedAt || 0) >= indexSince);
    }
  } else if (opts.index === 'updatedAt' && since) {
    out = out.filter((row) => (row.updatedAt || 0) >= since);
  } else if (since) {
    out = out.filter((row) => (row.updatedAt || 0) >= since);
  }

  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out.slice(0, limit);
}

export async function docList<T extends DocRecord>(
  storeName: string,
  opts: ListOptions = {}
): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const limit = Number.isFinite(opts.limit) ? opts.limit! : 1000;

  if (opts.index === 'updatedAt') {
    const idx = store.index('updatedAt');
    const range = Number.isFinite(opts.since) ? IDBKeyRange.lowerBound(opts.since!) : null;
    return iterateCursor<T>(idx, range, 'prev', limit);
  }

  if (storeName === 'messages' && opts.index && typeof opts.index === 'object') {
    const indexObj = opts.index as {
      conversationId?: string;
      value?: string;
      since?: number;
      updatedAt?: number;
    };
    const convId = indexObj.conversationId || indexObj.value;
    if (convId) {
      const idx = store.index('conversationId');
      const range = IDBKeyRange.only(convId);
      const rows = await iterateCursor<T>(idx, range, 'prev', limit);
      const since = Number.isFinite(indexObj.since)
        ? indexObj.since!
        : Number.isFinite(indexObj.updatedAt)
          ? indexObj.updatedAt!
          : Number.isFinite(opts.since)
            ? opts.since!
            : null;
      return since ? rows.filter((row) => (row.updatedAt || 0) >= since) : rows;
    }
  }

  const all = await requestToPromise(store.getAll());
  return applyFilters(all as T[], storeName, opts);
}

// =============================================================================
// OPFS Blob Storage
// =============================================================================

const ensureOpfsRoot: EnsureOpfsRootFn = async function (): Promise<FileSystemDirectoryHandle> {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('OPFS unsupported in this environment');
  }
  if (!ensureOpfsRoot.rootPromise) {
    ensureOpfsRoot.rootPromise = navigator.storage.getDirectory();
  }
  return ensureOpfsRoot.rootPromise;
};

async function toArrayBuffer(data: ArrayBuffer | Blob | ArrayBufferView): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Blob) return data.arrayBuffer();
  if (ArrayBuffer.isView(data)) {
    const view = data;
    return (view.buffer as ArrayBuffer).slice(view.byteOffset, view.byteOffset + view.byteLength);
  }
  throw new TypeError('Unsupported blob data');
}

async function digestHex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function blobPut(
  data: ArrayBuffer | Blob | ArrayBufferView,
  mime = 'application/octet-stream'
): Promise<BlobRecord> {
  const buffer = await toArrayBuffer(data);
  const hash = await digestHex(buffer);
  const root = await ensureOpfsRoot();
  const dir = await root.getDirectoryHandle('blobs', { create: true });
  const handle = await dir.getFileHandle(hash, { create: true });
  const writable = await handle.createWritable();
  await writable.write(new Blob([buffer], { type: mime }));
  await writable.close();
  const record: BlobRecord = {
    id: hash,
    hash,
    mime,
    size: buffer.byteLength,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    v: 1,
  };
  await docPut('blobs', record);
  return record;
}

export async function blobGet(ref: BlobRef | null): Promise<File | null> {
  if (!ref?.hash) return null;
  const root = await ensureOpfsRoot();
  const dir = await root.getDirectoryHandle('blobs');
  const handle = await dir.getFileHandle(ref.hash);
  return handle.getFile();
}

export async function blobRemove(ref: BlobRef | null): Promise<void> {
  if (!ref?.hash) return;
  const root = await ensureOpfsRoot();
  const dir = await root.getDirectoryHandle('blobs');
  try {
    await dir.removeEntry(ref.hash);
  } catch (_) {}
  await docDelete('blobs', ref.id || ref.hash);
}

export async function blobExists(hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    const root = await ensureOpfsRoot();
    const dir = await root.getDirectoryHandle('blobs');
    await dir.getFileHandle(hash);
    return true;
  } catch (_) {
    return false;
  }
}

export async function blobGetByHash(hash: string): Promise<File | null> {
  if (!hash) return null;
  try {
    const root = await ensureOpfsRoot();
    const dir = await root.getDirectoryHandle('blobs');
    const handle = await dir.getFileHandle(hash);
    return handle.getFile();
  } catch (_) {
    return null;
  }
}

export async function clearAllStores(): Promise<void> {
  const db = await openDB();
  const storeNames = STORE_DEFS.map((def) => def.name);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearOPFSBlobs(): Promise<void> {
  try {
    const root = await ensureOpfsRoot();
    const dir = await root.getDirectoryHandle('blobs');
    for await (const entry of dir as unknown as AsyncIterable<FileSystemHandle>) {
      await dir.removeEntry(entry.name);
    }
  } catch (err) {
    logError('storage', 'opfs:clearBlobs', err as Error);
  }
}

// =============================================================================
// localStorage Mirror
// =============================================================================

async function loadMirror(): Promise<Record<string, string>> {
  if (!mirrorLoaded) {
    mirrorCache = (await kvGet<Record<string, string>>(MIRROR_KEY)) || {};
    mirrorLoaded = true;
  }
  return mirrorCache;
}

function scheduleMirrorSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await kvSet(MIRROR_KEY, { ...mirrorCache });
    } catch (err) {
      logError('storage', 'mirror:persist', err as Error);
    }
  }, MIRROR_SAVE_DEBOUNCE_MS);
}

function mirrorGet(key: string): string | null {
  if (key in mirrorCache) return mirrorCache[key] ?? null;
  if (nativeGetItem) {
    try {
      return nativeGetItem.call(window.localStorage, key);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function mirrorSet(key: string, value: unknown, options: MirrorOptions = {}): void {
  const stringValue = value === null || value === undefined ? null : String(value);
  if (stringValue === null) {
    delete mirrorCache[key];
  } else {
    mirrorCache[key] = stringValue;
  }
  if (!options.skipNative && nativeSetItem && nativeRemoveItem) {
    syncingNative = true;
    try {
      if (stringValue === null) {
        nativeRemoveItem.call(window.localStorage, key);
      } else {
        nativeSetItem.call(window.localStorage, key, stringValue);
      }
    } catch (err) {
      logError('storage', 'mirror:toLocalStorage', err as Error);
    } finally {
      syncingNative = false;
    }
  }
  scheduleMirrorSave();
}

function mirrorRemove(key: string, options: MirrorOptions = {}): void {
  mirrorSet(key, null, options);
}

function mirrorClear(options: MirrorOptions = {}): void {
  mirrorCache = {};
  if (!options.skipNative && nativeClear) {
    syncingNative = true;
    try {
      nativeClear.call(window.localStorage);
    } catch (err) {
      logError('storage', 'mirror:clearLocalStorage', err as Error);
    } finally {
      syncingNative = false;
    }
  }
}

// =============================================================================
// Legacy Data Migration
// =============================================================================

async function migrateLocalData(): Promise<Record<string, string>> {
  const already = await kvGet<boolean>(MIGRATION_FLAG_KEY);
  const existing = { ...mirrorCache };

  if (already) {
    return existing;
  }

  const snapshot: Record<string, string> = { ...existing };
  if (typeof window !== 'undefined' && window.localStorage) {
    for (const key of LEGACY_KEYS) {
      try {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
          snapshot[key] = value;
        }
      } catch (_) {}
    }
  }

  mirrorCache = { ...snapshot };
  await kvSet(MIRROR_KEY, mirrorCache);
  await kvSet(MIGRATION_FLAG_KEY, true);
  return snapshot;
}

// =============================================================================
// Legacy Shim
// =============================================================================

export const installLegacyShim: InstallLegacyShimFn = function installLegacyShim(): void {
  if (typeof window === 'undefined') return;
  if (window.prvStorage && window.prvStorage.__shimVersion === 1) return;

  if (typeof Storage !== 'undefined' && Storage.prototype) {
    if (!nativeSetItem) {
      nativeSetItem = Storage.prototype.setItem;
      nativeGetItem = Storage.prototype.getItem;
      nativeRemoveItem = Storage.prototype.removeItem;
      nativeClear = Storage.prototype.clear;
    }

    if (!(installLegacyShim as InstallLegacyShimFn).__patched) {
      Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
        if (!syncingNative) {
          mirrorSet(key, value, { skipNative: true });
        }
        return nativeSetItem!.call(this, key, value);
      };
      Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
        if (!syncingNative) {
          mirrorRemove(key, { skipNative: true });
        }
        return nativeRemoveItem!.call(this, key);
      };
      Storage.prototype.clear = function patchedClear() {
        if (!syncingNative) {
          mirrorClear({ skipNative: true });
        }
        return nativeClear!.call(this);
      };
      Storage.prototype.getItem = function patchedGetItem(key: string): string | null {
        if (!syncingNative && key in mirrorCache) {
          return mirrorCache[key] ?? null;
        }
        return nativeGetItem!.call(this, key);
      };
      (installLegacyShim as InstallLegacyShimFn).__patched = true;
    }
  }

  window.prvStorage = {
    __shimVersion: 1,
    get(key: string): string | null {
      return mirrorGet(key);
    },
    set(key: string, value: unknown): string | null {
      const stringValue = value == null ? null : String(value);
      mirrorSet(key, stringValue);
      return stringValue;
    },
    remove(key: string): void {
      mirrorRemove(key);
    },
    keys(): string[] {
      return Object.keys(mirrorCache);
    },
    dump(): Record<string, string> {
      return { ...mirrorCache };
    },
  };
};

// =============================================================================
// Public API
// =============================================================================

export const storage = {
  kv: {
    get: kvGet,
    set: kvSet,
    remove: kvRemove,
  },
  conversations: {
    get: (id: string) => docGet('conversations', id),
    put: (doc: Record<string, unknown>) => docPut('conversations', doc),
    delete: (id: string) => docDelete('conversations', id),
    list: (opts?: Record<string, unknown>) => docList('conversations', opts),
  },
  messages: {
    get: (id: string) => docGet('messages', id),
    put: (doc: Record<string, unknown>) => docPut('messages', doc),
    delete: (id: string) => docDelete('messages', id),
    list: (opts?: Record<string, unknown>) => docList('messages', opts),
  },
  blobs: {
    put: blobPut,
    get: blobGet,
    remove: blobRemove,
  },
  mirror: {
    load: () => loadMirror().then((m) => ({ ...m })),
    get: mirrorGet,
    set: (key: string, value: unknown): Promise<void> => {
      mirrorSet(key, value);
      return Promise.resolve();
    },
    remove: (key: string): Promise<void> => {
      mirrorRemove(key);
      return Promise.resolve();
    },
    getJSON: <T = unknown>(key: string, fallback: T | null = null): T | null => {
      const raw = mirrorGet(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch (err) {
        logError('storage', `mirror:getJSON:${key}`, err as Error);
        return fallback;
      }
    },
    setJSON: (key: string, value: unknown): Promise<void> => {
      if (value == null) {
        mirrorRemove(key);
        return Promise.resolve();
      }
      try {
        const serialised = typeof value === 'string' ? value : JSON.stringify(value);
        mirrorSet(key, serialised);
      } catch (err) {
        logError('storage', `mirror:setJSON:${key}`, err as Error);
      }
      return Promise.resolve();
    },
  },
};

export async function initializeStorage(): Promise<void> {
  await loadMirror();
  const migrated = await migrateLocalData();
  if (migrated && typeof migrated === 'object') {
    mirrorCache = { ...migrated };
  }
  installLegacyShim();
  storageInitialized = true;

  // Notify modules that storage is ready (lazy import to avoid circular deps)
  try {
    const { useEventBus } = await import('@web/services/eventBus.js');
    useEventBus().emit('storage:initialized', {});
  } catch (_) {
    // Silent - eventBus may not be available in all contexts
  }
}

export async function clearAllData(): Promise<ClearResult> {
  const errors: string[] = [];

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    await clearAllStores();
  } catch (err) {
    logError('storage', 'clearAll:indexedDB', err as Error);
    errors.push('IndexedDB: ' + ((err as Error).message || String(err)));
  }

  try {
    await clearOPFSBlobs();
  } catch (err) {
    logError('storage', 'clearAll:opfs', err as Error);
    errors.push('OPFS: ' + ((err as Error).message || String(err)));
  }

  try {
    mirrorCache = {};
    mirrorLoaded = false;
    if (nativeClear) {
      syncingNative = true;
      try {
        nativeClear.call(window.localStorage);
      } finally {
        syncingNative = false;
      }
    }
  } catch (err) {
    logError('storage', 'clearAll:localStorage', err as Error);
    errors.push('localStorage: ' + ((err as Error).message || String(err)));
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}

/**
 * Connector Cache Layer
 *
 * SQLite-backed cache for backend connector responses.
 * Uses the same prvctice.db database as the main storage layer.
 * Supports stale-data fallback: getCached never deletes stale entries on read.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

// ==================== Types ====================

export interface CacheEntry {
  readonly data: unknown;
  readonly createdAt: number;
  readonly ttlMs: number;
  readonly isStale: boolean;
  readonly ageMs: number;
}

export interface ConnectorResponseMeta {
  readonly fresh: boolean;
  readonly cachedAt: number | null;
  readonly ageMs: number;
  readonly connectorId: string;
  readonly method: string;
}

// ==================== Database Types ====================

interface CacheDatabase {
  pragma(stmt: string): void;
  exec(stmt: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): void;
  };
}

// ==================== DB Connection ====================

/**
 * Resolve the DB file path using the same logic as src/storage/node/sqlite.ts.
 */
function resolveDbPath(): string {
  const dataDir = process.env.DATA_DIR;
  let electronPath: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const electron = require('electron');
    if (electron?.app?.getPath) {
      electronPath = electron.app.getPath('userData') as string;
    }
  } catch {
    // Electron not available
  }
  const baseDir = dataDir || electronPath || process.cwd();
  return path.join(baseDir, 'prvctice.db');
}

let db: CacheDatabase | null = null;
let tableInitialized = false;

/**
 * Lazily open the better-sqlite3 connection and ensure the cache table exists.
 * Returns null if better-sqlite3 is not available (e.g., sql.js fallback).
 */
function getDb(): CacheDatabase | null {
  if (db) {
    if (!tableInitialized) {
      createCacheTable(db);
      tableInitialized = true;
    }
    return db;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Database = require('better-sqlite3');
    const dbPath = resolveDbPath();
    const baseDir = path.dirname(dbPath);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    db = new Database(dbPath) as CacheDatabase;
    db.pragma('journal_mode = WAL');
    createCacheTable(db);
    tableInitialized = true;
    return db;
  } catch {
    // better-sqlite3 not available
    return null;
  }
}

// ==================== Table Setup ====================

function createCacheTable(database: CacheDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS connector_cache (
      key TEXT PRIMARY KEY,
      connector TEXT NOT NULL,
      method TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS ix_cache_connector ON connector_cache(connector)');
}

/**
 * Ensure the cache table exists. Call during server startup or
 * when the connector router initializes. Safe to call multiple times.
 */
export function initCacheTable(): void {
  getDb();
}

// ==================== Cache Key ====================

/**
 * Generate a deterministic cache key from connector, method, params, and optional key hash.
 * Sorts object keys for deterministic JSON serialization.
 */
export function cacheKey(
  connector: string,
  method: string,
  params: unknown,
  keyHash?: string
): string {
  const sortedParams = sortKeys(params);
  const payload = `${connector}:${method}:${JSON.stringify(sortedParams)}:${keyHash || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

// ==================== Cache Operations ====================

/**
 * Read a cache entry. Returns null if not found.
 * Never deletes stale entries -- stale data is the fallback.
 * Synchronous (better-sqlite3 is sync).
 */
export function getCached(key: string): CacheEntry | null {
  const database = getDb();
  if (!database) return null;

  const row = database
    .prepare('SELECT data, created_at, ttl_ms FROM connector_cache WHERE key = ?')
    .get(key) as { data: string; created_at: number; ttl_ms: number } | undefined;

  if (!row) return null;

  const now = Date.now();
  const ageMs = now - (row.created_at as number);
  const isStale = ageMs > (row.ttl_ms as number);

  let data: unknown;
  try {
    data = JSON.parse(row.data as string);
  } catch {
    return null;
  }

  return {
    data,
    createdAt: row.created_at as number,
    ttlMs: row.ttl_ms as number,
    isStale,
    ageMs,
  };
}

/**
 * Write or update a cache entry.
 * Upserts into the connector_cache table.
 */
export function setCached(
  key: string,
  connector: string,
  method: string,
  data: unknown,
  ttlMs: number
): void {
  const database = getDb();
  if (!database) return;

  const serialized = JSON.stringify(data);
  const now = Date.now();

  database
    .prepare(
      `INSERT INTO connector_cache (key, connector, method, data, created_at, ttl_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         data = excluded.data,
         created_at = excluded.created_at,
         ttl_ms = excluded.ttl_ms`
    )
    .run(key, connector, method, serialized, now, ttlMs);
}

/**
 * Delete expired entries with a 2x TTL grace period.
 * Returns the number of deleted entries.
 */
export function evictExpired(): number {
  const database = getDb();
  if (!database) return 0;

  const now = Date.now();

  // Count before deleting
  const countRow = database
    .prepare('SELECT COUNT(*) as cnt FROM connector_cache WHERE created_at + (2 * ttl_ms) < ?')
    .get(now) as { cnt: number } | undefined;

  const count = (countRow?.cnt as number) ?? 0;

  if (count > 0) {
    database.prepare('DELETE FROM connector_cache WHERE created_at + (2 * ttl_ms) < ?').run(now);
  }

  return count;
}

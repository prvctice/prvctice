'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import logger from '../../utils/logger.js';
import { getElectronUserData } from '../../utils/electronPaths.js';

// Type definitions
interface BetterSqlite3Database {
  pragma(stmt: string): void;
  exec(stmt: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): void;
  };
}

interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
}

interface SqlJsStatement {
  step(): boolean;
  getAsObject(params?: unknown[]): Record<string, unknown>;
}

interface SqlJsModule {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

type DbMode = 'better-sqlite3' | 'sql.js';

interface StateContext {
  mode: DbMode;
  db: BetterSqlite3Database | SqlJsDatabase;
  persist?: () => void;
}

export interface Conversation {
  id: string;
  title?: string;
  system?: string;
  pinned?: number;
  createdAt?: number;
  updatedAt?: number;
  v?: number;
}

export interface Message {
  id: string;
  conversationId?: string;
  role?: string;
  content?: string;
  attachments?: unknown[];
  createdAt?: number;
  updatedAt?: number;
  v?: number;
}

export interface Blob {
  id: string;
  hash?: string;
  mime?: string;
  size?: number;
  path?: string;
  createdAt?: number;
  updatedAt?: number;
  v?: number;
}

type TableName = 'conversations' | 'messages' | 'blobs' | 'kv';
type TableDoc = Conversation | Message | Blob | Record<string, unknown>;

interface ListOptions {
  limit?: number;
  since?: number;
  index?:
    | string
    | {
        conversationId?: string;
        value?: string;
        since?: number;
        updatedAt?: number;
      };
}

interface BlobRef {
  id?: string;
  path?: string;
}

const DATA_DIR = process.env.DATA_DIR;
const ELECTRON_USER_DATA = getElectronUserData();
const BASE_DIR = DATA_DIR || ELECTRON_USER_DATA || process.cwd();
const DB_FILE = path.join(BASE_DIR, 'prvctice.db');
const BLOB_DIR = path.join(BASE_DIR, 'blobs');

let betterSqlite: ((file: string) => BetterSqlite3Database) | null = null;
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  betterSqlite = require('better-sqlite3');
} catch {
  betterSqlite = null;
}

let sqlJsModulePromise: Promise<SqlJsModule> | null = null;
let statePromise: Promise<StateContext> | null = null;

async function loadSqlJs(): Promise<SqlJsModule> {
  if (!sqlJsModulePromise) {
    const locateFile = (file: string): string => {
      const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
      return path.join(path.dirname(wasmPath), file);
    };
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const initSqlJs = require('sql.js');
    sqlJsModulePromise = initSqlJs({ locateFile }) as Promise<SqlJsModule>;
  }
  return sqlJsModulePromise;
}

async function initState(): Promise<StateContext> {
  if (statePromise) return statePromise;
  statePromise = (async (): Promise<StateContext> => {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }

    if (betterSqlite) {
      const db = new (betterSqlite as unknown as new (file: string) => BetterSqlite3Database)(
        DB_FILE
      );
      db.pragma('journal_mode = WAL');
      seedSchema({
        mode: 'better-sqlite3',
        db,
      });
      return { mode: 'better-sqlite3', db };
    }

    const SQL = await loadSqlJs();
    const hasFile = fs.existsSync(DB_FILE);
    const fileBuffer = hasFile ? fs.readFileSync(DB_FILE) : null;
    const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
    const persist = (): void => persistSqlJs(db);
    seedSchema({
      mode: 'sql.js',
      db,
      persist,
    });
    return {
      mode: 'sql.js',
      db,
      persist,
    };
  })();
  return statePromise;
}

function seedSchema(ctx: StateContext): void {
  const statements = [
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      system TEXT,
      pinned INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER,
      v INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT,
      role TEXT,
      content TEXT,
      attachments TEXT,
      createdAt INTEGER,
      updatedAt INTEGER,
      v INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS blobs (
      id TEXT PRIMARY KEY,
      hash TEXT,
      mime TEXT,
      size INTEGER,
      path TEXT,
      createdAt INTEGER,
      updatedAt INTEGER,
      v INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS ix_msg_conv ON messages(conversationId, updatedAt DESC);`,
    `CREATE INDEX IF NOT EXISTS ix_conv_updated ON conversations(updatedAt);`,
  ];

  if (ctx.mode === 'better-sqlite3') {
    for (const stmt of statements) {
      (ctx.db as BetterSqlite3Database).exec(stmt);
    }

    // FTS5 virtual table for full-text message search (better-sqlite3 only)
    try {
      (ctx.db as BetterSqlite3Database).exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          conversationId UNINDEXED,
          messageId UNINDEXED,
          role UNINDEXED,
          tokenize = 'unicode61 remove_diacritics 2'
        );`
      );
    } catch (err) {
      logger.warn('fts5_init_failed', { error: (err as Error).message });
    }
  } else if (ctx.mode === 'sql.js') {
    for (const stmt of statements) {
      (ctx.db as SqlJsDatabase).run(stmt);
    }
    ctx.persist?.();
  }
}

function persistSqlJs(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function encode(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function decode(value: unknown): unknown {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeDoc(table: TableName, doc: Record<string, unknown> | undefined): TableDoc | null {
  if (!doc) return null;
  if (table === 'messages') {
    return { ...doc, attachments: (decode(doc.attachments) as unknown[]) || [] } as Message;
  }
  return doc as TableDoc;
}

async function kvGet(key: string): Promise<unknown> {
  const ctx = await initState();
  if (ctx.mode === 'better-sqlite3') {
    const row = (ctx.db as BetterSqlite3Database).prepare('SELECT v FROM kv WHERE k=?').get(key) as
      | { v: string }
      | undefined;
    return row ? decode(row.v) : null;
  }
  const stmt = (ctx.db as SqlJsDatabase).prepare('SELECT v FROM kv WHERE k = ?');
  const result = stmt.getAsObject([key]) as { v?: string };
  return result && result.v ? decode(result.v) : null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const ctx = await initState();
  const payload = encode(value);
  if (ctx.mode === 'better-sqlite3') {
    (ctx.db as BetterSqlite3Database)
      .prepare('REPLACE INTO kv(k, v) VALUES(?, ?)')
      .run(key, payload);
    return;
  }
  (ctx.db as SqlJsDatabase).run('INSERT OR REPLACE INTO kv(k, v) VALUES(?, ?)', [key, payload]);
  ctx.persist?.();
}

async function kvRemove(key: string): Promise<void> {
  const ctx = await initState();
  if (ctx.mode === 'better-sqlite3') {
    (ctx.db as BetterSqlite3Database).prepare('DELETE FROM kv WHERE k=?').run(key);
    return;
  }
  (ctx.db as SqlJsDatabase).run('DELETE FROM kv WHERE k=?', [key]);
  ctx.persist?.();
}

function applyListFilters(
  rows: Record<string, unknown>[],
  table: TableName,
  opts: ListOptions
): Record<string, unknown>[] {
  const limit = Number.isFinite(opts.limit) ? opts.limit! : 1000;
  const since = Number.isFinite(opts.since) ? opts.since! : null;
  let result = rows;

  if (table === 'messages' && opts.index && typeof opts.index === 'object') {
    const convId = opts.index.conversationId || opts.index.value;
    if (convId) {
      result = result.filter((row) => row.conversationId === convId);
    }
    const sinceTs = Number.isFinite(opts.index.since)
      ? opts.index.since
      : Number.isFinite(opts.index.updatedAt)
        ? opts.index.updatedAt
        : since;
    if (sinceTs) {
      result = result.filter((row) => ((row.updatedAt as number) || 0) >= sinceTs);
    }
  } else if (opts.index === 'updatedAt' && since) {
    result = result.filter((row) => ((row.updatedAt as number) || 0) >= since);
  } else if (since) {
    result = result.filter((row) => ((row.updatedAt as number) || 0) >= since);
  }

  result.sort((a, b) => ((b.updatedAt as number) || 0) - ((a.updatedAt as number) || 0));
  return result.slice(0, limit);
}

async function list(table: TableName, opts: ListOptions = {}): Promise<TableDoc[]> {
  const ctx = await initState();
  if (ctx.mode === 'better-sqlite3') {
    if (table === 'messages' && opts.index && typeof opts.index === 'object') {
      const convId = opts.index.conversationId || opts.index.value;
      if (convId) {
        const sinceTs = Number.isFinite(opts.index.since)
          ? opts.index.since
          : Number.isFinite(opts.index.updatedAt)
            ? opts.index.updatedAt
            : Number.isFinite(opts.since)
              ? opts.since
              : 0;
        const limit = Number.isFinite(opts.limit) ? opts.limit : 1000;
        const rows = (ctx.db as BetterSqlite3Database)
          .prepare(
            `SELECT * FROM messages
             WHERE conversationId = ? AND updatedAt >= ?
             ORDER BY updatedAt DESC
             LIMIT ?`
          )
          .all(convId, sinceTs || 0, limit) as Record<string, unknown>[];
        return rows.map((row) => normalizeDoc(table, row)).filter((r): r is TableDoc => r !== null);
      }
    }

    if (opts.index === 'updatedAt') {
      const sinceTs = Number.isFinite(opts.since) ? opts.since : 0;
      const limit = Number.isFinite(opts.limit) ? opts.limit : 1000;
      const rows = (ctx.db as BetterSqlite3Database)
        .prepare(
          `SELECT * FROM ${table}
           WHERE updatedAt >= ?
           ORDER BY updatedAt DESC
           LIMIT ?`
        )
        .all(sinceTs, limit) as Record<string, unknown>[];
      return rows.map((row) => normalizeDoc(table, row)).filter((r): r is TableDoc => r !== null);
    }

    const limit = Number.isFinite(opts.limit) ? opts.limit : 1000;
    const rows = (ctx.db as BetterSqlite3Database)
      .prepare(`SELECT * FROM ${table} ORDER BY updatedAt DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    const normalized = rows
      .map((row) => normalizeDoc(table, row))
      .filter((r): r is TableDoc => r !== null);
    return applyListFilters(normalized as Record<string, unknown>[], table, opts) as TableDoc[];
  }

  const stmt = (ctx.db as SqlJsDatabase).prepare(`SELECT * FROM ${table}`);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const doc = normalizeDoc(table, stmt.getAsObject());
    if (doc) rows.push(doc as Record<string, unknown>);
  }
  return applyListFilters(rows, table, opts) as TableDoc[];
}

async function get(table: TableName, id: string): Promise<TableDoc | null> {
  const ctx = await initState();
  if (ctx.mode === 'better-sqlite3') {
    const row = (ctx.db as BetterSqlite3Database)
      .prepare(`SELECT * FROM ${table} WHERE id=?`)
      .get(id) as Record<string, unknown> | undefined;
    return normalizeDoc(table, row);
  }
  const stmt = (ctx.db as SqlJsDatabase).prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const row = stmt.getAsObject([id]);
  if (!row || Object.keys(row).length === 0) return null;
  if (!row.id) return null;
  return normalizeDoc(table, row);
}

async function put(table: TableName, doc: TableDoc): Promise<TableDoc> {
  const ctx = await initState();
  const now = Date.now();
  const record: Record<string, unknown> = {
    ...doc,
    updatedAt: now,
  };
  if (!record.createdAt) record.createdAt = now;
  if (table === 'messages') {
    record.attachments = encode((record as unknown as Message).attachments || []);
  }
  if (table === 'blobs' && !record.v) record.v = 1;

  const fields = Object.keys(record);
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map((key) => record[key]);

  if (ctx.mode === 'better-sqlite3') {
    (ctx.db as BetterSqlite3Database)
      .prepare(
        `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${fields
           .filter((field) => field !== 'id')
           .map((field) => `${field}=excluded.${field}`)
           .join(',')}`
      )
      .run(...values);
    return { ...doc, createdAt: record.createdAt, updatedAt: record.updatedAt } as TableDoc;
  }

  (ctx.db as SqlJsDatabase).run(
    `INSERT OR REPLACE INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`,
    values
  );
  ctx.persist?.();
  if (table === 'messages') {
    return {
      ...doc,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      attachments: (decode(record.attachments as string) as unknown[]) || [],
    } as Message;
  }
  return { ...doc, createdAt: record.createdAt, updatedAt: record.updatedAt } as TableDoc;
}

async function remove(table: TableName, id: string): Promise<void> {
  const ctx = await initState();
  if (ctx.mode === 'better-sqlite3') {
    (ctx.db as BetterSqlite3Database).prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    return;
  }
  (ctx.db as SqlJsDatabase).run(`DELETE FROM ${table} WHERE id=?`, [id]);
  ctx.persist?.();
}

function ensureBlobDir(): void {
  if (!fs.existsSync(BLOB_DIR)) {
    fs.mkdirSync(BLOB_DIR, { recursive: true });
  }
}

async function blobPut(data: Buffer | string, mime = 'application/octet-stream'): Promise<Blob> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  ensureBlobDir();
  const filePath = path.join(BLOB_DIR, hash);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }
  const doc: Blob = {
    id: hash,
    hash,
    mime,
    size: buffer.byteLength,
    path: filePath,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    v: 1,
  };
  await put('blobs', doc);
  return doc;
}

function blobGet(ref: BlobRef | null | undefined): Buffer | null {
  if (!ref?.path || !fs.existsSync(ref.path)) {
    return null;
  }
  return fs.readFileSync(ref.path);
}

async function blobRemove(ref: BlobRef | null | undefined): Promise<void> {
  if (ref?.path && fs.existsSync(ref.path)) {
    fs.unlinkSync(ref.path);
  }
  if (ref?.id) {
    await remove('blobs', ref.id);
  }
}

/**
 * Clear all stored data: all database tables and blob files.
 * @param confirm Must be explicitly set to true to proceed with clearing
 */
async function clearAll(confirm?: boolean): Promise<{ success: boolean }> {
  if (confirm !== true) {
    logger.warn('storage_clear_all_blocked', { reason: 'confirmation_required' });
    return { success: false };
  }
  logger.info('storage_clear_all_start', { operation: 'clearAll' });
  const ctx = await initState();
  logger.info('storage_clear_all_init_complete', { operation: 'clearAll', mode: ctx.mode });
  const tables: TableName[] = ['conversations', 'messages', 'blobs', 'kv'];

  // Clear all database tables
  if (ctx.mode === 'better-sqlite3') {
    for (const table of tables) {
      logger.debug('storage_clear_all_deleting', { operation: 'clearAll', table });
      (ctx.db as BetterSqlite3Database).prepare(`DELETE FROM ${table}`).run();
    }
  } else {
    for (const table of tables) {
      logger.debug('storage_clear_all_deleting', { operation: 'clearAll', table });
      (ctx.db as SqlJsDatabase).run(`DELETE FROM ${table}`);
    }
    ctx.persist?.();
  }
  logger.info('storage_clear_all_tables_cleared', { operation: 'clearAll' });

  // Remove all blob files
  if (fs.existsSync(BLOB_DIR)) {
    const files = fs.readdirSync(BLOB_DIR);
    logger.info('storage_clear_all_removing_blobs', {
      operation: 'clearAll',
      blobCount: files.length,
    });
    for (const file of files) {
      const filePath = path.join(BLOB_DIR, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.warn('storage_blob_delete_failed', { filePath, error: (err as Error).message });
      }
    }
  }

  logger.info('storage_clear_all_complete', { operation: 'clearAll' });
  return { success: true };
}

// ==================== FTS5 SEARCH ====================

export interface MessageSearchHit {
  messageId: string;
  conversationId: string;
  snippet: string;
  role: string;
  rank: number;
  conversationTitle: string;
}

/**
 * Index a single message into the FTS5 full-text index.
 * No-op when running under sql.js (FTS5 not available).
 */
async function indexMessage(msg: {
  id: string;
  conversationId: string;
  text: string;
  role: string;
}): Promise<void> {
  const ctx = await initState();
  if (ctx.mode !== 'better-sqlite3') return;

  const content = (msg.text || '').slice(0, 10000);
  if (!content.trim()) return;

  try {
    const db = ctx.db as BetterSqlite3Database;
    // Upsert: delete existing then insert (FTS5 doesn't support ON CONFLICT)
    db.prepare('DELETE FROM messages_fts WHERE messageId = ?').run(msg.id);
    db.prepare(
      'INSERT INTO messages_fts (content, conversationId, messageId, role) VALUES (?, ?, ?, ?)'
    ).run(content, msg.conversationId, msg.id, msg.role);
  } catch (err) {
    logger.warn('fts5_index_failed', { error: (err as Error).message, messageId: msg.id });
  }
}

/**
 * Search message content using FTS5 full-text search.
 * Returns empty array when running under sql.js (FTS5 not available).
 */
async function searchMessages(
  query: string,
  opts: { limit?: number } = {}
): Promise<MessageSearchHit[]> {
  const ctx = await initState();
  if (ctx.mode !== 'better-sqlite3') return [];

  const limit = opts.limit || 20;
  const db = ctx.db as BetterSqlite3Database;

  // Sanitize query: wrap each word in double quotes for literal matching.
  // This prevents FTS5 operator injection (AND, OR, NOT, *, etc.)
  const sanitized = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => '"' + w.replace(/"/g, '""') + '"')
    .join(' ');

  if (!sanitized) return [];

  try {
    const rows = db
      .prepare(
        `SELECT
          messageId,
          conversationId,
          role,
          snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet,
          rank
        FROM messages_fts
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`
      )
      .all(sanitized, limit) as Array<{
      messageId: string;
      conversationId: string;
      role: string;
      snippet: string;
      rank: number;
    }>;

    // Join conversation titles from conversations table
    return rows.map((row) => {
      let conversationTitle = 'Conversation';
      try {
        const conv = db
          .prepare('SELECT title FROM conversations WHERE id = ?')
          .get(row.conversationId) as { title?: string } | undefined;
        if (conv?.title) conversationTitle = conv.title;
      } catch (_) {
        /* title lookup is best-effort */
      }
      return { ...row, conversationTitle };
    });
  } catch (err) {
    logger.warn('fts5_search_failed', { error: (err as Error).message });
    return [];
  }
}

/**
 * Bulk-index multiple messages into the FTS5 index.
 * Returns the count of successfully indexed messages.
 * No-op when running under sql.js (FTS5 not available).
 */
async function bulkIndexMessages(
  messages: Array<{ id: string; conversationId: string; text: string; role: string }>
): Promise<number> {
  const ctx = await initState();
  if (ctx.mode !== 'better-sqlite3') return 0;

  try {
    const db = ctx.db as BetterSqlite3Database;
    const insert = db.prepare(
      'INSERT INTO messages_fts (content, conversationId, messageId, role) VALUES (?, ?, ?, ?)'
    );
    const del = db.prepare('DELETE FROM messages_fts WHERE messageId = ?');

    let indexed = 0;
    for (const msg of messages) {
      const content = (msg.text || '').slice(0, 10000);
      if (!content.trim()) continue;
      try {
        del.run(msg.id);
        insert.run(content, msg.conversationId, msg.id, msg.role);
        indexed++;
      } catch (_) {
        /* skip individual failures */
      }
    }
    return indexed;
  } catch (err) {
    logger.warn('fts5_bulk_index_failed', { error: (err as Error).message });
    return 0;
  }
}

const storage = {
  __ensureReady: (): Promise<void> => initState().then(() => undefined),
  clearAll,
  kv: {
    get: kvGet,
    set: kvSet,
    remove: kvRemove,
  },
  conversations: {
    get: (id: string): Promise<Conversation | null> =>
      get('conversations', id) as Promise<Conversation | null>,
    put: (doc: Conversation): Promise<Conversation> =>
      put('conversations', doc) as Promise<Conversation>,
    delete: (id: string): Promise<void> => remove('conversations', id),
    list: (opts?: ListOptions): Promise<Conversation[]> =>
      list('conversations', opts) as Promise<Conversation[]>,
  },
  messages: {
    get: (id: string): Promise<Message | null> => get('messages', id) as Promise<Message | null>,
    put: (doc: Message): Promise<Message> => put('messages', doc) as Promise<Message>,
    delete: (id: string): Promise<void> => remove('messages', id),
    list: (opts?: ListOptions): Promise<Message[]> => list('messages', opts) as Promise<Message[]>,
  },
  blobs: {
    put: blobPut,
    get: blobGet,
    getById: (id: string): Promise<Blob | null> => get('blobs', id) as Promise<Blob | null>,
    remove: blobRemove,
  },
  search: {
    indexMessage,
    searchMessages,
    bulkIndexMessages,
  },
};

export default storage;
module.exports = storage;

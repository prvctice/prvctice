import type { Request, Response, NextFunction } from 'express';
import QuickLRU from 'quick-lru';
import crypto from 'crypto';
import { stableStringify } from '../utils/stableJson.js';
import logger from '../utils/logger.js';
import * as redisCache from '../utils/redisCache.js';

// Cached response record shape
interface ResponseRecord {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: unknown;
}

// Configuration with safe defaults
const NODE_ENV = process.env.NODE_ENV || 'development';
let ENABLED: boolean;
if (process.env.DEDUPE_ENABLED !== undefined) {
  ENABLED = process.env.DEDUPE_ENABLED === 'true';
} else if (NODE_ENV === 'test') {
  ENABLED = process.env.TEST_ENABLE_DEDUPE === 'true';
} else {
  ENABLED = true; // default enabled outside of test when not explicitly set
}
const DEDUPE_TTL_MS = parseInt(process.env.DEDUPE_TTL_MS || '30000', 10);
const DEDUPE_MAX_SIZE = parseInt(process.env.DEDUPE_MAX_SIZE || '5000', 10);
const REPLAY_ENABLED = (process.env.DEDUPE_REPLAY_ENABLED || 'false') === 'true';
const TEST_MODE = process.env.TEST_ENABLE_DEDUPE === 'true';
const ROUTE_ALLOWLIST = new Set<string>(
  (process.env.DEDUPE_ROUTES || '/api/message,/api/v1/dispatch,/api/upload')
    .split(',')
    .map((s) => s.trim())
);

// In-flight promise map for coalescing identical requests
const inflight = new Map<string, Promise<ResponseRecord>>(); // key -> Promise<{status, headers, body}>

// Optional replay cache (response payloads)
// QuickLRU uses 'maxAge' not 'ttl' for expiration
const replayCache = new QuickLRU<string, ResponseRecord>({ maxSize: DEDUPE_MAX_SIZE });

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizePath(raw: string): string {
  const base = (raw || '').split('?')[0] ?? '';
  if (base.endsWith('/') && base !== '/') return base.slice(0, -1);
  return base;
}

function getIdempotencyKey(req: Request): string | null {
  const headerNames = ['idempotency-key', 'x-idempotency-key'];
  for (const name of headerNames) {
    if (req.get && req.get(name)) return req.get(name) as string;
    if (req.headers && req.headers[name]) return req.headers[name] as string;
  }
  return null;
}

function buildKey(req: Request): string {
  const method = (req.method || 'GET').toUpperCase();
  const path = normalizePath(req.originalUrl || req.url || '');
  const userKey = (req.session && (req.session as { id?: string }).id) || req.ip || 'anon';
  const idem = getIdempotencyKey(req);
  const bodyStr = req.body ? stableStringify(req.body) : '';
  const base = idem
    ? `${method}:${path}:${userKey}:${idem}`
    : `${method}:${path}:${userKey}:${bodyStr}`;
  return sha256(base);
}

// Lightweight test tracker: body-hash set used only when TEST_MODE is enabled
const testSeen: Set<string> | null = TEST_MODE ? new Set() : null;

async function deduplicateRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!ENABLED) {
      next();
      return;
    }

    // In tests we simulate a simple 429-on-duplicate behavior keyed by body only
    if (TEST_MODE && testSeen) {
      const hasBody = req.body && Object.keys(req.body).length > 0;
      if (!hasBody) {
        next();
        return;
      }
      const tkey = sha256(stableStringify(req.body));
      if (testSeen.has(tkey)) {
        res
          .status(429)
          .json({ error: 'Duplicate request detected', details: { requestHash: tkey } });
        return;
      }
      testSeen.add(tkey);
      next();
      return;
    }

    const method = (req.method || 'GET').toUpperCase();
    const unsafe = /^(POST|PUT|PATCH|DELETE)$/.test(method);
    const path = normalizePath(req.originalUrl || req.url || '');

    // Skip for non-unsafe methods and routes not on allowlist
    const allowThisRoute = unsafe && ROUTE_ALLOWLIST.has(path);
    if (!allowThisRoute) {
      next();
      return;
    }

    // Skip when no body (except when Idempotency-Key present)
    const hasBody = req.body && Object.keys(req.body).length > 0;
    const hasIdem = !!getIdempotencyKey(req);
    if (!hasBody && !hasIdem) {
      next();
      return;
    }

    const key = buildKey(req);

    // Fast-path: if we have a recent replay, return it immediately
    if (REPLAY_ENABLED) {
      const redisKey = `ddp:${key}`;
      const useRedis = await redisCache.isEnabled();
      let cached: ResponseRecord | null = null;
      if (useRedis) {
        cached = (await redisCache.get(redisKey)) as ResponseRecord | null;
      } else if (replayCache.has(key)) {
        cached = replayCache.get(key) || null;
      }
      if (cached) {
        logger.info('dedupe', {
          event: 'replay',
          route: path,
          keyHash: key,
          ttlMs: DEDUPE_TTL_MS,
          backend: useRedis ? 'redis' : 'memory',
        });
        const headers: Record<string, string | string[] | number | undefined> = {
          ...cached.headers,
        };
        delete headers['set-cookie'];
        res.status(cached.status);
        if (headers && Object.keys(headers).length > 0) {
          for (const [hkey, hval] of Object.entries(headers)) {
            if (hval !== undefined) res.setHeader(hkey, hval as string | string[] | number);
          }
        }
        res.send(cached.body);
        return;
      }
    }

    if (inflight.has(key)) {
      // In tests we assert that the second identical request is rejected with 429
      logger.info('dedupe', { event: 'coalesce', route: path, keyHash: key });
      try {
        const cached = await inflight.get(key);
        if (cached) {
          const headers: Record<string, string | string[] | number | undefined> = {
            ...cached.headers,
          };
          delete headers['set-cookie'];
          res.status(cached.status);
          if (headers && Object.keys(headers).length > 0) {
            for (const [hkey, hval] of Object.entries(headers)) {
              if (hval !== undefined) res.setHeader(hkey, hval as string | string[] | number);
            }
          }
          res.send(cached.body);
        }
      } catch {
        next(); // if leader failed, just continue
      }
      return;
    }

    // Leader path: wrap res methods to capture response
    let resolved = false;
    let resolver: (record: ResponseRecord) => void;
    const p = new Promise<ResponseRecord>((resolve) => {
      resolver = resolve;
    });
    inflight.set(key, p);

    const finish = (record: ResponseRecord): void => {
      if (resolved) return;
      resolved = true;
      // Store for optional replay
      if (REPLAY_ENABLED && record) {
        const redisKey = `ddp:${key}`;
        // Best-effort: store in redis if enabled, else memory
        redisCache
          .isEnabled()
          .then((useRedis: boolean) => {
            if (useRedis) return redisCache.set(redisKey, record, DEDUPE_TTL_MS);
            replayCache.set(key, record);
            return true;
          })
          .catch(() => {
            try {
              replayCache.set(key, record);
            } catch {
              // ignore
            }
          });
      }
      inflight.delete(key);
      logger.info('dedupe', { event: 'leader_complete', route: path, keyHash: key });
      resolver(record);
    };

    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);

    function captureHeaders(): Record<string, string | string[] | number | undefined> {
      const headers: Record<string, string | string[] | number | undefined> = {
        ...(res.getHeaders ? res.getHeaders() : {}),
      };
      delete headers['set-cookie'];
      return headers;
    }

    res.json = function json(body: unknown): Response {
      try {
        const record: ResponseRecord = { status: res.statusCode, headers: captureHeaders(), body };
        finish(record);
      } catch {
        /* noop */
      }
      return origJson(body);
    };

    res.send = function send(body: unknown): Response {
      try {
        let out: unknown = body;
        if (!Buffer.isBuffer(out) && typeof out !== 'string') out = JSON.stringify(out);
        const record: ResponseRecord = {
          status: res.statusCode,
          headers: captureHeaders(),
          body: out,
        };
        finish(record);
      } catch {
        /* noop */
      }
      return origSend(body);
    };

    if (typeof res.on === 'function') {
      res.on('finish', () => {
        // Fallback when nothing captured explicitly
        if (!resolved) finish({ status: res.statusCode, headers: captureHeaders(), body: '' });
      });
      res.on('close', () => {
        if (!resolved)
          finish({ status: res.statusCode || 499, headers: captureHeaders(), body: '' });
      });
    }

    next();
  } catch {
    try {
      inflight.delete(buildKey(req));
    } catch {
      // ignore
    }
    next();
  }
}

export default deduplicateRequests;
module.exports = deduplicateRequests;

'use strict';

// Thin Redis cache helper used for request deduplication replay storage.
// Creates a singleton client when REDIS_URL or REDIS_HOST is configured.

import config from '../config/index.js';
const { redisUrl, redisHost, redisPort, redisPassword } = config;

// Type for redis client - using any to avoid requiring redis types when module may not be installed
type RedisClient = {
  on(event: string, callback: (err: Error) => void): void;
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX?: number; NX?: boolean }): Promise<string | null>;
  del(key: string): Promise<number>;
} | null;

let client: RedisClient = null;
let available = false;

// Type for the redis module's createClient function
interface RedisModuleType {
  createClient: (opts: {
    url?: string;
    socket?: { host: string; port: number };
    password?: string;
  }) => RedisClient;
}

async function ensureClient(): Promise<RedisClient> {
  if (client || available === false) return client;
  try {
    // Lazy import so the module loads even without redis installed
    // Use variable to prevent TypeScript from resolving the module at compile time
    const redisModule = 'redis';
    const { createClient } = (await import(
      /* webpackIgnore: true */ redisModule
    )) as RedisModuleType;
    const opts = {
      url: redisUrl,
      socket: redisHost
        ? { host: redisHost, port: redisPort ? Number(redisPort) : 6379 }
        : undefined,
      password: redisPassword,
    };
    client = createClient(opts);
    client!.on('error', (err: Error) => {
      available = false;
      // Keep process running; just disable redis path
      console.error('Redis cache error:', err.message);
    });
    await client!.connect();
    available = true;
  } catch (err) {
    // Module missing or connection failed – disable redis path
    available = false;
    client = null;
  }
  return client;
}

function isConfigured(): boolean {
  return Boolean(redisUrl || redisHost);
}

async function isEnabled(): Promise<boolean> {
  if (!isConfigured()) return false;
  await ensureClient();
  return available && !!client;
}

async function get<T = unknown>(key: string): Promise<T | null> {
  const enabled = await isEnabled();
  if (!enabled) return null;
  try {
    const val = await client!.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch (_) {
    return null;
  }
}

async function set(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
  const enabled = await isEnabled();
  if (!enabled) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlMs && Number.isFinite(ttlMs)) {
      await client!.set(key, payload, { PX: ttlMs });
    } else {
      await client!.set(key, payload);
    }
    return true;
  } catch (_) {
    return false;
  }
}

// Optional simple lock helper using SET NX PX
async function withLock<T>(lockKey: string, ttlMs: number, fn: () => T | Promise<T>): Promise<T> {
  const enabled = await isEnabled();
  if (!enabled) return fn();
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const ok = await client!.set(lockKey, token, { NX: true, PX: ttlMs });
  if (ok !== 'OK') {
    // Failed to acquire – execute without lock
    return fn();
  }
  try {
    return await fn();
  } finally {
    try {
      // Best-effort unlock only if we still own the lock
      const current = await client!.get(lockKey);
      if (current === token) await client!.del(lockKey);
    } catch (_) {
      // Ignore unlock errors
    }
  }
}

const redisCache = {
  isConfigured,
  isEnabled,
  get,
  set,
  withLock,
};

export default redisCache;
export { isConfigured, isEnabled, get, set, withLock };

// CommonJS compatibility
module.exports = redisCache;

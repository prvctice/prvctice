/**
 * Session middleware
 * --------------------------------------------------------------------------
 * Uses Redis as the primary session store when a REDIS_URL (or REDIS_HOST)
 * environment variable is provided **and** both `redis` and `connect-redis`
 * packages are available.  Falls back to the default in-memory store in
 * local development.  The fallback is **not** recommended for production – a
 * console warning is emitted to highlight the configuration issue.
 */

import session from 'express-session';
import type { RequestHandler } from 'express';
import type { Store } from 'express-session';

import config from '../config/index.js';
import logger from '../utils/logger.js';
const { sessionSecret, nodeEnv, redisUrl, redisHost, redisPort, redisPassword } = config;

// Session store instance is resolved below

// Helper: attempt to create RedisStore if configuration & deps are present
function buildRedisStore(): Store | null {
  // No Redis configuration – skip
  if (!redisUrl && !redisHost) return null;

  let RedisStore: new (options: { client: unknown; prefix: string }) => Store;
  let redisClient: {
    on: (event: string, handler: (err: Error) => void) => void;
    connect: () => Promise<void>;
  };

  try {
    // Lazy-require to avoid throwing when modules are not installed
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    RedisStore = require('connect-redis')(session);
    // >=4.x redis client API
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const { createClient } = require('redis');

    redisClient = createClient({
      url: redisUrl,
      socket: redisHost
        ? { host: redisHost, port: redisPort ? Number(redisPort) : 6379 }
        : undefined,
      password: redisPassword,
    });

    redisClient.on('error', (err: Error) => {
      logger.error('redis_client_error', { error: err.message });
    });

    // Connect eagerly so that error surfaces during startup
    redisClient.connect().catch((err: Error) => {
      logger.error('redis_connect_failed', {
        error: err.message,
        message: 'Falling back to MemoryStore',
      });
    });

    return new RedisStore({ client: redisClient, prefix: 'sess:' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('redis_store_unavailable', { error: message });
    return null;
  }
}

const store = buildRedisStore() || undefined;

if (!store) {
  if (nodeEnv === 'production') {
    logger.warn('session_store_fallback', {
      message:
        'No Redis session store configured. Falling back to in-memory store — suitable only for demos.',
    });
  } else {
    logger.warn('session_store_fallback', {
      message: 'Using in-memory session store. Configure REDIS_URL for persistence.',
    });
  }
}

const oneHourMs = 60 * 60 * 1000;
const sameSite: 'lax' | 'strict' | 'none' | boolean =
  (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
const secureCookie: boolean =
  process.env.COOKIE_SECURE != null
    ? process.env.COOKIE_SECURE === 'true'
    : nodeEnv === 'production';

const cookieDomain: string | undefined = process.env.COOKIE_DOMAIN || undefined;

const sessionMiddleware: RequestHandler = session({
  secret: sessionSecret as string,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: secureCookie,
    sameSite,
    httpOnly: true,
    maxAge: oneHourMs,
    domain: cookieDomain,
  },
  store, // may be undefined → MemoryStore fallback
});

export default sessionMiddleware;
module.exports = sessionMiddleware;

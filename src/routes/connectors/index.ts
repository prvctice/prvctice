/**
 * Backend connector Express router.
 * Dispatches POST /api/v1/connectors/:id/:method to registered handler modules.
 *
 * Every connector call goes through:
 * 1. Circuit check -- if open, try stale cache, else 503
 * 2. Cache check -- stale data used as fallback on failure
 * 3. Retry-wrapped execution -- exponential backoff (500ms, 1000ms), max 2 retries
 * 4. Cache store -- fresh result cached according to manifest TTL
 * 5. Response envelope -- { data, meta: { fresh, cachedAt, ageMs, connectorId, method } }
 *
 * Rate-limited to 10 requests per minute per appId.
 */

import crypto from 'node:crypto';
import { Router, json, type Request } from 'express';
import logger from '../../utils/logger.js';
import rateLimit from 'express-rate-limit';
import { weatherHandler } from './weather.js';
import { newsHandler } from './news.js';
import { webFetchHandler } from './webFetch.js';
import { aiHandler, aiStreamRoute } from './ai.js';
import { wikipediaHandler } from './wikipedia.js';
import { moviesHandler } from './movies.js';
import { booksHandler } from './books.js';
import { academicHandler } from './academic.js';
import { artHandler } from './art.js';
import { musicHandler } from './music.js';
import { sportsHandler } from './sports.js';
import { youtubeHandler } from './youtube.js';
import { marketsHandler } from './markets.js';
import { geocodingHandler } from './geocoding.js';
import { europeanaHandler } from './europeana.js';
import { smithsonianHandler } from './smithsonian.js';
import { locHandler } from './loc.js';
import { googleBooksHandler } from './googleBooks.js';
import { filmsHandler } from './films.js';
import { visionHandler } from './vision.js';
import { mediaToolsHandler } from './mediaTools.js';
import {
  getCached,
  setCached,
  cacheKey,
  evictExpired,
  initCacheTable,
  type ConnectorResponseMeta,
} from '../../connectors/cache.js';
import { getManifest, getAllManifests } from '../../connectors/manifests.js';
import { withRetry, isCircuitOpen, getCircuitState } from '../../services/circuitBreaker.js';

export type ServiceKeys = Readonly<Record<string, string>>;

type HandlerFn = (
  params: Record<string, unknown>,
  appId: string,
  req: Request,
  serviceKeys: ServiceKeys
) => Promise<unknown>;

const handlers: Readonly<Record<string, Readonly<Record<string, HandlerFn>>>> = {
  weather: weatherHandler as Readonly<Record<string, HandlerFn>>,
  news: newsHandler as Readonly<Record<string, HandlerFn>>,
  'web-fetch': webFetchHandler as Readonly<Record<string, HandlerFn>>,
  ai: aiHandler as Readonly<Record<string, HandlerFn>>,
  wikipedia: wikipediaHandler as Readonly<Record<string, HandlerFn>>,
  movies: moviesHandler as Readonly<Record<string, HandlerFn>>,
  books: booksHandler as Readonly<Record<string, HandlerFn>>,
  academic: academicHandler as Readonly<Record<string, HandlerFn>>,
  art: artHandler as Readonly<Record<string, HandlerFn>>,
  music: musicHandler as Readonly<Record<string, HandlerFn>>,
  sports: sportsHandler as Readonly<Record<string, HandlerFn>>,
  youtube: youtubeHandler as Readonly<Record<string, HandlerFn>>,
  markets: marketsHandler as Readonly<Record<string, HandlerFn>>,
  geocoding: geocodingHandler as Readonly<Record<string, HandlerFn>>,
  europeana: europeanaHandler as Readonly<Record<string, HandlerFn>>,
  smithsonian: smithsonianHandler as Readonly<Record<string, HandlerFn>>,
  loc: locHandler as Readonly<Record<string, HandlerFn>>,
  'google-books': googleBooksHandler as Readonly<Record<string, HandlerFn>>,
  films: filmsHandler as Readonly<Record<string, HandlerFn>>,
  vision: visionHandler as Readonly<Record<string, HandlerFn>>,
  'media-tools': mediaToolsHandler as Readonly<Record<string, HandlerFn>>,
};

/**
 * Map connector IDs to their service key field names.
 * Used to compute per-key cache scopes so different API keys
 * don't pollute each other's cache entries.
 */
const SERVICE_KEY_MAP: Readonly<Record<string, string>> = {
  movies: 'tmdb',
  films: 'tmdb',
  music: 'discogs',
  youtube: 'youtube',
  smithsonian: 'smithsonian',
};

// ==================== Cache Initialization ====================

// Initialize the cache table lazily on first import
initCacheTable();

// Periodic cache eviction every 30 minutes
const EVICTION_INTERVAL_MS = 30 * 60 * 1000;
const evictionTimer = setInterval(() => {
  try {
    const evicted = evictExpired();
    if (evicted > 0) {
      logger.info('connector_cache_eviction', { evicted });
    }
  } catch {
    // Eviction is best-effort
  }
}, EVICTION_INTERVAL_MS);

// Unref so this timer doesn't prevent process exit
if (typeof evictionTimer === 'object' && 'unref' in evictionTimer) {
  evictionTimer.unref();
}

// ==================== Helpers ====================

/**
 * Compute a key hash for per-key scoped connectors.
 * Returns undefined for shared-scope connectors.
 */
function computeKeyHash(connectorId: string, serviceKeys: ServiceKeys): string | undefined {
  const keyField = SERVICE_KEY_MAP[connectorId];
  if (!keyField) return undefined;

  const keyValue = serviceKeys[keyField];
  if (!keyValue) return undefined;

  return crypto.createHash('sha256').update(keyValue).digest('hex').slice(0, 16);
}

/**
 * Build a response metadata object.
 */
function buildMeta(
  fresh: boolean,
  cachedAt: number | null,
  ageMs: number,
  connectorId: string,
  method: string
): ConnectorResponseMeta {
  return { fresh, cachedAt, ageMs, connectorId, method };
}

// ==================== Rate Limiter ====================

const connectorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
});

// ==================== Router ====================

const router = Router();

// ==================== Health Endpoint ====================

router.get('/health', (_req, res) => {
  const allManifests = getAllManifests();
  const connectors: Record<
    string,
    { status: string; failures: number; blockedUntil?: number; reason?: string }
  > = {};

  for (const manifest of allManifests) {
    const id = manifest.id;
    const circuitState = getCircuitState(id);
    const circuitOpen = isCircuitOpen(id);

    if (circuitOpen) {
      connectors[id] = {
        status: 'degraded',
        failures: circuitState?.failures ?? 0,
        blockedUntil: circuitState?.blockedUntil,
        reason: 'Circuit breaker open — too many consecutive failures',
      };
    } else if (manifest.requiresApiKey) {
      // Can't check keys from a GET request; mark as unknown_key
      // Widget-side check passes key context
      connectors[id] = {
        status: 'unknown_key',
        failures: circuitState?.failures ?? 0,
        reason: 'Requires API key — health depends on key availability',
      };
    } else {
      connectors[id] = {
        status: 'healthy',
        failures: circuitState?.failures ?? 0,
      };
    }
  }

  res.json({ connectors });
});

// ==================== AI Streaming Endpoint ====================

router.use('/ai/stream', json(), connectorLimiter, aiStreamRoute);

// ==================== Connector Dispatch ====================

router.post('/:id/:method', json(), connectorLimiter, async (req, res) => {
  const id = req.params.id as string;
  const method = req.params.method as string;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const params = (body.params as Record<string, unknown>) ?? {};
  const appId = (body.appId as string) ?? 'unknown';
  const serviceKeys = ((body.serviceKeys as Record<string, string>) ?? {}) as ServiceKeys;

  const handler = handlers[id]?.[method];
  if (!handler) {
    res.status(404).json({
      error: `Unknown connector method: ${id}.${method}`,
    });
    return;
  }

  // Look up manifest for cache TTL
  const manifest = getManifest(id);
  const methodManifest = manifest?.methods[method];
  const cachePolicy = methodManifest?.cache ?? null;

  // Compute cache key (includes service key hash for per-key scope)
  const keyHash = cachePolicy?.scope === 'per-key' ? computeKeyHash(id, serviceKeys) : undefined;
  const key = cacheKey(id, method, params, keyHash);

  // ---- Circuit open: serve stale cache or 503 ----
  if (isCircuitOpen(id)) {
    const stale = getCached(key);
    if (stale) {
      res.json({
        data: stale.data,
        meta: buildMeta(false, stale.createdAt, stale.ageMs, id, method),
      });
      return;
    }
    res.status(503).json({
      error: 'Connector temporarily unavailable',
      code: 'CIRCUIT_OPEN',
    });
    return;
  }

  // ---- Try fresh fetch with retry ----
  try {
    const result = await withRetry(id, () => handler(params, appId, req, serviceKeys), 2);

    // Cache fresh result if manifest declares a TTL
    if (cachePolicy) {
      setCached(key, id, method, result, cachePolicy.ttlMs);
    }

    res.json({
      data: result,
      meta: buildMeta(true, Date.now(), 0, id, method),
    });
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    const axiosErr = err as { response?: { status?: number; data?: unknown } };
    const status = axiosErr.response?.status;
    logger.error('connector_request_failed', {
      connectorId: id,
      method,
      upstreamStatus: status,
      error: message,
    });

    // ---- Fallback to stale cache ----
    const stale = getCached(key);
    if (stale) {
      res.json({
        data: stale.data,
        meta: buildMeta(false, stale.createdAt, stale.ageMs, id, method),
      });
      return;
    }

    // ---- No cache available ----
    res.status(500).json({
      error: message,
      code: 'CONNECTOR_ERROR',
      meta: buildMeta(false, null, 0, id, method),
    });
  }
});

export default router;

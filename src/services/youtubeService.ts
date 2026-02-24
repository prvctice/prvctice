import { google, youtube_v3 } from 'googleapis';
import logger from '../utils/logger.js';
import { normalizeTitle } from '../utils/normalizeTitle.js';

// Lazily create YouTube API client to ensure API key is loaded from env.
// This avoids the issue where the module loads before dotenv.config() runs.
let _youtube: youtube_v3.Youtube | null = null;
let _lastKey: string | undefined = undefined;

// Timeout for individual YouTube API calls (30 seconds)
const YT_API_TIMEOUT_MS = parseInt(process.env.YT_API_TIMEOUT_MS || '30000', 10);

// Negative keywords to filter out derivative content (reviews, reactions, podcasts, etc.)
const NEGATIVE_KEYWORDS = [
  'review',
  'reaction',
  'podcast',
  'commentary',
  'explained',
  'breakdown',
  'ranking',
  'tier list',
  'reacts',
];

// Title patterns that indicate derivative content (checked after results return)
const DERIVATIVE_TITLE_PATTERNS =
  /\b(review|reaction|reacts?|podcast|commentary|explained|breakdown|ranking|tier\s*list|my\s*thoughts|analysis|first\s*time\s*(watching|listening|hearing)|watch\s*with\s*me)\b/i;

function getYouTubeClient(apiKey?: string): youtube_v3.Youtube {
  const key = apiKey || process.env.YOUTUBE_API_KEY;
  // Recreate client if key changed (or if not yet created)
  if (!_youtube || _lastKey !== key) {
    _youtube = google.youtube({
      version: 'v3',
      auth: key,
    });
    _lastKey = key;
  }
  return _youtube;
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Check if a title indicates derivative content
 */
function isDerivativeContent(title: string): boolean {
  return DERIVATIVE_TITLE_PATTERNS.test(title);
}

/**
 * Build search query with negative keywords to filter out derivative content
 */
function buildSearchQuery(query: string): string {
  if (query.includes('-review') || query.includes('-reaction') || query.length > 80) {
    return query;
  }
  const negatives = NEGATIVE_KEYWORDS.map((kw) => `-"${kw}"`).join(' ');
  return `${query} ${negatives}`;
}

export interface YouTubeVideo {
  title: string;
  description: string;
  videoId: string;
  url: string;
}

interface CacheEntry {
  expiresAt: number;
  data: YouTubeVideo[];
}

// Simple in-memory cache with TTL to dramatically cut duplicate API calls.
// Keyed by `${query}::${maxResults}`.
const CACHE_TTL_MS = parseInt(process.env.YT_CACHE_TTL_MS || '600000', 10); // default 10 minutes
const MAX_CACHE_SIZE = 500;
const cache = new Map<string, CacheEntry>();

/** Evict expired entries, then LRU (oldest-inserted) if still over limit. */
function evictCache(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const excess = cache.size - MAX_CACHE_SIZE;
    const keys = cache.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (!next.done) cache.delete(next.value);
    }
  }
}
const inFlight = new Map<string, Promise<YouTubeVideo[]>>();

export interface SearchYouTubeOptions {
  apiKey?: string;
}

/**
 * Search YouTube for embeddable videos.
 *
 * Best practices applied:
 * - Use videoEmbeddable: 'true' directly in search.list to ensure results can be embedded.
 * - Remove extra license filtering to avoid excluding Creative Commons videos that are embeddable.
 * - Validate the video IDs to ensure proper execution.
 * - Enhance error logging for better debugging.
 */
export async function searchYouTube(
  query: string,
  maxResults: number = 5,
  options: SearchYouTubeOptions = {}
): Promise<YouTubeVideo[]> {
  const { apiKey } = options;
  try {
    const q = String(query || '').trim();
    // Clamp results aggressively - reduces follow-up videos.list payload too.
    const max = Math.max(1, Math.min(maxResults || 5, 10));
    const key = `${q}::${max}`;

    logger.info('youtube_search_start', { query: q, maxResults: max, cacheKey: key });

    // Cache hit
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) {
      logger.info('youtube_search_cache_hit', { query: q, resultCount: entry.data?.length });
      return entry.data;
    }
    // Deduplicate concurrent identical requests
    const pending = inFlight.get(key);
    if (pending) {
      return await pending;
    }

    const p = (async (): Promise<YouTubeVideo[]> => {
      const youtube = getYouTubeClient(apiKey);

      // Build query with negative keywords to filter out derivative content
      const searchQuery = buildSearchQuery(q);
      // Request extra results since some will be filtered out
      const requestMax = Math.min(max * 2, 20);

      // Perform a search to retrieve video IDs only
      logger.info('youtube_api_search_request', {
        query: q,
        searchQuery,
        maxResults: requestMax,
      });
      const searchResponse = await withTimeout(
        youtube.search.list({
          part: ['id'],
          q: searchQuery,
          maxResults: requestMax,
          type: ['video'],
          videoEmbeddable: 'true',
          safeSearch: 'none',
        }),
        YT_API_TIMEOUT_MS,
        'youtube.search.list'
      );

      // Map and filter out any missing video IDs
      const videoIds = (searchResponse.data.items || [])
        .map((item) => item.id?.videoId)
        .filter((id): id is string => Boolean(id));

      logger.info('youtube_api_search_response', {
        query: q,
        videoIdsFound: videoIds.length,
        videoIds: videoIds.slice(0, 5),
      });

      if (videoIds.length === 0) return [];

      // Fetch detailed information including snippet and status
      const videoResponse = await withTimeout(
        youtube.videos.list({
          part: ['snippet', 'status'],
          id: videoIds,
        }),
        YT_API_TIMEOUT_MS,
        'youtube.videos.list'
      );

      // Return only embeddable videos, filter derivative content, and de-duplicate
      const seen = new Set<string>();
      const out: YouTubeVideo[] = [];
      for (const video of videoResponse.data.items || []) {
        if (video?.status?.embeddable !== true) continue;
        const title = video?.snippet?.title || '';
        // Skip derivative content (reviews, reactions, podcasts, etc.)
        if (isDerivativeContent(title)) {
          logger.debug('youtube_filtered_derivative', { title });
          continue;
        }
        const normKey = normalizeTitle(title);
        if (normKey && !seen.has(normKey)) {
          seen.add(normKey);
          out.push({
            title,
            description: video?.snippet?.description || '',
            videoId: video.id || '',
            url: `https://www.youtube.com/watch?v=${video.id}`,
          });
          // Stop once we have enough results
          if (out.length >= max) break;
        }
      }

      logger.info('youtube_search_results', {
        query: q,
        resultCount: out.length,
        titles: out.slice(0, 5).map((v) => v.title),
      });

      return out;
    })();

    inFlight.set(key, p);
    try {
      const result = await p;
      evictCache();
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
      return result;
    } finally {
      inFlight.delete(key);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error) || 'unknown error';
    logger.error('youtube_search_error', { error: msg });
    throw new Error(`YouTube search failed: ${msg}`);
  }
}

export interface EnsureApiKeyContext {
  resolveYouTubeApiKey?: () => string | undefined;
}

export function ensureApiKeyAvailable(options: { context?: EnsureApiKeyContext } = {}): string {
  const { context } = options;
  const { resolveYouTubeApiKey } = context || {};
  if (typeof resolveYouTubeApiKey === 'function') {
    const key = resolveYouTubeApiKey();
    if (!key || !key.trim()) {
      throw new Error('YouTube API key is not configured');
    }
    return key;
  }
  if (!process.env.YOUTUBE_API_KEY || !process.env.YOUTUBE_API_KEY.trim()) {
    throw new Error('YouTube API key is not configured');
  }
  return process.env.YOUTUBE_API_KEY;
}

export default { searchYouTube, ensureApiKeyAvailable };

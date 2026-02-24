/**
 * Library of Congress API Service
 * https://www.loc.gov/apis/json-and-yaml/
 * Free, no API key required
 * Supplemental source: fewer images per query, 5-second timeout
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://www.loc.gov';
const TIMEOUT = 5000;
const MIN_REQUEST_INTERVAL_MS = 3000; // 3 seconds between requests (20 req/min limit)

export interface LocResult {
  url: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
}

interface LocSearchResult {
  id?: string;
  title?: string;
  image_url?: string[];
  date?: string;
  contributor?: string[];
  url?: string;
}

interface LocSearchResponse {
  results?: LocSearchResult[];
  pagination?: { total?: number };
}

// Rate limiter state
let lastRequestTime = 0;

/**
 * Wait if needed to respect LoC rate limits (20 req/min).
 * Enforces a minimum 3-second gap between requests.
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (lastRequestTime > 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
    const delay = MIN_REQUEST_INTERVAL_MS - elapsed;
    logger.debug(`[loc] Rate limiting: waiting ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

/**
 * Search Library of Congress for images (photos, prints, posters, drawings)
 */
export async function searchLoC(query: string, limit: number = 4): Promise<LocResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    await enforceRateLimit();

    const response = await axios.get<LocSearchResponse>(`${BASE_URL}/photos/`, {
      params: {
        q: query.trim(),
        fo: 'json',
        c: limit * 2, // Fetch extra to filter items without images
      },
      timeout: TIMEOUT,
    });

    const items = response.data?.results || [];
    const results: LocResult[] = [];

    for (const item of items) {
      if (results.length >= limit) break;

      // CRITICAL: image_url is an ARRAY. Access first element for thumbnail.
      const imageUrl =
        Array.isArray(item.image_url) && item.image_url.length > 0 ? item.image_url[0] : null;

      if (!imageUrl) continue;

      results.push({
        url: imageUrl,
        title: item.title || 'Untitled',
        artist: Array.isArray(item.contributor) ? (item.contributor[0] ?? 'Unknown') : 'Unknown',
        date: item.date || '',
        source: 'Library of Congress',
        sourceUrl: item.url || item.id || '',
      });
    }

    logger.debug(`[loc] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[loc] Search failed:', { error: message });
    return [];
  }
}

export default { searchLoC };

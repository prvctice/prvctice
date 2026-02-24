/**
 * Discogs API Service
 * https://www.discogs.com/developers
 * Requires free API key - optional enhancement
 */
import axios, { AxiosError } from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.discogs.com';
const TIMEOUT = 10000;
const USER_AGENT = 'Prvctice/1.0 (https://prvctice.com)';

export interface DiscogsResult {
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
  format: string;
  label: string;
}

export interface DiscogsContext {
  apiKeys?: { discogs?: string };
  session?: { discogsToken?: string };
  getApiKey?: (key: string) => string | undefined;
}

interface DiscogsRelease {
  title?: string;
  year?: number;
  cover_image?: string;
  thumb?: string;
  uri?: string;
  format?: string[];
  label?: string[];
}

interface DiscogsSearchResponse {
  results?: DiscogsRelease[];
}

/**
 * Check if Discogs is available (API key configured)
 */
export function isAvailable(context: DiscogsContext = {}): boolean {
  const apiKey = resolveApiKey(context);
  return !!apiKey;
}

/**
 * Resolve Discogs API key/token from context (user-provided keys only)
 */
export function resolveApiKey(context: DiscogsContext = {}): string | null {
  // Only use user-provided keys - no env fallback
  if (context.apiKeys?.discogs) return context.apiKeys.discogs;
  if (context.session?.discogsToken) return context.session.discogsToken;
  if (typeof context.getApiKey === 'function') {
    const key = context.getApiKey('discogs');
    if (key) return key;
  }
  return null;
}

/**
 * Search Discogs for album artwork
 */
export async function searchDiscogs(
  query: string,
  limit: number = 8,
  context: DiscogsContext = {}
): Promise<DiscogsResult[]> {
  const token = resolveApiKey(context);

  if (!token) {
    logger.debug('[discogs] No API token configured, skipping');
    return [];
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const response = await axios.get<DiscogsSearchResponse>(`${BASE_URL}/database/search`, {
      params: {
        q: query.trim(),
        type: 'release',
        per_page: limit * 2,
      },
      headers: {
        'User-Agent': USER_AGENT,
        Authorization: `Discogs token=${token}`,
      },
      timeout: TIMEOUT,
    });

    const releases = response.data?.results || [];
    const results: DiscogsResult[] = [];

    for (const release of releases) {
      if (results.length >= limit) break;

      // Only include releases with cover art
      // Discogs provides thumb and cover_image URLs
      const imageUrl = release.cover_image;
      if (imageUrl && !imageUrl.includes('spacer.gif')) {
        // Parse artist and title from the release title (format: "Artist - Title")
        const parts = (release.title || '').split(' - ');
        const artist = parts.length > 1 ? (parts[0] ?? 'Unknown') : 'Unknown';
        const title = parts.length > 1 ? parts.slice(1).join(' - ') : (release.title ?? '');

        results.push({
          url: imageUrl,
          thumbnailUrl: release.thumb || imageUrl,
          title: title || 'Untitled',
          artist: artist,
          date: release.year ? String(release.year) : '',
          source: 'Discogs',
          sourceUrl: `https://www.discogs.com${release.uri || ''}`,
          format: Array.isArray(release.format) ? release.format.join(', ') : '',
          label: Array.isArray(release.label) ? (release.label[0] ?? '') : '',
        });
      }
    }

    logger.debug(`[discogs] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 401) {
      logger.warn('[discogs] Invalid API token');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[discogs] Search failed:', { error: message });
    }
    return [];
  }
}

/**
 * Get album art for a specific release
 */
export async function getAlbumArt(
  artist: string,
  album: string,
  context: DiscogsContext = {}
): Promise<DiscogsResult | null> {
  const query = `${artist} ${album}`.trim();
  const results = await searchDiscogs(query, 1, context);
  return results[0] || null;
}

export default { searchDiscogs, getAlbumArt, isAvailable, resolveApiKey };

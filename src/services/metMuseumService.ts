/**
 * Met Museum API Service
 * https://metmuseum.github.io/
 * Free, no API key required
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';
const TIMEOUT = 10000;

export interface MetMuseumResult {
  url: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  source: string;
  sourceUrl: string;
}

interface MetSearchResponse {
  objectIDs?: number[];
}

interface MetObjectResponse {
  objectID: number;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  medium?: string;
  primaryImage?: string;
  objectURL?: string;
}

/**
 * Search Met Museum collection for images
 */
export async function searchMetMuseum(
  query: string,
  limit: number = 8
): Promise<MetMuseumResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    // Search for objects
    const searchResponse = await axios.get<MetSearchResponse>(`${BASE_URL}/search`, {
      params: {
        q: query.trim(),
        hasImages: true,
      },
      timeout: TIMEOUT,
    });

    const objectIDs = searchResponse.data?.objectIDs || [];
    if (objectIDs.length === 0) {
      logger.debug(`[metMuseum] No results found for query: ${query}`);
      return [];
    }

    // Fetch details for first N objects (limit concurrent requests)
    const idsToFetch = objectIDs.slice(0, Math.min(limit * 2, 20));
    const results: MetMuseumResult[] = [];

    // Fetch in batches of 5 to avoid hammering the API
    for (let i = 0; i < idsToFetch.length && results.length < limit; i += 5) {
      const batch = idsToFetch.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (id): Promise<MetMuseumResult | null> => {
          try {
            const objResponse = await axios.get<MetObjectResponse>(`${BASE_URL}/objects/${id}`, {
              timeout: TIMEOUT,
            });
            const obj = objResponse.data;

            // Only include if it has a primary image
            if (obj.primaryImage) {
              return {
                url: obj.primaryImage,
                title: obj.title || 'Untitled',
                artist: obj.artistDisplayName || 'Unknown',
                date: obj.objectDate || '',
                medium: obj.medium || '',
                source: 'Met Museum',
                sourceUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
              };
            }
            return null;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.debug(`[metMuseum] Failed to fetch object: ${id} - ${message}`);
            return null;
          }
        })
      );

      const validResults = batchResults.filter((r): r is MetMuseumResult => r !== null);
      results.push(...validResults);
    }

    logger.debug(`[metMuseum] Found ${results.length} images for query: ${query}`);
    return results.slice(0, limit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[metMuseum] Search failed:', { error: message });
    return [];
  }
}

export default { searchMetMuseum };

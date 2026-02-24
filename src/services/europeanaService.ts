/**
 * Europeana API Service
 * https://pro.europeana.eu/page/search
 * Free, no API key required for basic searches
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.europeana.eu/record/v2/search.json';
const TIMEOUT = 10000;

// Read API key from environment, fall back to demo key for development
const API_KEY = process.env.EUROPEANA_API_KEY || 'api2demo';

export interface EuropeanaResult {
  url: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
  provider?: string;
}

interface EuropeanaItem {
  id?: string;
  guid?: string;
  title?: string | string[];
  dcCreator?: string | string[];
  year?: string | string[];
  dataProvider?: string | string[];
  edmIsShownBy?: string[];
  edmPreview?: string[];
}

interface EuropeanaSearchResponse {
  items?: EuropeanaItem[];
}

/**
 * Search Europeana for images
 */
export async function searchEuropeana(
  query: string,
  limit: number = 8
): Promise<EuropeanaResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    logger.debug('[europeana] Using API key:', { isDemo: API_KEY === 'api2demo' });

    const response = await axios.get<EuropeanaSearchResponse>(BASE_URL, {
      params: {
        wskey: API_KEY,
        query: query.trim(),
        rows: limit * 2,
        media: true,
        qf: 'TYPE:IMAGE', // Only images
      },
      timeout: TIMEOUT,
    });

    const items = response.data?.items || [];
    const results: EuropeanaResult[] = [];

    for (const item of items) {
      if (results.length >= limit) break;

      // Get the best available image URL
      let imageUrl: string | null = null;
      if (item.edmIsShownBy && item.edmIsShownBy[0]) {
        imageUrl = item.edmIsShownBy[0];
      } else if (item.edmPreview && item.edmPreview[0]) {
        imageUrl = item.edmPreview[0];
      }

      if (imageUrl) {
        results.push({
          url: imageUrl,
          title: Array.isArray(item.title)
            ? (item.title[0] ?? 'Untitled')
            : item.title || 'Untitled',
          artist: Array.isArray(item.dcCreator)
            ? (item.dcCreator[0] ?? 'Unknown')
            : item.dcCreator || 'Unknown',
          date: Array.isArray(item.year) ? (item.year[0] ?? '') : item.year || '',
          source: 'Europeana',
          sourceUrl: item.guid || `https://www.europeana.eu/item${item.id}`,
          provider: Array.isArray(item.dataProvider) ? item.dataProvider[0] : item.dataProvider,
        });
      }
    }

    logger.debug(`[europeana] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[europeana] Search failed:', { error: message });
    return [];
  }
}

export default { searchEuropeana };

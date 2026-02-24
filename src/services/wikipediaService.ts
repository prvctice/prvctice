import axios, { AxiosError } from 'axios';
import logger from '../utils/logger.js';

const WIKI_TIMEOUT_MS = 10000;

// Base URL for Wikimedia API
const BASE_URL = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org/w/api.php';

// Wikipedia requires a User-Agent header per their robot policy:
// https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT = 'Prvctice/1.0 (https://github.com/prvctice; contact@prvctice.com) axios';

export interface WikipediaArticle {
  title: string;
  snippet: string;
  url: string;
}

export interface WikimediaImage {
  title: string;
  snippet: string;
  thumbnail: string | null;
  url: string;
}

interface WikipediaSearchItem {
  title: string;
  snippet?: string;
  pageid: number;
  thumbnail?: {
    source?: string;
  };
}

interface WikipediaSearchResponse {
  query?: {
    search?: WikipediaSearchItem[];
  };
}

interface WikimediaImageFile {
  title: string;
}

interface WikimediaPagesResponse {
  query?: {
    pages?: Record<
      string,
      {
        images?: WikimediaImageFile[];
        imageinfo?: Array<{ url?: string }>;
      }
    >;
  };
}

/**
 * Search Wikipedia articles
 */
export async function searchWikipediaArticles(
  query: string,
  limit: number = 5
): Promise<WikipediaArticle[]> {
  if (!query) {
    logger.error('wikipedia_missing_query');
    return [];
  }

  try {
    const response = await axios.get<WikipediaSearchResponse>(WIKIPEDIA_BASE_URL, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        srlimit: limit,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: WIKI_TIMEOUT_MS,
    });

    if (response.data && response.data.query && Array.isArray(response.data.query.search)) {
      return response.data.query.search.map((item) => ({
        title: item.title,
        snippet: item.snippet || '',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      }));
    } else {
      logger.error('wikipedia_unexpected_response', { data: response.data });
      return [];
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error('wikipedia_search_error', {
      error: axiosError.response?.data || axiosError.message,
    });
    throw new Error('Failed to search Wikipedia articles');
  }
}

/**
 * Search for images in Wikimedia Commons
 */
export async function searchWikimediaImages(
  query: string,
  limit: number = 5
): Promise<WikimediaImage[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    logger.error('wikimedia_invalid_query');
    return [];
  }
  const trimmedQuery = query.trim();

  try {
    // Step 1: Initial search
    const response = await axios.get<WikipediaSearchResponse>(BASE_URL, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: trimmedQuery,
        format: 'json',
        srlimit: limit,
        prop: 'pageimages',
        pithumbsize: 200,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: WIKI_TIMEOUT_MS,
    });

    const initialResults = response.data.query?.search || [];

    // Step 2: Fetch thumbnails for results without them
    const detailedResults = await Promise.all(
      initialResults.map(async (result): Promise<WikimediaImage> => {
        if (result.thumbnail) {
          return {
            title: result.title,
            snippet: result.snippet?.replace(/<[^>]*>/g, '') || '',
            thumbnail: result.thumbnail?.source || null,
            url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(result.title)}`,
          };
        } else {
          // Fetch media details using pageid
          const mediaResponse = await axios.get<WikimediaPagesResponse>(BASE_URL, {
            params: {
              action: 'query',
              prop: 'images',
              pageids: result.pageid,
              format: 'json',
            },
            headers: {
              'User-Agent': USER_AGENT,
            },
            timeout: WIKI_TIMEOUT_MS,
          });

          const media = mediaResponse.data.query?.pages?.[result.pageid]?.images || [];
          const firstImage = media.find((file) => /\.(jpg|jpeg|png|gif|svg)$/i.test(file.title));

          if (firstImage) {
            // Fetch file details (e.g., thumbnail)
            const fileResponse = await axios.get<WikimediaPagesResponse>(BASE_URL, {
              params: {
                action: 'query',
                titles: firstImage.title,
                prop: 'imageinfo',
                iiprop: 'url',
                format: 'json',
              },
              headers: {
                'User-Agent': USER_AGENT,
              },
              timeout: WIKI_TIMEOUT_MS,
            });

            const pages = fileResponse.data.query?.pages || {};
            const fileDetails = Object.values(pages)[0];
            const imageUrl = fileDetails?.imageinfo?.[0]?.url || null;

            return {
              title: result.title,
              snippet: result.snippet?.replace(/<[^>]*>/g, '') || '',
              thumbnail: imageUrl,
              url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(result.title)}`,
            };
          }

          // If no images are found
          return {
            title: result.title,
            snippet: result.snippet?.replace(/<[^>]*>/g, '') || '',
            thumbnail: null,
            url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(result.title)}`,
          };
        }
      })
    );

    // Filter out results without thumbnails
    return detailedResults.filter((result): result is WikimediaImage => result.thumbnail !== null);
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error('wikimedia_search_error', {
      error: axiosError.response?.data || axiosError.message,
    });
    throw new Error('Failed to search Wikimedia images');
  }
}

export default { searchWikipediaArticles, searchWikimediaImages };

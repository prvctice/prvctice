/**
 * Open Library API Service
 * https://openlibrary.org/dev/docs/api/search
 * Free, no API key required (include User-Agent header)
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://openlibrary.org';
const TIMEOUT = 10000;
const USER_AGENT = 'Prvctice/1.0 axios';

export interface BookResult {
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  publishYear: number | null;
  source: string;
  sourceUrl: string;
  isbn: string | null;
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
}

interface OpenLibrarySearchResponse {
  docs?: OpenLibraryDoc[];
  numFound?: number;
}

/**
 * Search Open Library for books by topic/title with optional author filter.
 * Filters out results without cover images (user decision: prefer editions with covers).
 */
export async function searchOpenLibrary(
  query: string,
  limit: number = 10,
  options?: { author?: string }
): Promise<BookResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const params: Record<string, string | number> = {
      q: query.trim(),
      limit: limit * 2, // Fetch extra to compensate for cover filtering
      fields:
        'key,title,author_name,first_publish_year,cover_i,isbn,subject,number_of_pages_median',
    };

    if (options?.author) {
      params.author = options.author;
    }

    const response = await axios.get<OpenLibrarySearchResponse>(`${BASE_URL}/search.json`, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: TIMEOUT,
    });

    const docs = response.data?.docs || [];
    const results: BookResult[] = [];

    for (const doc of docs) {
      if (results.length >= limit) break;

      // Skip results without cover_i (user decision: prefer editions with cover images)
      if (!doc.cover_i) continue;

      const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
      const sourceUrl = doc.key ? `https://openlibrary.org${doc.key}` : '';
      const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0 ? (doc.isbn[0] ?? null) : null;

      results.push({
        title: doc.title || 'Untitled',
        authors: Array.isArray(doc.author_name) ? doc.author_name : [],
        description: '', // Open Library search doesn't return descriptions
        coverUrl,
        publishYear: doc.first_publish_year ?? null,
        source: 'Open Library',
        sourceUrl,
        isbn,
      });
    }

    logger.debug(`[openLibrary] Found ${results.length} books for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[openLibrary] Search failed:', { error: message });
    return [];
  }
}

export default { searchOpenLibrary };

/**
 * Google Books API Service
 * https://developers.google.com/books/docs/v1/using
 * Free for public data, no API key required
 */
import axios from 'axios';
import logger from '../utils/logger.js';
import type { BookResult } from './openLibraryService.js';

const BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const TIMEOUT = 10000;

interface GoogleBooksVolumeInfo {
  title?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  infoLink?: string;
  previewLink?: string;
}

interface GoogleBooksItem {
  id?: string;
  volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
  totalItems?: number;
  items?: GoogleBooksItem[];
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Extract ISBN from industry identifiers, preferring ISBN_13 over ISBN_10.
 */
function extractIsbn(identifiers?: Array<{ type: string; identifier: string }>): string | null {
  if (!identifiers || identifiers.length === 0) return null;

  const isbn13 = identifiers.find((id) => id.type === 'ISBN_13');
  if (isbn13) return isbn13.identifier;

  const isbn10 = identifiers.find((id) => id.type === 'ISBN_10');
  if (isbn10) return isbn10.identifier;

  return null;
}

/**
 * Search Google Books for books by topic/title with optional author filter.
 * Filters out results without cover images (user decision: prefer editions with covers).
 */
export async function searchGoogleBooks(
  query: string,
  limit: number = 10,
  options?: { author?: string }
): Promise<BookResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const searchQuery = options?.author
      ? `${query.trim()}+inauthor:${options.author}`
      : query.trim();

    const response = await axios.get<GoogleBooksResponse>(BASE_URL, {
      params: {
        q: searchQuery,
        maxResults: limit * 2, // Fetch extra for cover filtering
        printType: 'books',
        orderBy: 'relevance',
      },
      timeout: TIMEOUT,
    });

    const items = response.data?.items || [];
    const results: BookResult[] = [];

    for (const item of items) {
      if (results.length >= limit) break;

      const vol = item.volumeInfo;
      if (!vol) continue;

      // Skip results without cover images (user decision)
      const rawCover = vol.imageLinks?.thumbnail;
      if (!rawCover) continue;

      const coverUrl = rawCover.replace('http://', 'https://');
      const rawDescription = vol.description || '';
      const description = stripHtml(rawDescription).slice(0, 300);
      const publishYear = vol.publishedDate
        ? parseInt(vol.publishedDate.slice(0, 4), 10) || null
        : null;

      results.push({
        title: vol.title || 'Untitled',
        authors: vol.authors || [],
        description,
        coverUrl,
        publishYear,
        source: 'Google Books',
        sourceUrl: vol.infoLink || vol.previewLink || '',
        isbn: extractIsbn(vol.industryIdentifiers),
      });
    }

    logger.debug(`[googleBooks] Found ${results.length} books for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[googleBooks] Search failed:', { error: message });
    return [];
  }
}

export { type BookResult } from './openLibraryService.js';

export default { searchGoogleBooks };

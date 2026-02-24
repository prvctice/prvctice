/**
 * Book Search Aggregator Service
 * Queries Open Library and Google Books in parallel, deduplicates results.
 * Follows the moodBoardService.ts aggregation pattern.
 */
import logger from '../utils/logger.js';
import { searchOpenLibrary, type BookResult } from './openLibraryService.js';
import { searchGoogleBooks } from './googleBooksService.js';
import { isCircuitOpen, recordFailure, recordSuccess } from './circuitBreaker.js';

export interface BookSearchOptions {
  query: string;
  author?: string;
  limit?: number; // default 5, clamped 3-10
}

export interface BookSearchResult {
  books: BookResult[];
  sourcesResponded: number;
  sourcesTotal: number;
  error?: string;
}

/**
 * Search for books across Open Library and Google Books.
 * Queries both sources in parallel, deduplicates, and returns merged results.
 */
export async function searchBooks(options: BookSearchOptions): Promise<BookSearchResult> {
  const { query, author } = options;
  const limit = clampLimit(options.limit);

  if (!query || typeof query !== 'string' || !query.trim()) {
    return { books: [], sourcesResponded: 0, sourcesTotal: 0 };
  }

  const fetchLimit = limit * 2; // Fetch extra for dedup losses
  const searchOpts = author ? { author } : undefined;

  const searches: Array<{ name: string; promise: Promise<BookResult[]> }> = [];

  if (!isCircuitOpen('Open Library')) {
    searches.push({
      name: 'Open Library',
      promise: wrapWithCircuitBreaker(
        'Open Library',
        searchOpenLibrary(query, fetchLimit, searchOpts)
      ),
    });
  } else {
    logger.debug('[bookSearch] Open Library circuit open, skipping');
  }

  if (!isCircuitOpen('Google Books')) {
    searches.push({
      name: 'Google Books',
      promise: wrapWithCircuitBreaker(
        'Google Books',
        searchGoogleBooks(query, fetchLimit, searchOpts)
      ),
    });
  } else {
    logger.debug('[bookSearch] Google Books circuit open, skipping');
  }

  const sourcesTotal = searches.length;

  // Execute all searches in parallel
  const settled = await Promise.allSettled(searches.map((s) => s.promise));

  const allBooks: BookResult[] = [];
  let sourcesResponded = 0;

  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      sourcesResponded++;
      allBooks.push(...result.value);
    } else if (result.status === 'rejected') {
      logger.debug(`[bookSearch] ${searches[idx]?.name ?? 'Unknown'} failed:`, {
        error: result.reason,
      });
    }
  });

  // Total failure: both sources down
  if (sourcesResponded === 0 && sourcesTotal > 0) {
    return {
      books: [],
      sourcesResponded: 0,
      sourcesTotal,
      error: 'Book search unavailable. Try essay_search for academic sources instead.',
    };
  }

  const deduplicated = deduplicateBooks(allBooks);
  const finalBooks = deduplicated.slice(0, limit);

  logger.debug(
    `[bookSearch] Aggregated ${allBooks.length} -> ${deduplicated.length} deduped -> ${finalBooks.length} returned`
  );

  return {
    books: finalBooks,
    sourcesResponded,
    sourcesTotal,
  };
}

/**
 * Wrap a source search promise with circuit breaker tracking.
 */
function wrapWithCircuitBreaker(
  sourceName: string,
  searchPromise: Promise<BookResult[]>
): Promise<BookResult[]> {
  return searchPromise
    .then((results) => {
      recordSuccess(sourceName);
      return results;
    })
    .catch((err: Error) => {
      recordFailure(sourceName);
      logger.debug(`[bookSearch] ${sourceName} failed:`, { error: err.message });
      return [] as BookResult[];
    });
}

/**
 * Deduplicate books using ISBN-first, title-normalization fallback.
 * Keeps the result with higher richness score on collision.
 */
function deduplicateBooks(books: BookResult[]): BookResult[] {
  const byIsbn = new Map<string, BookResult>();
  const byTitle = new Map<string, BookResult>();
  const result: BookResult[] = [];
  const addedKeys = new Set<string>();

  for (const book of books) {
    // ISBN-based dedup (preferred)
    if (book.isbn) {
      const existing = byIsbn.get(book.isbn);
      if (existing) {
        if (scoreRichness(book) > scoreRichness(existing)) {
          byIsbn.set(book.isbn, book);
        }
        continue;
      }
      byIsbn.set(book.isbn, book);
    }

    // Title-based fallback dedup
    const normTitle = normalizeBookTitle(book.title);
    if (normTitle.length >= 5) {
      const existing = byTitle.get(normTitle);
      if (existing) {
        if (scoreRichness(book) > scoreRichness(existing)) {
          byTitle.set(normTitle, book);
        }
        continue;
      }
      byTitle.set(normTitle, book);
    } else {
      // Short or empty title, no ISBN -- just include it
      if (!book.isbn) {
        result.push(book);
      }
    }
  }

  // Merge ISBN-deduped and title-deduped, avoiding overlap
  for (const book of byIsbn.values()) {
    const key = `isbn:${book.isbn}`;
    if (!addedKeys.has(key)) {
      addedKeys.add(key);
      result.push(book);
    }
  }

  for (const book of byTitle.values()) {
    // Skip if already added via ISBN
    if (book.isbn && addedKeys.has(`isbn:${book.isbn}`)) continue;

    const titleKey = `title:${normalizeBookTitle(book.title)}`;
    if (!addedKeys.has(titleKey)) {
      addedKeys.add(titleKey);
      result.push(book);
    }
  }

  return result;
}

/**
 * Normalize a book title for deduplication.
 * Lowercase, strip subtitles after : or ;, remove non-alphanumeric, trim.
 */
function normalizeBookTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[:;]\s*.+$/, '') // strip subtitles
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Score how rich a book result's metadata is.
 * Used to pick the better result when deduplicating.
 */
function scoreRichness(book: BookResult): number {
  let score = 0;
  if (book.coverUrl) score += 3;
  if (book.description.length > 50) score += 2;
  if (book.authors.length > 0) score += 1;
  if (book.isbn) score += 1;
  return score;
}

/**
 * Clamp limit to 3-10 range, default 5.
 */
function clampLimit(limit?: number): number {
  const val = limit ?? 5;
  return Math.max(3, Math.min(10, val));
}

// Export internals for testing
export {
  deduplicateBooks as _deduplicateBooks,
  normalizeBookTitle as _normalizeBookTitle,
  scoreRichness as _scoreRichness,
  clampLimit as _clampLimit,
};

export type { BookResult } from './openLibraryService.js';

export default { searchBooks };

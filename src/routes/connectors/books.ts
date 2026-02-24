/**
 * Books connector handler.
 * Wraps openLibraryService for book search.
 * No API key required.
 */

import { searchOpenLibrary } from '../../services/openLibraryService.js';

async function search(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;
  const author = typeof params.author === 'string' ? params.author : undefined;

  const books = await searchOpenLibrary(query, limit, author ? { author } : undefined);
  return { books };
}

export const booksHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { search };
